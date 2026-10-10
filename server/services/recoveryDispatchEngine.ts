import { db } from '../store/db.js';
import { AutopilotPolicyEngine } from './autopilotPolicyEngine.js';
import { AutopilotService } from './autopilotService.js';
import { OutcomeLearningEngine } from '../learning/outcomeLearningEngine.js';
import {
  DispatchAdapterRegistry,
  IDispatchAdapter,
} from './dispatchAdapters.js';
import {
  AutonomousRecoveryWorkflow,
  DispatchChannel,
  DispatchStatus,
  RecoveryAttributionRecord,
  RecoveryDispatchRecord,
  RevenueRecoveryMetrics,
} from '../../src/types/index.js';

export class RecoveryDispatchEngine {
  /**
   * Dispatches prepared recovery outreach for an AUTONOMOUS workflow.
   * STRICT GUARD: Only opportunities and workflows classified as AUTONOMOUS may enter dispatch execution!
   * Manual Review and Blocked cases NEVER dispatch.
   */
  public static async dispatchWorkflow(
    workspaceId: string,
    workflowId: string,
    options?: {
      channel?: DispatchChannel;
      customMessage?: string;
      customSubject?: string;
    }
  ): Promise<{
    executed: boolean;
    dispatch?: RecoveryDispatchRecord;
    reason: string;
  }> {
    if (!workspaceId) throw new Error('workspaceId is required');
    if (!workflowId) throw new Error('workflowId is required');

    // 1. Fetch Workflow with multi-tenant isolation
    const workflow = db.getAutonomousWorkflowById(workspaceId, workflowId);
    if (!workflow || workflow.workspace_id !== workspaceId) {
      return {
        executed: false,
        reason: `Workflow ${workflowId} not found in workspace ${workspaceId}.`,
      };
    }

    // 2. Strict Execution Filter: Only AUTONOMOUS workflows may be dispatched!
    if (workflow.policy_decision !== 'AUTONOMOUS') {
      return {
        executed: false,
        reason: `Automated dispatch halted: Workflow policy classification is ${workflow.policy_decision}, not AUTONOMOUS.`,
      };
    }

    // Terminal state protection: Cannot dispatch already completed or cancelled workflows
    if (workflow.state === 'completed' || workflow.outcome === 'recovered') {
      return {
        executed: false,
        reason: 'Recovery dispatch bypassed: Workflow has already been successfully recovered.',
      };
    }
    if (workflow.state === 'cancelled') {
      return {
        executed: false,
        reason: 'Recovery dispatch halted: Workflow is cancelled.',
      };
    }

    // 3. Safety Check: Pause All Automation switch
    const settings = AutopilotService.getSettings(workspaceId);
    if (settings.pause_all_automation) {
      return {
        executed: false,
        reason: 'Autonomous dispatch halted: Pause All Automation master switch is active.',
      };
    }

    // 4. Fetch Opportunity and Customer
    const opportunity = db.getOpportunityById(workflow.opportunity_id, workspaceId);
    if (!opportunity || opportunity.workspace_id !== workspaceId) {
      return {
        executed: false,
        reason: `Opportunity ${workflow.opportunity_id} not found in workspace context.`,
      };
    }

    const customer = db.getCustomerById(workflow.customer_id, workspaceId) || opportunity.customer;
    const workspace = db.getWorkspace(workspaceId);

    // 5. Safety Guard: Fraud & Dispute Blocking
    if (opportunity.is_fraud || opportunity.is_chargeback) {
      return {
        executed: false,
        reason: 'Safety block: High fraud or chargeback risk detected. Outreach prohibited.',
      };
    }
    if (opportunity.has_active_dispute || (opportunity.dispute_status && opportunity.dispute_status !== 'none')) {
      return {
        executed: false,
        reason: 'Safety block: Active dispute on invoice payment. Outreach prohibited.',
      };
    }

    // 6. Safety Guard: Policy Engine Dynamic Re-evaluation
    const policyDecision = AutopilotPolicyEngine.evaluate(opportunity, customer, workspace, settings);
    if (policyDecision.decision !== 'AUTONOMOUS') {
      return {
        executed: false,
        reason: `Safety block: Policy Engine dynamic re-evaluation classified case as ${policyDecision.decision} (${policyDecision.reason}).`,
      };
    }

    // 7. Safety Guard: VIP Customer Protection
    if (customer?.is_vip && settings.vip_customer_protection) {
      return {
        executed: false,
        reason: 'Safety block: VIP Customer Protection is active. Manual concierge review required.',
      };
    }

    // 8. Safety Guard: Enterprise Account Protection
    const isEnterprise =
      customer?.is_enterprise ||
      customer?.account_type === 'enterprise' ||
      customer?.tier?.toLowerCase() === 'enterprise';
    if (isEnterprise && settings.enterprise_account_protection) {
      return {
        executed: false,
        reason: 'Safety block: Enterprise Account Protection is active. Executive approval required.',
      };
    }

    // 9. Safety Guard: Recovery Limit Threshold
    const isINR = (workflow.currency || opportunity.currency || workspace?.currency || '').toUpperCase() === 'INR';
    const effectiveLimitCents =
      typeof settings.auto_recover_limit_cents === 'number' && (!isINR || settings.auto_recover_limit_cents !== 50000)
        ? settings.auto_recover_limit_cents
        : (isINR ? 5000000 : 50000);

    if (workflow.amount_at_risk_cents > effectiveLimitCents) {
      const sym = isINR ? '₹' : '$';
      return {
        executed: false,
        reason: `Safety block: Recovery amount (${sym}${(workflow.amount_at_risk_cents / 100).toFixed(2)}) exceeds maximum autonomous limit (${sym}${(effectiveLimitCents / 100).toFixed(2)}).`,
      };
    }

    // 10. Channel Selection & Preparation with Closed-Loop Optimization
    let channel: DispatchChannel;
    let channelOptimizationDetails: {
      isOptimized: boolean;
      whatChanged?: string;
      whyChanged?: string;
      evidence?: string;
      sampleSize?: number;
      confidenceLevel?: string;
      confidenceScore?: number;
    } = { isOptimized: false };

    if (options?.channel) {
      // Explicit caller preference overrides learning engine
      channel = options.channel;
    } else {
      const optimalChannel = await OutcomeLearningEngine.getOptimalChannel(workspaceId);
      if (optimalChannel.isOptimized) {
        channel = optimalChannel.channel;
        channelOptimizationDetails = {
          isOptimized: true,
          whatChanged: optimalChannel.whatChanged,
          whyChanged: optimalChannel.reason,
          evidence: optimalChannel.evidence,
          sampleSize: optimalChannel.sampleSize,
          confidenceLevel: optimalChannel.confidence,
          confidenceScore: optimalChannel.confidenceScore,
        };
      } else {
        channel = (workflow.delivery_preparation?.delivery_channel as DispatchChannel) || 'email';
      }
    }

    // 11. Deduplication Guard: Return existing active dispatch if already sent
    const existingDispatches = db.getRecoveryDispatches(workspaceId, {
      workflowId: workflow.id,
      channel,
    });
    const duplicateDispatch = existingDispatches.find(
      (d) => !['failed', 'cancelled'].includes(d.status)
    );
    if (duplicateDispatch) {
      return {
        executed: false,
        dispatch: duplicateDispatch,
        reason: `Duplicate dispatch prevented: Active ${channel.toUpperCase()} recovery already recorded with status "${duplicateDispatch.status}".`,
      };
    }

    // 12. Ensure Recovery Payment Link exists
    const linkInfo = AutopilotService.ensureOpportunityRecoveryLink(workspaceId, opportunity);
    const recoveryLinkUrl =
      linkInfo.link ||
      workflow.delivery_preparation?.recovery_link_url ||
      `/pay/${opportunity.recovery_token}`;

    // Resolve Recipient
    let recipient = '';
    if (channel === 'email') {
      recipient = customer?.email || workflow.customer_email || opportunity.customer?.email || '';
      if (!recipient || !recipient.includes('@')) {
        return {
          executed: false,
          reason: 'Cannot dispatch email: No valid customer email address on record.',
        };
      }
    } else if (channel === 'sms') {
      recipient = customer?.phone || '+15550192834';
    } else {
      recipient = recoveryLinkUrl;
    }

    // 13. Abstracted Provider Dispatch
    const adapter: IDispatchAdapter = DispatchAdapterRegistry.get(channel);
    const now = new Date();
    const nowIso = now.toISOString();

    const dispatchId = `disp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const formattedAmount = `$${(workflow.amount_at_risk_cents / 100).toFixed(2)} ${workflow.currency.toUpperCase()}`;

    const subject =
      options?.customSubject ||
      workflow.delivery_preparation?.message_subject ||
      `Action Required: Complete your payment of ${formattedAmount}`;

    const messageText =
      options?.customMessage ||
      workflow.delivery_preparation?.message_preview ||
      `Hi ${customer?.name || 'Valued Customer'}, your payment of ${formattedAmount} could not be completed. Please use your secure link to keep your service active: ${recoveryLinkUrl}`;

    // Perform dispatch via provider adapter abstraction
    const dispatchResult = await adapter.send({
      workspaceId,
      workflowId: workflow.id,
      opportunityId: opportunity.id,
      customerId: customer?.id || workflow.customer_id,
      customerName: customer?.name || workflow.customer_name || 'Valued Customer',
      recipient,
      recoveryLinkUrl,
      amountCents: workflow.amount_at_risk_cents,
      currency: workflow.currency,
      subject,
      messageText,
    });

    // 14. Record Dispatch Result
    const dispatchRecord: RecoveryDispatchRecord = {
      id: dispatchId,
      workspace_id: workspaceId,
      workflow_id: workflow.id,
      opportunity_id: opportunity.id,
      customer_id: workflow.customer_id,
      customer_name: customer?.name || workflow.customer_name,
      customer_email: customer?.email || workflow.customer_email,
      customer_phone: customer?.phone,
      channel,
      status: dispatchResult.status,
      recipient,
      recovery_link_url: recoveryLinkUrl,
      subject,
      message_body: messageText,
      amount_cents: workflow.amount_at_risk_cents,
      currency: workflow.currency,
      provider: dispatchResult.provider,
      external_message_id: dispatchResult.externalMessageId,
      scheduled_at: nowIso,
      sent_at: dispatchResult.status === 'sent' || dispatchResult.status === 'delivered' ? nowIso : undefined,
      delivered_at: dispatchResult.status === 'delivered' ? nowIso : undefined,
      failed_at: dispatchResult.status === 'failed' ? nowIso : undefined,
      failure_reason: dispatchResult.error,
      created_at: nowIso,
      updated_at: nowIso,
      metadata: {
        ...(dispatchResult.details || {}),
        isOptimized: channelOptimizationDetails.isOptimized,
        optimization: channelOptimizationDetails.isOptimized ? channelOptimizationDetails : undefined,
      },
    };

    db.createRecoveryDispatch(dispatchRecord);

    // 15. Update Workflow State & Timeline
    if (workflow.state === 'scheduled' || workflow.state === 'queued') {
      workflow.state = 'running';
    }
    workflow.updated_at = nowIso;

    if (channelOptimizationDetails.isOptimized) {
      workflow.timeline.push({
        id: `tl_disp_opt_${Date.now()}`,
        action: 'Channel Optimization Applied',
        timestamp: nowIso,
        status: 'executing',
        details: `Recovery channel dynamically optimized to ${channel.toUpperCase()}. What changed: ${channelOptimizationDetails.whatChanged}. Why: ${channelOptimizationDetails.whyChanged}. Evidence: ${channelOptimizationDetails.evidence} (Sample size: ${channelOptimizationDetails.sampleSize}, Confidence: ${channelOptimizationDetails.confidenceScore}%).`,
      });
    }

    workflow.timeline.push({
      id: `tl_disp_${Date.now()}`,
      action: `Recovery Link Dispatched via ${channel.toUpperCase()}`,
      timestamp: nowIso,
      status: dispatchResult.status,
      details: `Autonomous outreach dispatched to ${recipient}. Provider: ${dispatchResult.provider}. Message ID: ${dispatchResult.externalMessageId || 'N/A'}.${channelOptimizationDetails.isOptimized ? ` (Optimized from empirical conversion data)` : ''}`,
    });
    db.persist();

    // 16. Record Automation Event Log
    db.recordAutomationEvent(workspaceId, {
      event: 'Autonomous Recovery Dispatched',
      trigger: 'Execution Engine',
      status: dispatchResult.status === 'failed' ? 'failed' : 'completed',
      details: {
        dispatch_id: dispatchId,
        workflow_id: workflow.id,
        opportunity_id: opportunity.id,
        channel,
        recipient,
        amount_cents: workflow.amount_at_risk_cents,
      },
    });

    return {
      executed: dispatchResult.success,
      dispatch: dispatchRecord,
      reason: dispatchResult.success
        ? `Recovery outreach successfully dispatched via ${channel.toUpperCase()}.`
        : `Provider outreach failed: ${dispatchResult.error}`,
    };
  }

  /**
   * Tracks and updates the delivery status of a dispatch
   * (e.g., from provider webhook callback)
   */
  public static async recordDeliveryStatus(
    workspaceId: string,
    dispatchId: string,
    status: 'delivered' | 'failed',
    failureReason?: string
  ): Promise<RecoveryDispatchRecord | undefined> {
    const dispatch = db.getRecoveryDispatchById(workspaceId, dispatchId);
    if (!dispatch || dispatch.workspace_id !== workspaceId) return undefined;

    const now = new Date().toISOString();
    const updates: Partial<RecoveryDispatchRecord> = {
      status,
      updated_at: now,
    };

    if (status === 'delivered') {
      updates.delivered_at = now;
    } else if (status === 'failed') {
      updates.failed_at = now;
      updates.failure_reason = failureReason || 'Provider delivery failed';
    }

    const updated = db.updateRecoveryDispatch(workspaceId, dispatchId, updates);

    // Update workflow timeline
    const workflow = db.getAutonomousWorkflowById(workspaceId, dispatch.workflow_id);
    if (workflow) {
      workflow.timeline.push({
        id: `tl_deliv_${Date.now()}`,
        action: status === 'delivered' ? 'Recovery Message Delivered' : 'Delivery Failed',
        timestamp: now,
        status,
        details: status === 'delivered'
          ? `Delivery acknowledged by ${dispatch.channel.toUpperCase()} gateway.`
          : `Delivery failed: ${failureReason || 'Declined by carrier/gateway'}.`,
      });
      db.persist();
    }

    return updated;
  }

  /**
   * Tracks customer response events:
   * - opened: Customer opened recovery email / notification
   * - clicked: Customer clicked the 1-click recovery link
   */
  public static async recordCustomerResponse(
    workspaceId: string,
    dispatchId: string,
    response: 'opened' | 'clicked'
  ): Promise<RecoveryDispatchRecord | undefined> {
    const dispatch = db.getRecoveryDispatchById(workspaceId, dispatchId);
    if (!dispatch || dispatch.workspace_id !== workspaceId) return undefined;

    const now = new Date().toISOString();
    const updates: Partial<RecoveryDispatchRecord> = {
      status: response,
      updated_at: now,
    };

    if (response === 'opened') {
      updates.opened_at = now;
    } else if (response === 'clicked') {
      updates.clicked_at = now;
      if (!dispatch.opened_at) {
        updates.opened_at = now; // If clicked without prior open tracking, mark opened as well
      }
    }

    const updated = db.updateRecoveryDispatch(workspaceId, dispatchId, updates);

    // Update workflow timeline
    const workflow = db.getAutonomousWorkflowById(workspaceId, dispatch.workflow_id);
    if (workflow) {
      workflow.timeline.push({
        id: `tl_resp_${Date.now()}`,
        action: response === 'opened' ? 'Customer Opened Recovery Link' : 'Customer Clicked Recovery Link',
        timestamp: now,
        status: response,
        details: `Customer engagement recorded via ${dispatch.channel.toUpperCase()} (${response}).`,
      });
      db.persist();
    }

    // Record on customer profile timeline
    db.recordCustomerTimelineEvent({
      workspace_id: workspaceId,
      customer_id: dispatch.customer_id,
      event_type: response === 'opened' ? 'recovery_email_opened' : 'payment_link_clicked',
      title: response === 'opened' ? 'Recovery Outreach Opened' : 'Recovery Link Clicked',
      description: `Customer engaged with automated recovery outreach via ${dispatch.channel.toUpperCase()}.`,
      actor: 'Customer Self-Service',
    });

    return updated;
  }

  /**
   * Tracks payment outcome and records comprehensive Outcome Attribution.
   * Every recovery records:
   * - recovered_amount
   * - recovery_channel
   * - recovery_time
   * - workflow_id
   * - customer_id
   * - opportunity_id
   */
  public static async recordPaymentOutcome(
    workspaceId: string,
    params: {
      dispatchId?: string;
      workflowId?: string;
      opportunityId?: string;
      amountCents: number;
      currency?: string;
      channel?: DispatchChannel | 'smart_retry' | 'manual';
    }
  ): Promise<{
    success: boolean;
    attribution?: RecoveryAttributionRecord;
    workflow?: AutonomousRecoveryWorkflow;
    dispatch?: RecoveryDispatchRecord;
  }> {
    if (!workspaceId) throw new Error('workspaceId is required');

    // Resolve workflow
    let workflow: AutonomousRecoveryWorkflow | undefined;
    if (params.workflowId) {
      workflow = db.getAutonomousWorkflowById(workspaceId, params.workflowId);
    } else if (params.opportunityId) {
      workflow = db.getAutonomousWorkflowByOpportunityId(workspaceId, params.opportunityId);
    }

    // Resolve dispatch
    let dispatch: RecoveryDispatchRecord | undefined;
    if (params.dispatchId) {
      dispatch = db.getRecoveryDispatchById(workspaceId, params.dispatchId);
    } else if (workflow) {
      const dispatches = db.getRecoveryDispatches(workspaceId, { workflowId: workflow.id });
      dispatch = dispatches[0];
    }

    if (!workflow && dispatch?.workflow_id) {
      workflow = db.getAutonomousWorkflowById(workspaceId, dispatch.workflow_id);
    }

    const opportunityId = params.opportunityId || workflow?.opportunity_id || dispatch?.opportunity_id;
    if (!opportunityId) {
      throw new Error('Opportunity context required for outcome attribution');
    }

    const opportunity = db.getOpportunityById(opportunityId, workspaceId);
    const customerId = workflow?.customer_id || dispatch?.customer_id || opportunity?.customer_id || '';
    const customer = db.getCustomerById(customerId, workspaceId);

    const now = new Date();
    const nowIso = now.toISOString();
    const amountCents = params.amountCents || opportunity?.amount_at_risk_cents || workflow?.amount_at_risk_cents || 0;
    const currency = params.currency || opportunity?.currency || workflow?.currency || 'USD';
    const channel: DispatchChannel | 'smart_retry' | 'manual' =
      params.channel || dispatch?.channel || 'hosted_link';

    // 1. Mark dispatch as 'paid'
    if (dispatch && dispatch.status !== 'paid') {
      db.updateRecoveryDispatch(workspaceId, dispatch.id, {
        status: 'paid',
        paid_at: nowIso,
        updated_at: nowIso,
      });
      dispatch.status = 'paid';
      dispatch.paid_at = nowIso;
    }

    // 2. Mark workflow as 'completed' and 'recovered'
    if (workflow) {
      workflow.state = 'completed';
      workflow.outcome = 'recovered';
      workflow.completed_at = nowIso;
      workflow.updated_at = nowIso;
      workflow.timeline.push({
        id: `tl_paid_${Date.now()}`,
        action: 'Payment Recovered & Attributed',
        timestamp: nowIso,
        status: 'completed',
        details: `Autonomous recovery successfully collected $${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()} via ${channel.toUpperCase()}.`,
      });

      // Skip remaining scheduled retries
      for (const s of db.getAutonomousRetrySchedules(workspaceId, workflow.id)) {
        if (s.status === 'pending') {
          s.status = 'skipped';
        }
      }
      db.persist();
    }

    // 3. Calculate Time-to-Recovery in seconds
    const startTime = workflow?.created_at || dispatch?.created_at || opportunity?.created_at || nowIso;
    const timeToRecoverySeconds = Math.max(
      1,
      Math.round((now.getTime() - new Date(startTime).getTime()) / 1000)
    );

    // 4. Record Immutable Outcome Attribution Record
    const attributionRecord: RecoveryAttributionRecord = {
      id: `attr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspace_id: workspaceId,
      workflow_id: workflow?.id || `wf_${opportunityId}`,
      opportunity_id: opportunityId,
      customer_id: customerId,
      customer_name: customer?.name || workflow?.customer_name,
      dispatch_id: dispatch?.id,
      recovered_amount: Number((amountCents / 100).toFixed(2)),
      recovered_amount_cents: amountCents,
      currency,
      recovery_channel: channel,
      recovery_time: nowIso,
      time_to_recovery_seconds: timeToRecoverySeconds,
      metadata: {
        dispatched_channel: dispatch?.channel,
        customer_email: customer?.email,
      },
      created_at: nowIso,
    };

    db.createRecoveryAttribution(attributionRecord);

    // 5. Update Opportunity status if not already recovered
    if (opportunity && opportunity.status !== 'recovered') {
      opportunity.status = 'recovered';
      opportunity.recovered_at = nowIso;
      opportunity.recovered_amount_cents = amountCents;
      db.persist();
    }

    // 6. Record high-level Automation Event
    db.recordAutomationEvent(workspaceId, {
      event: 'Autonomous Recovery Attributed',
      trigger: 'Payment Confirmation',
      status: 'completed',
      details: {
        attribution_id: attributionRecord.id,
        amount_cents: amountCents,
        channel,
        time_to_recovery_seconds: timeToRecoverySeconds,
      },
    });

    return {
      success: true,
      attribution: attributionRecord,
      workflow,
      dispatch,
    };
  }

  /**
   * Cancels an active recovery dispatch
   */
  public static cancelDispatch(
    workspaceId: string,
    dispatchId: string,
    reason?: string
  ): RecoveryDispatchRecord {
    const dispatch = db.getRecoveryDispatchById(workspaceId, dispatchId);
    if (!dispatch || dispatch.workspace_id !== workspaceId) {
      throw new Error(`Dispatch ${dispatchId} not found in workspace ${workspaceId}`);
    }

    const now = new Date().toISOString();
    const updated = db.updateRecoveryDispatch(workspaceId, dispatchId, {
      status: 'cancelled',
      cancelled_at: now,
      failure_reason: reason || 'Cancelled by team operator',
      updated_at: now,
    });

    // Update workflow timeline
    const workflow = db.getAutonomousWorkflowById(workspaceId, dispatch.workflow_id);
    if (workflow) {
      workflow.timeline.push({
        id: `tl_cancel_disp_${Date.now()}`,
        action: 'Dispatch Cancelled',
        timestamp: now,
        status: 'cancelled',
        details: reason || 'Dispatch cancelled by team.',
      });
      db.persist();
    }

    return updated!;
  }

  public static getDispatches(
    workspaceId: string,
    filter?: { workflowId?: string; opportunityId?: string; channel?: string; status?: string }
  ): RecoveryDispatchRecord[] {
    return db.getRecoveryDispatches(workspaceId, filter);
  }

  public static getDispatchById(
    workspaceId: string,
    id: string
  ): RecoveryDispatchRecord | undefined {
    return db.getRecoveryDispatchById(workspaceId, id);
  }

  public static getAttributions(
    workspaceId: string,
    filter?: { workflowId?: string; opportunityId?: string; customerId?: string }
  ): RecoveryAttributionRecord[] {
    return db.getRecoveryAttributions(workspaceId, filter);
  }

  public static getMetrics(workspaceId: string): RevenueRecoveryMetrics {
    return db.getRevenueRecoveryMetrics(workspaceId);
  }
}
