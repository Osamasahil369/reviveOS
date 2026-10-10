import { db } from '../store/db.js';
import { EmailDeliveryEngine } from './emailDeliveryEngine.js';
import { EmailTemplateEngine } from './emailTemplateEngine.js';
import { resolveMerchantIdentity } from './emailProviderService.js';
import { AutopilotService } from './autopilotService.js';
import {
  EmailDeliveryLog,
  EmailTemplateType,
  RecoveryOpportunity,
} from '../../src/types/index.js';

export interface RecoverySequenceStepConfig {
  step: 0 | 1 | 2 | 3 | 4;
  dayOffset: 0 | 2 | 4 | 7 | 10;
  name: string;
  templateId: EmailTemplateType;
  defaultSubject: string;
}

export const RECOVERY_SEQUENCE_STEPS: RecoverySequenceStepConfig[] = [
  {
    step: 0,
    dayOffset: 0,
    name: 'Day 0: Payment Failed Notice',
    templateId: 'payment_failed',
    defaultSubject: 'Payment failed for your {{business_name}} invoice',
  },
  {
    step: 1,
    dayOffset: 2,
    name: 'Day 2: Friendly Reminder',
    templateId: 'reminder_day2',
    defaultSubject: 'Reminder: Please update payment details for {{business_name}}',
  },
  {
    step: 2,
    dayOffset: 4,
    name: 'Day 4: Outstanding Balance Reminder',
    templateId: 'reminder_day4',
    defaultSubject: 'Important: Outstanding balance for {{business_name}}',
  },
  {
    step: 3,
    dayOffset: 7,
    name: 'Day 7: Urgent Suspension Warning',
    templateId: 'urgent_reminder_day7',
    defaultSubject: 'Urgent: Action required to avoid suspension of your {{business_name}} account',
  },
  {
    step: 4,
    dayOffset: 10,
    name: 'Day 10: Final Pre-Cancellation Notice',
    templateId: 'final_attempt_day10',
    defaultSubject: 'Final Notice: Service interruption notice for {{business_name}}',
  },
];

export interface ExecuteSequenceStepResult {
  executed: boolean;
  skipped: boolean;
  reason: string;
  step: number;
  dayOffset: number;
  deliveryLog?: EmailDeliveryLog;
  recipient?: string;
  subject?: string;
}

export class RecoveryEmailEngine {
  /**
   * Helper to format currency values
   */
  public static formatAmount(cents: number, currency: string = 'USD'): string {
    const symbol = EmailTemplateEngine.getCurrencySymbol(currency);
    const formatted = (cents / 100).toFixed(2);
    return `${symbol}${formatted}`;
  }

  /**
   * Main Execution for a specific recovery sequence step
   */
  public static async executeSequenceStep(
    workspaceId: string,
    opportunityId: string,
    stepIndex: 0 | 1 | 2 | 3 | 4,
    options?: {
      trackingHost?: string;
      forceSend?: boolean;
    }
  ): Promise<ExecuteSequenceStepResult> {
    if (!workspaceId) throw new Error('workspaceId is required');
    if (!opportunityId) throw new Error('opportunityId is required');

    const stepDef = RECOVERY_SEQUENCE_STEPS.find((s) => s.step === stepIndex);
    if (!stepDef) {
      throw new Error(`Invalid sequence step index: ${stepIndex}`);
    }

    // 1. Fetch Opportunity with tenant isolation
    const opportunity = db.getOpportunityById(opportunityId, workspaceId);
    if (!opportunity || opportunity.workspace_id !== workspaceId) {
      return {
        executed: false,
        skipped: true,
        reason: `Opportunity ${opportunityId} not found in workspace context.`,
        step: stepIndex,
        dayOffset: stepDef.dayOffset,
      };
    }

    // 2. SAFETY RULE: Never send after successful recovery
    if (opportunity.status === 'recovered') {
      return {
        executed: false,
        skipped: true,
        reason: 'Payment has already been successfully recovered. Outreach halted.',
        step: stepIndex,
        dayOffset: stepDef.dayOffset,
      };
    }

    // Also check terminal states
    if (opportunity.status === 'cancelled' || opportunity.status === 'not_recoverable') {
      return {
        executed: false,
        skipped: true,
        reason: `Opportunity is marked ${opportunity.status}. Outreach halted.`,
        step: stepIndex,
        dayOffset: stepDef.dayOffset,
      };
    }

    // 3. SAFETY RULE: Never send duplicate emails (Idempotency Guard)
    if (!options?.forceSend) {
      const existingLogs = db.getRecoveryEmailLogs(workspaceId, opportunityId);
      const alreadyDispatched = existingLogs.some(
        (l) =>
          l.sequence_step === stepIndex &&
          ['sent', 'delivered', 'opened', 'clicked', 'recovered'].includes(l.status)
      );

      if (alreadyDispatched) {
        return {
          executed: false,
          skipped: true,
          reason: `Day ${stepDef.dayOffset} recovery email has already been sent for this opportunity (idempotency guard).`,
          step: stepIndex,
          dayOffset: stepDef.dayOffset,
        };
      }
    }

    // 4. Fetch Customer
    const customer = db.getCustomerById(opportunity.customer_id, workspaceId) || opportunity.customer;
    const recipientEmail = customer?.email || (opportunity as any).customer_email;

    if (!recipientEmail || !EmailDeliveryEngine.isValidEmail(recipientEmail)) {
      return {
        executed: false,
        skipped: true,
        reason: `No valid recipient email address found for customer ${opportunity.customer_id}.`,
        step: stepIndex,
        dayOffset: stepDef.dayOffset,
      };
    }

    // 5. SAFETY RULE: Respect Suppression Lists
    if (db.isEmailSuppressed(workspaceId, recipientEmail)) {
      // Record suppressed log
      const logRecord: EmailDeliveryLog = {
        id: `elog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        workspace_id: workspaceId,
        opportunity_id: opportunityId,
        customer_id: opportunity.customer_id,
        customer_name: customer?.name || 'Customer',
        to_email: recipientEmail,
        subject: `[Suppressed] Day ${stepDef.dayOffset} Notice`,
        template_id: stepDef.templateId,
        provider: 'mock',
        status: 'suppressed',
        attempts: 0,
        failover_count: 0,
        sent_at: new Date().toISOString(),
        is_recovery_email: true,
        sequence_step: stepIndex,
        error_message: 'Recipient address is suppressed (unsubscribe/bounce/complaint)',
      };
      db.recordEmailDeliveryLog(logRecord);

      return {
        executed: false,
        skipped: true,
        reason: `Recipient email ${recipientEmail} is on the workspace suppression list.`,
        step: stepIndex,
        dayOffset: stepDef.dayOffset,
        deliveryLog: logRecord,
        recipient: recipientEmail,
      };
    }

    // 6. Resolve Merchant Identity (Strictly NO ReviveOS branding)
    const providerConfig = db.getEmailProviderConfig(workspaceId);
    const workspace = db.getWorkspace(workspaceId);
    const identity = resolveMerchantIdentity(providerConfig, workspace?.name);

    // 7. Ensure Tokenized Secure Recovery Link
    const linkInfo = AutopilotService.ensureOpportunityRecoveryLink(workspaceId, opportunity);
    const rawPaymentUrl = linkInfo.link.startsWith('http')
      ? linkInfo.link
      : `${options?.trackingHost || 'https://app.reviveos.com'}${linkInfo.link.startsWith('/') ? '' : '/'}${linkInfo.link}`;

    // Generate upcoming log ID for tracking pixel & click tracking
    const pendingLogId = `elog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const trackingHost = options?.trackingHost || 'https://app.reviveos.com';

    // Click tracking URL that seamlessly redirects to the payment link
    const secureRecoveryLink = `${trackingHost}/api/email/track/click/${pendingLogId}?target=${encodeURIComponent(rawPaymentUrl)}`;

    // Calculate Due Date based on step
    const dueDays = Math.max(1, 7 - stepDef.dayOffset);
    const dueDateStr = new Date(Date.now() + dueDays * 24 * 3600 * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const formattedInvoiceAmount = this.formatAmount(
      opportunity.amount_at_risk_cents || 0,
      opportunity.currency || workspace?.currency || 'USD'
    );

    // 8. Dynamic Template Variables (Strictly satisfies Requirement 5)
    const dynamicVariables = {
      customer_name: customer?.name || 'Valued Customer',
      invoice_amount: formattedInvoiceAmount,
      due_date: dueDateStr,
      recovery_link: secureRecoveryLink,
      business_name: identity.businessName,
      // Aliases
      company_name: identity.businessName,
      amount_due: (opportunity.amount_at_risk_cents / 100).toFixed(2),
      currency: opportunity.currency || workspace?.currency || 'USD',
      currency_symbol: EmailTemplateEngine.getCurrencySymbol(opportunity.currency || workspace?.currency),
      payment_link: secureRecoveryLink,
      failure_reason: opportunity.payment_failure?.raw_error_message || 'Payment card declined by issuing bank',
      grace_period_days: dueDays,
      cancellation_date: dueDateStr,
      support_email: identity.replyToAddress,
    };

    // 9. Render Subject & Body with Dynamic Interpolation
    const rendered = EmailTemplateEngine.render(
      stepDef.templateId,
      dynamicVariables,
      {
        company_name: identity.businessName,
        support_email: identity.replyToAddress,
      }
    );

    // Embed Open Tracking Pixel (1x1 invisible GIF)
    const openTrackingPixel = `<img src="${trackingHost}/api/email/track/open/${pendingLogId}" width="1" height="1" style="display:none !important;" alt="" />`;
    const finalHtml = rendered.html.includes('</body>')
      ? rendered.html.replace('</body>', `${openTrackingPixel}</body>`)
      : `${rendered.html}${openTrackingPixel}`;

    // 10. Dispatch via Email Delivery Engine
    const sendResult = await EmailDeliveryEngine.send({
      workspaceId,
      toEmail: recipientEmail,
      customerName: dynamicVariables.customer_name,
      customerId: opportunity.customer_id,
      opportunityId,
      templateId: stepDef.templateId,
      subject: rendered.subject,
      bodyHtml: finalHtml,
      bodyText: rendered.text,
      variables: dynamicVariables,
      metadata: {
        is_recovery_email: true,
        sequence_step: stepIndex,
        day_offset: stepDef.dayOffset,
        custom_log_id: pendingLogId,
        merchant_sender: identity.senderAddress,
        merchant_business: identity.businessName,
      },
    });

    // Retrieve or patch the generated log
    const log = db.getEmailDeliveryLog(sendResult.logId || pendingLogId) || {
      id: sendResult.logId || pendingLogId,
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      customer_id: opportunity.customer_id,
      customer_name: dynamicVariables.customer_name,
      to_email: recipientEmail,
      subject: rendered.subject,
      template_id: stepDef.templateId,
      provider: sendResult.provider,
      status: sendResult.status,
      attempts: sendResult.attempts,
      failover_count: sendResult.failoverCount,
      sent_at: new Date().toISOString(),
      is_recovery_email: true,
      sequence_step: stepIndex,
      message_id: sendResult.messageId,
    };

    if (log && !log.is_recovery_email) {
      db.updateEmailDeliveryLog(log.id, {
        is_recovery_email: true,
        sequence_step: stepIndex,
      });
    }

    // 11. CUSTOMER TIMELINE INTEGRATION (Requirement 9: Recovery Email Sent)
    db.recordCustomerTimelineEvent({
      workspace_id: workspaceId,
      customer_id: opportunity.customer_id,
      event_type: 'recovery_email_sent',
      title: 'Recovery Email Sent',
      description: `Day ${stepDef.dayOffset} recovery email ("${rendered.subject}") sent to ${recipientEmail} from ${identity.senderAddress}.`,
      actor: 'System Automation',
      metadata: {
        delivery_log_id: log.id,
        sequence_step: stepIndex,
        day_offset: stepDef.dayOffset,
        template_id: stepDef.templateId,
        provider: sendResult.provider,
        message_id: sendResult.messageId,
        opportunity_id: opportunityId,
      },
    });

    return {
      executed: sendResult.success,
      skipped: false,
      reason: sendResult.success
        ? `Day ${stepDef.dayOffset} recovery email successfully dispatched.`
        : `Delivery attempt failed: ${sendResult.error}`,
      step: stepIndex,
      dayOffset: stepDef.dayOffset,
      deliveryLog: log,
      recipient: recipientEmail,
      subject: rendered.subject,
    };
  }

  /**
   * Tracks customer opening recovery email (Requirement 7 & 9)
   */
  public static async recordEmailOpened(
    logId: string
  ): Promise<EmailDeliveryLog | undefined> {
    const log = db.getEmailDeliveryLog(logId);
    if (!log) return undefined;

    const now = new Date().toISOString();
    const isFirstOpen = !log.opened_at;

    const updated = db.updateEmailDeliveryLog(logId, {
      opened_at: log.opened_at || now,
      status: log.status === 'sent' || log.status === 'delivered' ? 'opened' : log.status,
    });

    // Record on Customer Timeline on first open
    if (isFirstOpen && log.customer_id) {
      db.recordCustomerTimelineEvent({
        workspace_id: log.workspace_id,
        customer_id: log.customer_id,
        event_type: 'recovery_email_opened',
        title: 'Email Opened',
        description: `Customer opened recovery email ("${log.subject}").`,
        actor: 'Customer Activity',
        metadata: {
          delivery_log_id: logId,
          sequence_step: log.sequence_step,
          opportunity_id: log.opportunity_id,
        },
      });
    }

    return updated;
  }

  /**
   * Tracks customer clicking the recovery link (Requirement 7 & 9)
   */
  public static async recordRecoveryLinkClicked(
    logId: string
  ): Promise<EmailDeliveryLog | undefined> {
    const log = db.getEmailDeliveryLog(logId);
    if (!log) return undefined;

    const now = new Date().toISOString();
    const isFirstClick = !log.clicked_at;

    const updated = db.updateEmailDeliveryLog(logId, {
      opened_at: log.opened_at || now,
      clicked_at: log.clicked_at || now,
      status: log.status === 'recovered' ? 'recovered' : 'clicked',
    });

    // Record on Customer Timeline on first click
    if (isFirstClick && log.customer_id) {
      db.recordCustomerTimelineEvent({
        workspace_id: log.workspace_id,
        customer_id: log.customer_id,
        event_type: 'recovery_link_clicked',
        title: 'Recovery Link Clicked',
        description: `Customer clicked secure 1-click recovery link from email ("${log.subject}").`,
        actor: 'Customer Self-Service',
        metadata: {
          delivery_log_id: logId,
          sequence_step: log.sequence_step,
          opportunity_id: log.opportunity_id,
        },
      });
    }

    return updated;
  }

  /**
   * Attributes recovered revenue to the specific recovery email (Requirement 8 & 9)
   */
  public static async attributeRecovery(
    workspaceId: string,
    opportunityId: string,
    amountCents: number
  ): Promise<{
    attributed: boolean;
    deliveryLog?: EmailDeliveryLog;
  }> {
    const attributedLog = db.attributeRecoveryToEmail(workspaceId, opportunityId, amountCents);

    const opportunity = db.getOpportunityById(opportunityId, workspaceId);
    const customerId = opportunity?.customer_id || attributedLog?.customer_id;
    const formattedAmount = this.formatAmount(amountCents, opportunity?.currency || 'USD');

    // Record on Customer Timeline (Requirement 9: Payment Recovered)
    if (customerId) {
      const emailDetail = attributedLog
        ? ` (Attributed to Day ${RECOVERY_SEQUENCE_STEPS[attributedLog.sequence_step ?? 0]?.dayOffset ?? 0} email: "${attributedLog.subject}")`
        : '';

      db.recordCustomerTimelineEvent({
        workspace_id: workspaceId,
        customer_id: customerId,
        event_type: 'payment_recovered',
        title: 'Payment Recovered',
        description: `Payment of ${formattedAmount} successfully recovered!${emailDetail}`,
        actor: 'Autonomous Recovery Engine',
        metadata: {
          amount_cents: amountCents,
          opportunity_id: opportunityId,
          delivery_log_id: attributedLog?.id,
          sequence_step: attributedLog?.sequence_step,
        },
      });
    }

    return {
      attributed: Boolean(attributedLog),
      deliveryLog: attributedLog,
    };
  }
}
