import nodemailer from 'nodemailer';
import {
  EmailDeliveryLog,
  EmailDeliveryStatus,
  EmailProviderConfig,
  EmailProviderType,
  EmailTemplateType,
  EmailHealthMetrics,
} from '../../src/types/index.js';
import { db } from '../store/db.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { getSupabaseServerClient } from '../db/supabaseClient.js';
import { EmailTemplateEngine, EmailTemplateContext } from './emailTemplateEngine.js';
import {
  EmailProviderRegistry,
  resolveMerchantIdentity,
  ProviderVerificationResult,
} from './emailProviderService.js';

export interface SendEmailOptions {
  workspaceId: string;
  toEmail: string;
  customerName?: string;
  customerId?: string;
  opportunityId?: string;
  templateId?: EmailTemplateType | string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  variables?: EmailTemplateContext;
  providerOverride?: EmailProviderType;
  maxRetries?: number;
  metadata?: Record<string, any>;
  isTestSend?: boolean;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  status: EmailDeliveryStatus;
  provider: EmailProviderType;
  failoverCount: number;
  failoverHistory: Array<{ provider: EmailProviderType; error: string; timestamp: string }>;
  attempts: number;
  error?: string;
  logId?: string;
  subject: string;
  toEmail: string;
}

export class EmailDeliveryEngine {
  // Test mock interceptor hook for deterministic automated testing
  private static mockSendInterceptor?: (provider: EmailProviderType, payload: any) => Promise<{ success: boolean; messageId?: string; error?: string }>;

  public static setMockInterceptor(
    fn?: (provider: EmailProviderType, payload: any) => Promise<{ success: boolean; messageId?: string; error?: string }>
  ): void {
    this.mockSendInterceptor = fn;
  }

  /**
   * Validate email address syntax according to standard format
   */
  public static isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
  }

  /**
   * Main send method: Handles template rendering, provider priority, retries, and automatic failover
   */
  public static async send(options: SendEmailOptions): Promise<EmailDeliveryResult> {
    const {
      workspaceId,
      toEmail,
      customerName = 'Customer',
      customerId,
      opportunityId,
      templateId = 'payment_failed',
      providerOverride,
      maxRetries = 2,
      metadata = {},
      isTestSend = false,
    } = options;

    // 1. Validation & Header Injection Guard
    const cleanTo = EmailTemplateEngine.sanitizeHeader(toEmail);
    if (!this.isValidEmail(cleanTo)) {
      const errorMsg = `Invalid recipient email address: "${toEmail}"`;
      return {
        success: false,
        status: 'failed',
        provider: 'mock',
        failoverCount: 0,
        failoverHistory: [],
        attempts: 1,
        error: errorMsg,
        subject: options.subject || 'Failed Email',
        toEmail: cleanTo,
      };
    }

    // 2. Fetch workspace provider configuration & merchant identity (Strictly NO ReviveOS branding)
    const providerConfig = db.getEmailProviderConfig(workspaceId);
    const workspace = db.getWorkspace(workspaceId);
    const merchantIdentity = resolveMerchantIdentity(providerConfig, workspace?.name);
    const branding = {
      ...providerConfig.branding,
      company_name: merchantIdentity.businessName,
      support_email: merchantIdentity.replyToAddress,
    };

    // 3. Render email body and subject (or use provided custom content)
    let renderedSubject = options.subject || '';
    let renderedHtml = options.bodyHtml || '';
    let renderedText = options.bodyText || '';

    if (templateId && templateId !== 'custom') {
      const context: EmailTemplateContext = {
        customer_name: customerName,
        customer_email: cleanTo,
        business_name: merchantIdentity.businessName,
        company_name: merchantIdentity.businessName,
        brand_color: branding?.brand_color || '#4f46e5',
        support_email: merchantIdentity.replyToAddress,
        logo_url: branding?.logo_url,
        footer_text: branding?.footer_text,
        ...options.variables,
      };

      const rendered = EmailTemplateEngine.render(templateId, context, branding);
      if (!renderedSubject) renderedSubject = rendered.subject;
      if (!renderedHtml) renderedHtml = rendered.html;
      if (!renderedText) renderedText = rendered.text;
    } else {
      renderedSubject = EmailTemplateEngine.sanitizeHeader(renderedSubject || 'Important notice regarding your account');
      if (!renderedHtml) renderedHtml = `<p>${renderedSubject}</p>`;
      if (!renderedText) renderedText = renderedSubject;
    }

    // 4. Determine provider priority list
    const priorityList: EmailProviderType[] = providerOverride
      ? [providerOverride]
      : (providerConfig.provider_priority && providerConfig.provider_priority.length > 0)
        ? [...providerConfig.provider_priority]
        : ['resend', 'smtp', 'sendgrid', 'ses'];

    // Ensure mock fallback is allowed in test environments
    const isTestMode = process.env.NODE_ENV === 'test' || process.argv.some((a) => a.includes('test'));
    if (isTestMode && !priorityList.includes('mock') && !providerOverride) {
      priorityList.push('mock');
    }

    const failoverHistory: Array<{ provider: EmailProviderType; error: string; timestamp: string }> = [];
    let successfulResult: { messageId?: string; provider: EmailProviderType } | null = null;
    let finalError = '';
    let totalAttempts = 0;

    // 5. Iterate through providers in priority order (Automatic Failover)
    for (let i = 0; i < priorityList.length; i++) {
      const currentProvider = priorityList[i];
      let providerAttempts = 0;
      let providerSuccess = false;
      let lastProviderError = '';

      // Retry loop per provider
      while (providerAttempts < maxRetries && !providerSuccess) {
        providerAttempts++;
        totalAttempts++;
        try {
          // Check mock interceptor first (for tests)
          if (this.mockSendInterceptor) {
            const mockRes = await this.mockSendInterceptor(currentProvider, {
              to: cleanTo,
              subject: renderedSubject,
              html: renderedHtml,
              text: renderedText,
              workspaceId,
            });
            if (mockRes.success) {
              successfulResult = {
                messageId: mockRes.messageId || `msg_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                provider: currentProvider,
              };
              providerSuccess = true;
              break;
            } else {
              throw new Error(mockRes.error || `Mock dispatch failed for ${currentProvider}`);
            }
          }

          // Execute provider-specific dispatch
          const result = await this.dispatchViaProvider(currentProvider, {
            to: cleanTo,
            customerName,
            subject: renderedSubject,
            html: renderedHtml,
            text: renderedText,
            config: providerConfig,
            workspaceId,
            isTestSend,
          });

          successfulResult = {
            messageId: result.messageId,
            provider: currentProvider,
          };
          providerSuccess = true;
          break;
        } catch (err: any) {
          lastProviderError = err.message || `Unknown error with provider ${currentProvider}`;
          if (providerAttempts >= maxRetries) {
            failoverHistory.push({
              provider: currentProvider,
              error: lastProviderError,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      if (providerSuccess) {
        break;
      } else {
        finalError = lastProviderError;
      }
    }

    const isSuccess = !!successfulResult;
    const finalProvider = successfulResult?.provider || priorityList[0] || 'mock';
    const messageId = successfulResult?.messageId || (isSuccess ? `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` : undefined);
    const finalStatus: EmailDeliveryStatus = isSuccess ? 'sent' : 'failed';

    // 6. Record Immutable Delivery Log
    const logRecord: EmailDeliveryLog = {
      id: metadata?.custom_log_id || `elog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      customer_id: customerId,
      customer_name: customerName,
      to_email: cleanTo,
      subject: renderedSubject,
      template_id: templateId,
      provider: finalProvider,
      status: finalStatus,
      attempts: totalAttempts,
      failover_count: failoverHistory.length,
      failover_history: failoverHistory.length > 0 ? failoverHistory : undefined,
      message_id: messageId,
      error_message: isSuccess ? undefined : finalError,
      body_html: renderedHtml,
      body_text: renderedText,
      sent_at: new Date().toISOString(),
      is_recovery_email: Boolean(metadata?.is_recovery_email),
      sequence_step: typeof metadata?.sequence_step === 'number' ? metadata.sequence_step : undefined,
      metadata: {
        ...metadata,
        isTestSend,
      },
    };

    db.recordEmailDeliveryLog(logRecord);

    // Also persist to Supabase if authoritative mode is enabled
    if (isSupabaseAuthoritative()) {
      try {
        const supabase = getSupabaseServerClient();
        if (supabase) {
          await supabase.from('recovery_events').insert({
            workspace_id: workspaceId,
            opportunity_id: opportunityId || 'email_dispatch',
            event_type: 'email_sent',
            channel: 'email',
            status: isSuccess ? 'success' : 'failed',
            details: {
              delivery_log_id: logRecord.id,
              message_id: messageId,
              to: cleanTo,
              subject: renderedSubject,
              template_id: templateId,
              provider: finalProvider,
              failovers: failoverHistory.length,
            },
            created_at: new Date().toISOString(),
          });
        }
      } catch (sbErr) {
        console.warn('[EmailDeliveryEngine] Supabase event log non-fatal error:', sbErr);
      }
    }

    return {
      success: isSuccess,
      messageId,
      status: finalStatus,
      provider: finalProvider,
      failoverCount: failoverHistory.length,
      failoverHistory,
      attempts: totalAttempts,
      error: isSuccess ? undefined : finalError,
      logId: logRecord.id,
      subject: renderedSubject,
      toEmail: cleanTo,
    };
  }

  /**
   * Dispatches email via a specific provider using the pluggable EmailProviderRegistry
   */
  private static async dispatchViaProvider(
    provider: EmailProviderType,
    params: {
      to: string;
      customerName: string;
      subject: string;
      html: string;
      text: string;
      config: EmailProviderConfig;
      workspaceId: string;
      isTestSend?: boolean;
    }
  ): Promise<{ messageId: string }> {
    const { to, subject, html, text, config, workspaceId, isTestSend } = params;
    const ws = db.getWorkspace(workspaceId);
    const identity = resolveMerchantIdentity(config, ws?.name);
    const from = `${identity.fromName} <${identity.senderAddress}>`;

    const providerImpl = EmailProviderRegistry.get(provider);
    return providerImpl.send({
      to,
      from,
      replyTo: identity.replyToAddress,
      subject,
      html,
      text,
      config,
      workspaceId,
      isTestSend,
    });
  }

  /**
   * Verifies sender ownership against configured email provider
   */
  public static async verifySenderOwnership(
    workspaceId: string,
    overrideConfig?: Partial<EmailProviderConfig>
  ): Promise<ProviderVerificationResult> {
    const savedConfig = db.getEmailProviderConfig(workspaceId);
    const config: EmailProviderConfig = overrideConfig
      ? { ...savedConfig, ...overrideConfig }
      : savedConfig;
    const primaryType = config.primary_provider || 'resend';
    const providerImpl = EmailProviderRegistry.get(primaryType);
    const result = await providerImpl.verify(config);

    db.saveEmailProviderConfig(workspaceId, {
      verification_status: result.status,
      verification_error: result.error,
      verified_at: result.verified ? new Date().toISOString() : undefined,
    });

    return result;
  }

  /**
   * 1. Resend Provider
   */
  private static async sendViaResend(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    config: EmailProviderConfig;
  }): Promise<{ messageId: string }> {
    const apiKey = params.config.resend?.api_key || process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
    if (!apiKey || apiKey.includes('••••')) {
      // Check if environment has valid raw key
      const envKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
      if (!envKey) {
        throw new Error('Resend API key is unconfigured or invalid.');
      }
    }

    const activeApiKey = (!params.config.resend?.api_key || params.config.resend.api_key.includes('••••'))
      ? (process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '')
      : params.config.resend.api_key;

    const identity = resolveMerchantIdentity(params.config);
    const fromName = identity.fromName;
    const fromEmail = identity.senderAddress;
    const from = `${fromName} <${fromEmail}>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.config.resend?.reply_to || params.config.branding?.support_email,
      }),
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Resend API Error (${response.status}): ${resData.message || response.statusText}`);
    }

    return { messageId: resData.id || `resend_${Date.now()}` };
  }

  /**
   * 2. SMTP Provider
   */
  private static async sendViaSmtp(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    config: EmailProviderConfig;
  }): Promise<{ messageId: string }> {
    const smtp = params.config.smtp;
    const host = smtp?.host || process.env.SMTP_HOST;
    const port = smtp?.port || Number(process.env.SMTP_PORT) || 587;
    const secure = smtp?.secure ?? (process.env.SMTP_SECURE === 'true');
    const user = smtp?.username || process.env.SMTP_USER;
    const pass = (!smtp?.password || smtp.password.includes('••••')) ? (process.env.SMTP_PASS || '') : smtp.password;

    if (!host) {
      throw new Error('SMTP host is unconfigured.');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });

    const identity = resolveMerchantIdentity(params.config);
    const fromName = identity.fromName;
    const fromEmail = identity.senderAddress;
    const from = `"${fromName}" <${fromEmail}>`;

    const info = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: smtp?.reply_to || params.config.branding?.support_email,
    });

    return { messageId: info.messageId || `smtp_${Date.now()}` };
  }

  /**
   * 3. SendGrid Provider
   */
  private static async sendViaSendGrid(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    config: EmailProviderConfig;
  }): Promise<{ messageId: string }> {
    const apiKey = params.config.sendgrid?.api_key || process.env.SENDGRID_API_KEY;
    if (!apiKey || apiKey.includes('••••')) {
      const envKey = process.env.SENDGRID_API_KEY;
      if (!envKey) {
        throw new Error('SendGrid API key is unconfigured or invalid.');
      }
    }

    const activeApiKey = (!params.config.sendgrid?.api_key || params.config.sendgrid.api_key.includes('••••'))
      ? (process.env.SENDGRID_API_KEY || '')
      : params.config.sendgrid.api_key;

    const identity = resolveMerchantIdentity(params.config);
    const fromName = identity.fromName;
    const fromEmail = identity.senderAddress;

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: params.to }],
            subject: params.subject,
          },
        ],
        from: {
          email: fromEmail,
          name: fromName,
        },
        content: [
          {
            type: 'text/plain',
            value: params.text || params.subject,
          },
          {
            type: 'text/html',
            value: params.html,
          },
        ],
      }),
    });

    if (!response.ok) {
      const resText = await response.text().catch(() => '');
      throw new Error(`SendGrid API Error (${response.status}): ${resText || response.statusText}`);
    }

    const messageId = response.headers.get('x-message-id') || `sg_${Date.now()}`;
    return { messageId };
  }

  /**
   * 4. Mock Provider (for sandboxes and tests)
   */
  private static async sendViaMock(params: {
    to: string;
    subject: string;
    isTestSend?: boolean;
  }): Promise<{ messageId: string }> {
    return {
      messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
  }

  /**
   * Send a test email for validating configuration and template formatting
   */
  public static async sendTestEmail(
    workspaceId: string,
    toEmail: string,
    templateId: EmailTemplateType = 'payment_failed',
    providerOverride?: EmailProviderType
  ): Promise<EmailDeliveryResult> {
    const config = db.getEmailProviderConfig(workspaceId);
    const companyName = config.branding?.company_name || 'ReviveOS Workspace';

    return this.send({
      workspaceId,
      toEmail,
      customerName: 'Test Recipient',
      templateId,
      providerOverride,
      isTestSend: true,
      variables: {
        company_name: companyName,
        amount_due: '99.00',
        currency: 'USD',
        currency_symbol: '$',
        invoice_id: `test_inv_${Math.floor(Math.random() * 10000)}`,
        payment_link: `https://pay.reviveos.io/r/rec_test_${Math.random().toString(36).substring(2, 6)}`,
        subscription_name: 'Pro Subscription Plan',
        failure_reason: 'Automated Diagnostic Verification',
      },
    });
  }

  /**
   * Update status of an existing delivery log (e.g. from webhooks or tracking pixels)
   */
  public static updateDeliveryStatus(
    workspaceId: string,
    logId: string,
    status: EmailDeliveryStatus,
    details?: { openedAt?: string; clickedAt?: string; bouncedAt?: string; error?: string }
  ): EmailDeliveryLog | undefined {
    const updates: Partial<EmailDeliveryLog> = { status };
    if (details?.openedAt) updates.opened_at = details.openedAt;
    if (details?.clickedAt) updates.clicked_at = details.clickedAt;
    if (details?.bouncedAt) updates.bounced_at = details.bouncedAt;
    if (details?.error) updates.error_message = details.error;
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();

    return db.updateEmailDeliveryLog(workspaceId, logId, updates);
  }

  /**
   * Campaign Cadence Helper: Maps days past due to recovery campaign templates
   */
  public static getCampaignStepForDaysPastDue(daysPastDue: number): {
    templateId: EmailTemplateType;
    stageName: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  } {
    if (daysPastDue <= 1) {
      return {
        templateId: 'payment_failed',
        stageName: 'Day 0: Initial Decline Notice',
        urgency: 'medium',
      };
    } else if (daysPastDue <= 3) {
      return {
        templateId: 'update_payment_method',
        stageName: 'Day 2: Friendly Payment Method Reminder',
        urgency: 'medium',
      };
    } else if (daysPastDue <= 6) {
      return {
        templateId: 'update_payment_method',
        stageName: 'Day 4: Urgent Method Update Request',
        urgency: 'high',
      };
    } else if (daysPastDue <= 9) {
      return {
        templateId: 'recovery_link',
        stageName: 'Day 7: 1-Click Express Checkout Recovery Link',
        urgency: 'high',
      };
    } else {
      return {
        templateId: 'final_reminder',
        stageName: 'Day 10: Final Notice Before Service Suspension',
        urgency: 'critical',
      };
    }
  }

  /**
   * Returns authoritative health metrics for the workspace
   */
  public static getHealthMetrics(workspaceId: string): EmailHealthMetrics {
    return db.getEmailHealthMetrics(workspaceId);
  }
}
