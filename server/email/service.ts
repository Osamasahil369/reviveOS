import { EmailMessage } from '../../src/types/index.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { getSupabaseServerClient } from '../db/supabaseClient.js';

export interface EmailTemplateVariables {
  customer_name: string;
  business_name: string;
  amount_due: string;
  currency: string;
  invoice_id: string;
  payment_date: string;
  payment_link: string;
  subscription_name: string;
  days_past_due?: number;
}

export interface SendEmailPayload {
  workspaceId: string;
  opportunityId: string;
  toEmail: string;
  subjectTemplate: string;
  bodyTemplate: string;
  variables: EmailTemplateVariables;
}

export class EmailService {
  private static localEmailLogs: EmailMessage[] = [];

  static renderTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(pattern, String(value ?? ''));
    }
    return result;
  }

  static async sendRecoveryEmail(payload: SendEmailPayload): Promise<EmailMessage> {
    const isProd = isSupabaseAuthoritative();
    const configuredProvider = process.env.EMAIL_PROVIDER || (isProd ? 'resend' : 'mock');
    const apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || (isProd ? '' : 'billing@revenuerecoveryos.com');

    if (isProd) {
      if (configuredProvider === 'mock') {
        throw new Error('Mock email provider is strictly forbidden in production mode. Configure Resend or a verified provider.');
      }
      if (!fromAddress) {
        throw new Error('EMAIL_FROM_ADDRESS environment variable is required for production email dispatch.');
      }
      if (!apiKey && configuredProvider === 'resend') {
        throw new Error('Transactional email failed: RESEND_API_KEY or EMAIL_API_KEY is required in production mode.');
      }
    }

    const renderedSubject = this.renderTemplate(payload.subjectTemplate, payload.variables);
    const renderedBody = this.renderTemplate(payload.bodyTemplate, payload.variables);

    let externalId: string | undefined;
    let deliveryStatus: 'sent' | 'failed' | 'delivered' = 'sent';

    if (apiKey && configuredProvider === 'resend') {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: payload.toEmail,
            subject: renderedSubject,
            html: renderedBody,
          }),
        });

        const resData = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(`Resend API rejected email dispatch: ${resData.message || response.statusText}`);
        }
        externalId = resData.id;
        deliveryStatus = 'sent';
      } catch (err: any) {
        if (isProd) {
          throw new Error(`Failed to dispatch transactional email via Resend: ${err.message}`);
        }
        deliveryStatus = 'failed';
      }
    }

    const emailRecord: EmailMessage = {
      id: externalId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspace_id: payload.workspaceId,
      opportunity_id: payload.opportunityId,
      to_email: payload.toEmail,
      subject: renderedSubject,
      body_html: renderedBody,
      status: deliveryStatus,
      provider: configuredProvider as any,
      sent_at: new Date().toISOString(),
      opened_at: undefined, // Never fake opened_at timestamp; requires actual webhook confirmation from provider
    };

    // Store in Supabase if authoritative
    if (isProd) {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        await supabase.from('recovery_events').insert({
          workspace_id: payload.workspaceId,
          opportunity_id: payload.opportunityId,
          event_type: 'email_sent',
          channel: 'email',
          status: deliveryStatus === 'sent' ? 'success' : 'failed',
          details: {
            message_id: emailRecord.id,
            to: payload.toEmail,
            subject: renderedSubject,
            provider: configuredProvider,
            external_id: externalId,
          },
          created_at: new Date().toISOString(),
        });
      }
    }

    this.localEmailLogs.unshift(emailRecord);
    return emailRecord;
  }

  static getLocalEmailLogs(workspaceId?: string, opportunityId?: string): EmailMessage[] {
    let logs = this.localEmailLogs;
    if (workspaceId) {
      logs = logs.filter((l) => l.workspace_id === workspaceId);
    }
    if (opportunityId) {
      logs = logs.filter((l) => l.opportunity_id === opportunityId);
    }
    return logs;
  }

  static async getEmailLogs(workspaceId?: string, opportunityId?: string): Promise<EmailMessage[]> {
    if (isSupabaseAuthoritative() && workspaceId) {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        let query = supabase
          .from('recovery_events')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('event_type', 'email_sent')
          .order('created_at', { ascending: false });

        if (opportunityId) {
          query = query.eq('opportunity_id', opportunityId);
        }

        const { data } = await query;
        if (data && data.length > 0) {
          return data.map((d: any) => ({
            id: d.details?.message_id || d.id,
            workspace_id: d.workspace_id,
            opportunity_id: d.opportunity_id,
            to_email: d.details?.to || 'customer',
            subject: d.details?.subject || 'Payment Recovery Notice',
            body_html: '',
            status: d.status === 'success' ? 'sent' : 'failed',
            provider: (d.details?.provider || 'resend') as any,
            sent_at: d.created_at,
          }));
        }
      }
    }

    let logs = this.localEmailLogs;
    if (workspaceId) {
      logs = logs.filter((l) => l.workspace_id === workspaceId);
    }
    if (opportunityId) {
      logs = logs.filter((l) => l.opportunity_id === opportunityId);
    }
    return logs;
  }
}
