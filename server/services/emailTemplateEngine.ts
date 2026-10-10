import { EmailTemplateType } from '../../src/types/index.js';

export interface EmailTemplateBranding {
  company_name?: string;
  brand_color?: string;
  logo_url?: string;
  support_email?: string;
  footer_text?: string;
}

export interface EmailTemplateContext {
  customer_name?: string;
  customer_email?: string;
  company_name?: string;
  brand_color?: string;
  logo_url?: string;
  support_email?: string;
  amount_due?: string | number;
  currency?: string;
  currency_symbol?: string;
  invoice_id?: string;
  subscription_name?: string;
  payment_link?: string;
  recovery_link?: string;
  days_past_due?: number;
  failure_reason?: string;
  grace_period_days?: number;
  cancellation_date?: string;
  recovered_amount?: string | number;
  payment_method?: string;
  payment_date?: string;
  transaction_id?: string;
  // Import summary variables
  customers_count?: number;
  subscriptions_count?: number;
  invoices_count?: number;
  revenue_imported?: string | number;
  workspace_name?: string;
  workspace_url?: string;
  [key: string]: any;
}

export interface RenderedEmail {
  template_id: EmailTemplateType | string;
  subject: string;
  html: string;
  text: string;
}

export interface TemplateDefinition {
  id: EmailTemplateType;
  name: string;
  description: string;
  category: 'recovery' | 'notification' | 'onboarding';
  defaultSubject: string;
  sampleContext: EmailTemplateContext;
}

export class EmailTemplateEngine {
  /**
   * Sanitizes header values to prevent CRLF / Header Injection attacks
   */
  public static sanitizeHeader(value: string | undefined | null): string {
    if (!value) return '';
    return String(value)
      .replace(/[\r\n\x00-\x1F\x7F]+/g, ' ')
      .trim();
  }

  /**
   * Escapes HTML entities to prevent XSS in email bodies
   */
  public static escapeHtml(str: string | number | undefined | null): string {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Replace {{variable}} and {{ variable }} placeholders safely
   */
  public static substitute(template: string, context: Record<string, any>, escape: boolean = false): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
      const val = context[key];
      if (val === undefined || val === null) {
        return '';
      }
      return escape ? this.escapeHtml(val) : String(val);
    });
  }

  /**
   * Currency symbol helper
   */
  public static getCurrencySymbol(curr?: string): string {
    if (!curr) return '$';
    const c = curr.toUpperCase();
    if (c === 'INR') return '₹';
    if (c === 'EUR') return '€';
    if (c === 'GBP') return '£';
    if (c === 'CAD') return 'CA$';
    if (c === 'AUD') return 'A$';
    if (c === 'SGD') return 'S$';
    if (c === 'JPY') return '¥';
    return '$';
  }

  /**
   * Base responsive HTML wrapper for high-conversion enterprise transactional emails
   */
  private static wrapHtml(
    title: string,
    contentHtml: string,
    branding?: EmailTemplateBranding,
    context?: EmailTemplateContext
  ): string {
    const company =
      context?.business_name ||
      branding?.company_name ||
      context?.company_name ||
      'Billing Department';
    const brandColor = branding?.brand_color || context?.brand_color || '#4f46e5';
    const cleanSlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'merchant';
    const supportEmail =
      branding?.support_email ||
      context?.support_email ||
      `billing@${cleanSlug}.com`;
    const logoUrl = branding?.logo_url || context?.logo_url;
    const footerText =
      branding?.footer_text ||
      `© ${new Date().getFullYear()} ${company}. All rights reserved.`;

    const logoHtml = logoUrl
      ? `<img src="${this.escapeHtml(logoUrl)}" alt="${this.escapeHtml(company)}" style="max-height: 42px; border: 0; outline: none; text-decoration: none;" />`
      : `<div style="font-size: 22px; font-weight: 800; letter-spacing: -0.03em; color: #111827; display: flex; align-items: center;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 3px; background-color: ${brandColor}; margin-right: 8px;"></span>
          ${this.escapeHtml(company)}
        </div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${this.escapeHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%; }
    td { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; vertical-align: top; color: #334155; }
    a { color: ${brandColor}; text-decoration: none; font-weight: 600; }
    .btn-primary { background-color: ${brandColor}; border-radius: 8px; color: #ffffff !important; display: inline-block; font-size: 15px; font-weight: 700; line-height: 50px; text-align: center; text-decoration: none; width: auto; min-width: 200px; padding: 0 28px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .badge-urgent { background-color: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; border-radius: 9999px; padding: 4px 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; }
    .badge-success { background-color: #f0fdf4; color: #16a34a; border: 1px solid #dcfce7; border-radius: 9999px; padding: 4px 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; }
  </style>
</head>
<body style="background-color: #f8fafc; margin: 0; padding: 24px 0;">
  <center>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto;">
      <!-- Header -->
      <tr>
        <td style="padding: 24px 32px; text-align: left;">
          ${logoHtml}
        </td>
      </tr>
      <!-- Card Body -->
      <tr>
        <td style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 40px 36px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.04);">
          ${contentHtml}
        </td>
      </tr>
      <!-- Security & Support Footer -->
      <tr>
        <td style="padding: 32px 24px; text-align: center; font-size: 13px; color: #64748b; line-height: 1.6;">
          <div style="margin-bottom: 12px;">
            🔒 <strong>256-bit TLS Encrypted & PCI-DSS Compliant Payment Link</strong>
          </div>
          <p style="margin: 0 0 8px 0;">
            Need help? Contact our billing team at <a href="mailto:${this.escapeHtml(supportEmail)}" style="color: #475569; text-decoration: underline;">${this.escapeHtml(supportEmail)}</a>
          </p>
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">
            ${this.escapeHtml(footerText)}
          </p>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
  }

  /**
   * List all registered system templates
   */
  public static getTemplateDefinitions(): TemplateDefinition[] {
    return [
      {
        id: 'payment_failed',
        name: 'Payment Failed Notice',
        description: 'Instant notification sent immediately when a recurring subscription or invoice charge fails.',
        category: 'recovery',
        defaultSubject: 'Action Required: Your payment of {{currency_symbol}}{{amount_due}} for {{company_name}} failed',
        sampleContext: {
          customer_name: 'Alex Mercer',
          company_name: 'Acme Cloud Services',
          amount_due: '49.00',
          currency: 'USD',
          currency_symbol: '$',
          invoice_id: 'inv_89412',
          subscription_name: 'Pro Annual Plan',
          failure_reason: 'Card was declined by issuing bank',
          payment_link: 'https://pay.reviveos.io/r/rec_sample123',
          grace_period_days: 7,
        },
      },
      {
        id: 'update_payment_method',
        name: 'Update Payment Method Request',
        description: 'Friendly yet firm request for customer to update their card or billing details before service interruption.',
        category: 'recovery',
        defaultSubject: 'Please update your billing information for {{company_name}}',
        sampleContext: {
          customer_name: 'Jordan Lee',
          company_name: 'Starlight SaaS',
          amount_due: '120.00',
          currency: 'USD',
          currency_symbol: '$',
          subscription_name: 'Scale Enterprise',
          payment_link: 'https://pay.reviveos.io/r/rec_sample456',
          days_past_due: 3,
        },
      },
      {
        id: 'recovery_link',
        name: '1-Click Recovery Payment Link',
        description: 'High-conversion recovery email with a direct 1-click payment link and instant settlement checkout.',
        category: 'recovery',
        defaultSubject: '⚡ 1-Click Payment Link: Settle your balance with {{company_name}}',
        sampleContext: {
          customer_name: 'Taylor Smith',
          company_name: 'Apex Fitness',
          amount_due: '85.00',
          currency: 'INR',
          currency_symbol: '₹',
          invoice_id: 'inv_67290',
          payment_link: 'https://pay.reviveos.io/r/rec_sample789',
          grace_period_days: 5,
        },
      },
      {
        id: 'final_reminder',
        name: 'Final Notice Before Cancellation',
        description: 'Urgent final pre-churn alert sent before automatic subscription termination and account downgrade.',
        category: 'recovery',
        defaultSubject: '⚠️ FINAL NOTICE: Service suspension for {{company_name}} in {{days_past_due}} days',
        sampleContext: {
          customer_name: 'Morgan Davis',
          company_name: 'DevFlow Systems',
          amount_due: '299.00',
          currency: 'USD',
          currency_symbol: '$',
          subscription_name: 'Team Tier',
          payment_link: 'https://pay.reviveos.io/r/rec_sample999',
          days_past_due: 10,
          cancellation_date: 'tomorrow at 11:59 PM UTC',
        },
      },
      {
        id: 'payment_recovered',
        name: 'Payment Confirmation & Receipt',
        description: 'Confirmation email sent immediately when past-due balance is successfully recovered and settled.',
        category: 'notification',
        defaultSubject: '✅ Receipt: Your payment of {{currency_symbol}}{{recovered_amount}} was successfully processed',
        sampleContext: {
          customer_name: 'Alex Mercer',
          company_name: 'Acme Cloud Services',
          recovered_amount: '49.00',
          currency: 'USD',
          currency_symbol: '$',
          transaction_id: 'txn_rec_338910',
          payment_date: 'Today',
          subscription_name: 'Pro Annual Plan',
        },
      },
      {
        id: 'welcome_to_reviveos',
        name: 'Welcome to ReviveOS',
        description: 'New workspace creation and onboarding welcome email for founders and finance leaders.',
        category: 'onboarding',
        defaultSubject: 'Welcome to ReviveOS — Your Autonomous Revenue Recovery Workspace',
        sampleContext: {
          customer_name: 'Founder',
          company_name: 'ReviveOS',
          workspace_name: 'Acme Corp Recovery',
          workspace_url: 'https://app.reviveos.io/workspace/ws_main',
        },
      },
      {
        id: 'import_completed',
        name: 'Customer & Billing Import Summary',
        description: 'Immutable confirmation and metric breakdown after CSV or provider customer import.',
        category: 'notification',
        defaultSubject: '📊 Import Completed: {{customers_count}} customers successfully ingested into ReviveOS',
        sampleContext: {
          customer_name: 'Workspace Admin',
          company_name: 'ReviveOS',
          customers_count: 1240,
          subscriptions_count: 932,
          invoices_count: 1420,
          revenue_imported: '482,000',
          currency_symbol: '₹',
          workspace_name: 'Apex Fitness Mumbai',
        },
      },
    ];
  }

  /**
   * Main render method for templates
   */
  public static render(
    templateId: EmailTemplateType | string,
    rawContext: EmailTemplateContext,
    branding?: EmailTemplateBranding
  ): RenderedEmail {
    const businessName =
      rawContext.business_name ||
      rawContext.company_name ||
      branding?.company_name ||
      'Merchant Billing';

    const currencySymbol = this.getCurrencySymbol(rawContext.currency);
    const amountVal = rawContext.amount_due !== undefined ? rawContext.amount_due : '0.00';
    const invoiceAmount =
      rawContext.invoice_amount !== undefined
        ? String(rawContext.invoice_amount)
        : `${currencySymbol}${amountVal}`;

    const recoveryLink = rawContext.recovery_link || rawContext.payment_link || '#';
    const dueDate = rawContext.due_date || 'within 7 days';
    const customerName = rawContext.customer_name || 'Valued Customer';

    const context: EmailTemplateContext = {
      customer_name: customerName,
      business_name: businessName,
      company_name: businessName,
      invoice_amount: invoiceAmount,
      amount_due: amountVal,
      due_date: dueDate,
      recovery_link: recoveryLink,
      payment_link: recoveryLink,
      currency: rawContext.currency || 'USD',
      currency_symbol: currencySymbol,
      recovered_amount: rawContext.recovered_amount || '0.00',
      days_past_due: rawContext.days_past_due || 0,
      grace_period_days: rawContext.grace_period_days || 7,
      ...rawContext,
    };

    // Ensure all 5 variables are strictly present on context
    context.business_name = businessName;
    context.company_name = businessName;
    context.customer_name = customerName;
    context.invoice_amount = invoiceAmount;
    context.due_date = dueDate;
    context.recovery_link = recoveryLink;
    context.payment_link = recoveryLink;

    switch (templateId) {
      case 'payment_failed':
        return this.renderPaymentFailed(context, branding);
      case 'reminder_day2':
      case 'update_payment_method':
        return this.renderDay2Reminder(context, branding);
      case 'reminder_day4':
        return this.renderDay4Reminder(context, branding);
      case 'urgent_reminder_day7':
      case 'recovery_link':
        return this.renderDay7Urgent(context, branding);
      case 'final_attempt_day10':
      case 'final_reminder':
        return this.renderDay10Final(context, branding);
      case 'payment_recovered':
        return this.renderPaymentRecovered(context, branding);
      case 'welcome_to_reviveos':
        return this.renderWelcomeToReviveOS(context, branding);
      case 'import_completed':
        return this.renderImportCompleted(context, branding);
      default:
        return this.renderCustom(templateId, context, branding);
    }
  }

  /**
   * 1. Payment Failed Template
   */
  private static renderPaymentFailed(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `Action Required: Your payment of {{currency_symbol}}{{amount_due}} for {{company_name}} failed`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-urgent">Payment Unsuccessful</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3;">
        We were unable to process your payment
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        Your recurring payment of <strong>${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.amount_due)}</strong> for your <strong>${this.escapeHtml(context.subscription_name || 'subscription')}</strong> with <strong>${this.escapeHtml(context.company_name)}</strong> could not be completed.
        ${context.failure_reason ? `<br/><span style="color: #64748b; font-size: 14px;">Reason: ${this.escapeHtml(context.failure_reason)}</span>` : ''}
      </p>

      <!-- Amount Due Summary Box -->
      <table border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 32px; width: 100%;">
        <tr>
          <td style="padding: 20px 24px;">
            <div style="font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Total Amount Due</div>
            <div style="font-size: 32px; font-weight: 800; color: #0f172a;">
              ${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.amount_due)}
            </div>
            ${context.invoice_id ? `<div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Invoice: #${this.escapeHtml(context.invoice_id)}</div>` : ''}
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${this.escapeHtml(context.payment_link)}" class="btn-primary" target="_blank">
          Update Payment & Settle Invoice →
        </a>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
        Your account is currently in a <strong>${this.escapeHtml(context.grace_period_days || 7)}-day grace period</strong>. Please update your billing info now to prevent any disruption to your service.
      </p>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `Hi ${context.customer_name},

Your recurring payment of ${context.currency_symbol}${context.amount_due} for ${context.company_name} could not be completed.

Reason: ${context.failure_reason || 'Payment card declined'}
Amount Due: ${context.currency_symbol}${context.amount_due}
${context.invoice_id ? `Invoice: #${context.invoice_id}` : ''}

Please update your payment method and settle your balance at:
${context.payment_link}

Your account is in a ${context.grace_period_days || 7}-day grace period. Thank you for your prompt attention.

- The ${context.company_name} Team`;

    return { template_id: 'payment_failed', subject, html, text };
  }

  /**
   * Day 2: Reminder Template
   */
  private static renderDay2Reminder(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `Reminder: Please update payment details for {{business_name}}`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-urgent">Friendly Reminder</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3;">
        Reminder: Update your payment method
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 28px 0;">
        This is a quick reminder that your balance of <strong>${this.escapeHtml(context.invoice_amount)}</strong> for <strong>${this.escapeHtml(context.business_name)}</strong> is due on <strong>${this.escapeHtml(context.due_date)}</strong>.
      </p>

      <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px 24px; margin-bottom: 32px;">
        <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
          <tr>
            <td style="font-size: 14px; color: #475569; padding-bottom: 8px;"><strong>Customer:</strong> ${this.escapeHtml(context.customer_name)}</td>
          </tr>
          <tr>
            <td style="font-size: 14px; color: #475569; padding-bottom: 8px;"><strong>Merchant:</strong> ${this.escapeHtml(context.business_name)}</td>
          </tr>
          <tr>
            <td style="font-size: 14px; color: #475569; padding-bottom: 8px;"><strong>Invoice Amount:</strong> ${this.escapeHtml(context.invoice_amount)}</td>
          </tr>
          <tr>
            <td style="font-size: 14px; color: #475569;"><strong>Due Date:</strong> ${this.escapeHtml(context.due_date)}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${this.escapeHtml(context.recovery_link)}" class="btn-primary" target="_blank">
          Update Payment Details →
        </a>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
        Please use your secure link above to settle your balance before the due date.
      </p>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `Hi ${context.customer_name},\n\nReminder: Please update payment details for ${context.business_name}.\nAmount: ${context.invoice_amount}\nDue Date: ${context.due_date}\n\nSecure Recovery Link:\n${context.recovery_link}\n\nThank you,\n${context.business_name}`;

    return { template_id: 'reminder_day2', subject, html, text };
  }

  /**
   * Day 4: Reminder Template
   */
  private static renderDay4Reminder(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `Important: Outstanding balance for {{business_name}}`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-urgent">Payment Past Due</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3;">
        Action required: Outstanding balance
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 28px 0;">
        Your payment of <strong>${this.escapeHtml(context.invoice_amount)}</strong> for <strong>${this.escapeHtml(context.business_name)}</strong> was due on <strong>${this.escapeHtml(context.due_date)}</strong> and is currently unpaid.
      </p>

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${this.escapeHtml(context.recovery_link)}" class="btn-primary" target="_blank">
          Settle Balance Now (${this.escapeHtml(context.invoice_amount)}) →
        </a>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
        Keep your subscription active without interruption using your 1-click recovery link.
      </p>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `Hi ${context.customer_name},\n\nYour balance of ${context.invoice_amount} for ${context.business_name} is outstanding (due ${context.due_date}).\n\nResolve payment here:\n${context.recovery_link}\n\n- ${context.business_name}`;

    return { template_id: 'reminder_day4', subject, html, text };
  }

  /**
   * Day 7: Urgent Reminder Template
   */
  private static renderDay7Urgent(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `Urgent: Action required to avoid suspension of your {{business_name}} account`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-urgent" style="background-color: #fef2f2; color: #b91c1c;">Urgent Notice</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #991b1b; margin: 0 0 16px 0; line-height: 1.3;">
        Account Suspension Warning
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        Your invoice of <strong>${this.escapeHtml(context.invoice_amount)}</strong> for <strong>${this.escapeHtml(context.business_name)}</strong> is 7 days past due. Action is urgently required to prevent account suspension.
      </p>

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${this.escapeHtml(context.recovery_link)}" class="btn-primary" target="_blank" style="background-color: #b91c1c;">
          Pay ${this.escapeHtml(context.invoice_amount)} Now →
        </a>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
        Immediate payment will restore full service status immediately.
      </p>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `URGENT NOTICE: Action required to avoid suspension of your ${context.business_name} account.\nAmount Due: ${context.invoice_amount}\n\nPay immediately:\n${context.recovery_link}\n\n- ${context.business_name}`;

    return { template_id: 'urgent_reminder_day7', subject, html, text };
  }

  /**
   * Day 10: Final Attempt Template
   */
  private static renderDay10Final(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `Final Notice: Service interruption notice for {{business_name}}`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-urgent" style="background-color: #7f1d1d; color: #ffffff;">Final Attempt</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #7f1d1d; margin: 0 0 16px 0; line-height: 1.3;">
        Final Notice Before Service Cancellation
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        This is our final attempt to collect payment of <strong>${this.escapeHtml(context.invoice_amount)}</strong> for your <strong>${this.escapeHtml(context.business_name)}</strong> subscription.
      </p>

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${this.escapeHtml(context.recovery_link)}" class="btn-primary" target="_blank" style="background-color: #991b1b;">
          Prevent Service Interruption →
        </a>
      </div>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `FINAL NOTICE: Service interruption notice for ${context.business_name}.\nAmount: ${context.invoice_amount}\n\nPrevent cancellation here:\n${context.recovery_link}\n\n- ${context.business_name}`;

    return { template_id: 'final_attempt_day10', subject, html, text };
  }
  private static renderUpdatePaymentMethod(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `Please update your billing information for {{company_name}}`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-urgent">Action Required</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3;">
        Update your payment details
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 28px 0;">
        We noticed that your payment method on file for <strong>${this.escapeHtml(context.company_name)}</strong> needs to be updated. An open balance of <strong>${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.amount_due)}</strong> is currently pending.
      </p>

      <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px 24px; margin-bottom: 32px;">
        <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
          <tr>
            <td style="font-size: 14px; color: #475569; padding-bottom: 8px;"><strong>Account:</strong> ${this.escapeHtml(context.customer_email || context.customer_name)}</td>
          </tr>
          <tr>
            <td style="font-size: 14px; color: #475569; padding-bottom: 8px;"><strong>Service:</strong> ${this.escapeHtml(context.subscription_name || 'Active Subscription')}</td>
          </tr>
          <tr>
            <td style="font-size: 14px; color: #475569;"><strong>Pending Balance:</strong> ${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.amount_due)}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${this.escapeHtml(context.payment_link)}" class="btn-primary" target="_blank">
          Update Payment Method Now →
        </a>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
        This direct link is securely tokenized and protected by bank-level encryption. You can safely add a new credit card, debit card, or supported payment method.
      </p>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `Hi ${context.customer_name},

Please update your billing information for ${context.company_name}.
Pending Balance: ${context.currency_symbol}${context.amount_due}

Update your payment details securely at:
${context.payment_link}

Thank you,
${context.company_name}`;

    return { template_id: 'update_payment_method', subject, html, text };
  }

  /**
   * 3. 1-Click Recovery Link Template
   */
  private static renderRecoveryLink(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `⚡ 1-Click Payment Link: Settle your balance with {{company_name}}`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-urgent">⚡ Express Checkout</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3;">
        Instant 1-Click Payment Recovery
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 28px 0;">
        We've generated an instant, friction-free payment link so you can resolve your balance of <strong>${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.amount_due)}</strong> in seconds without logging in.
      </p>

      <div style="border: 2px dashed #cbd5e1; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px; background-color: #fafaf9;">
        <div style="font-size: 14px; color: #64748b; margin-bottom: 6px;">Total to Settle</div>
        <div style="font-size: 36px; font-weight: 800; color: #0f172a; margin-bottom: 20px;">
          ${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.amount_due)}
        </div>
        <a href="${this.escapeHtml(context.payment_link)}" class="btn-primary" target="_blank" style="font-size: 16px; padding: 0 36px;">
          Pay ${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.amount_due)} Instantly →
        </a>
      </div>

      <p style="font-size: 13px; line-height: 1.6; color: #94a3b8; text-align: center; margin: 0;">
        Supports Credit/Debit Cards, Apple Pay, Google Pay, UPI, and Instant Bank Transfers.
      </p>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `Hi ${context.customer_name},

Settle your balance with ${context.company_name} with our instant 1-click recovery link.

Total Amount: ${context.currency_symbol}${context.amount_due}
Pay Instantly: ${context.payment_link}

- The ${context.company_name} Team`;

    return { template_id: 'recovery_link', subject, html, text };
  }

  /**
   * 4. Final Reminder Template
   */
  private static renderFinalReminder(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `⚠️ FINAL NOTICE: Service suspension for {{company_name}}`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-urgent" style="background-color: #7f1d1d; color: #ffffff; border: 0;">FINAL NOTICE</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #991b1b; margin: 0 0 16px 0; line-height: 1.3;">
        Your subscription is scheduled for cancellation
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        This is our final attempt to reach you regarding your overdue balance of <strong>${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.amount_due)}</strong>.
        Because we haven't received a successful payment, your account and access to <strong>${this.escapeHtml(context.company_name)}</strong> will be automatically suspended <strong>${this.escapeHtml(context.cancellation_date || 'shortly')}</strong>.
      </p>

      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
        <p style="font-size: 14px; font-weight: 700; color: #991b1b; margin: 0 0 8px 0;">
          To avoid losing access to your data and active service:
        </p>
        <p style="font-size: 14px; color: #7f1d1d; margin: 0;">
          Please settle your outstanding invoice immediately. Once paid, your account will instantly return to good standing.
        </p>
      </div>

      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${this.escapeHtml(context.payment_link)}" class="btn-primary" target="_blank" style="background-color: #dc2626;">
          Prevent Account Suspension →
        </a>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
        If you have already paid or believe this is an error, please reach out directly to our support team.
      </p>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `FINAL NOTICE: Service suspension for ${context.company_name}

Hi ${context.customer_name},

This is our final attempt to reach you regarding your overdue balance of ${context.currency_symbol}${context.amount_due}.
Your service is scheduled for cancellation ${context.cancellation_date || 'shortly'}.

To avoid interruption, settle your invoice immediately at:
${context.payment_link}

- ${context.company_name}`;

    return { template_id: 'final_reminder', subject, html, text };
  }

  /**
   * 5. Payment Recovered Template
   */
  private static renderPaymentRecovered(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `✅ Receipt: Your payment of {{currency_symbol}}{{recovered_amount}} was successfully processed`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-success">Payment Successful</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3;">
        Thank you for your payment
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name)}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 28px 0;">
        We've successfully processed your payment of <strong>${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.recovered_amount || context.amount_due)}</strong> for your <strong>${this.escapeHtml(context.company_name)}</strong> subscription. Your account is fully active and in good standing.
      </p>

      <table border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 32px; width: 100%;">
        <tr>
          <td style="padding: 24px;">
            <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
              <tr>
                <td style="font-size: 14px; color: #64748b; padding-bottom: 10px;">Amount Paid:</td>
                <td style="font-size: 16px; font-weight: 700; color: #0f172a; text-align: right; padding-bottom: 10px;">
                  ${this.escapeHtml(context.currency_symbol)}${this.escapeHtml(context.recovered_amount || context.amount_due)}
                </td>
              </tr>
              ${context.transaction_id ? `<tr>
                <td style="font-size: 14px; color: #64748b; padding-bottom: 10px;">Transaction ID:</td>
                <td style="font-size: 14px; font-family: monospace; color: #334155; text-align: right; padding-bottom: 10px;">
                  ${this.escapeHtml(context.transaction_id)}
                </td>
              </tr>` : ''}
              <tr>
                <td style="font-size: 14px; color: #64748b;">Status:</td>
                <td style="font-size: 14px; font-weight: 700; color: #16a34a; text-align: right;">
                  Settled & Active
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
        No further action is required. We truly appreciate your continued partnership.
      </p>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `Hi ${context.customer_name},

Thank you! Your payment of ${context.currency_symbol}${context.recovered_amount || context.amount_due} for ${context.company_name} was successfully received.

Transaction ID: ${context.transaction_id || 'N/A'}
Status: Settled & Active

- ${context.company_name}`;

    return { template_id: 'payment_recovered', subject, html, text };
  }

  /**
   * 6. Welcome to ReviveOS Template
   */
  private static renderWelcomeToReviveOS(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `Welcome to ReviveOS — Your Autonomous Revenue Recovery Engine`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3;">
        Welcome to ReviveOS
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Hi <strong>${this.escapeHtml(context.customer_name || 'there')}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        Your workspace <strong>${this.escapeHtml(context.workspace_name || 'ReviveOS Workspace')}</strong> is live and ready to recover failed subscription payments autonomously.
      </p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">Your Next 3 Steps:</h3>
        <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #475569;">
          <li><strong>Connect Stripe / Razorpay</strong> or import your customer billing CSV.</li>
          <li><strong>Configure Email & WhatsApp</strong> dispatch gateways.</li>
          <li><strong>Turn On Autopilot</strong> to begin recovering leaking revenue on auto-drive.</li>
        </ol>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${this.escapeHtml(context.workspace_url || '#')}" class="btn-primary" target="_blank">
          Open ReviveOS Workspace →
        </a>
      </div>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `Welcome to ReviveOS!

Your workspace "${context.workspace_name || 'ReviveOS'}" is ready.
Open your dashboard: ${context.workspace_url || 'https://app.reviveos.io'}

- Team ReviveOS`;

    return { template_id: 'welcome_to_reviveos', subject, html, text };
  }

  /**
   * 7. Import Completed Template
   */
  private static renderImportCompleted(context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = `📊 Import Completed: {{customers_count}} customers ingested into ReviveOS`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <span class="badge-success">Data Ingestion Complete</span>
      </div>
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3;">
        Customer Import Finished Successfully
      </h1>
      <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        Your CSV data import for workspace <strong>${this.escapeHtml(context.workspace_name || 'ReviveOS')}</strong> has finished with zero errors.
      </p>

      <table border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 32px; width: 100%;">
        <tr>
          <td style="padding: 24px;">
            <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
              <tr>
                <td style="font-size: 14px; color: #64748b; padding-bottom: 10px;">Customers Ingested:</td>
                <td style="font-size: 15px; font-weight: 700; color: #0f172a; text-align: right; padding-bottom: 10px;">
                  ${this.escapeHtml(context.customers_count || 0)}
                </td>
              </tr>
              <tr>
                <td style="font-size: 14px; color: #64748b; padding-bottom: 10px;">Subscriptions Created:</td>
                <td style="font-size: 15px; font-weight: 700; color: #0f172a; text-align: right; padding-bottom: 10px;">
                  ${this.escapeHtml(context.subscriptions_count || 0)}
                </td>
              </tr>
              <tr>
                <td style="font-size: 14px; color: #64748b; padding-bottom: 10px;">Invoices Processed:</td>
                <td style="font-size: 15px; font-weight: 700; color: #0f172a; text-align: right; padding-bottom: 10px;">
                  ${this.escapeHtml(context.invoices_count || 0)}
                </td>
              </tr>
              <tr>
                <td style="font-size: 14px; color: #64748b;">Revenue Tracked:</td>
                <td style="font-size: 15px; font-weight: 700; color: #16a34a; text-align: right;">
                  ${this.escapeHtml(context.currency_symbol || '$')}${this.escapeHtml(context.revenue_imported || '0.00')}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${this.escapeHtml(context.workspace_url || '#')}" class="btn-primary" target="_blank">
          View Ingested Customers & Opportunities →
        </a>
      </div>
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = `Customer Import Completed

Workspace: ${context.workspace_name || 'ReviveOS'}
Customers: ${context.customers_count || 0}
Subscriptions: ${context.subscriptions_count || 0}
Invoices: ${context.invoices_count || 0}
Revenue: ${context.currency_symbol || '$'}${context.revenue_imported || '0.00'}

View your dashboard: ${context.workspace_url || 'https://app.reviveos.io'}

- ReviveOS Engine`;

    return { template_id: 'import_completed', subject, html, text };
  }

  /**
   * Custom / Fallback Template
   */
  private static renderCustom(templateId: string, context: EmailTemplateContext, branding?: EmailTemplateBranding): RenderedEmail {
    const rawSubject = context.subject || `Notification from {{company_name}}`;
    const subject = this.sanitizeHeader(this.substitute(rawSubject, context));

    const contentHtml = `
      <h1 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0;">
        ${this.escapeHtml(subject)}
      </h1>
      <div style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
        ${context.body_html || context.messageText || `<p>Hi ${this.escapeHtml(context.customer_name || 'Customer')},</p><p>${this.escapeHtml(context.message || 'Thank you for your business.')}</p>`}
      </div>
      ${context.payment_link ? `
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${this.escapeHtml(context.payment_link)}" class="btn-primary" target="_blank">
          Review & Settle →
        </a>
      </div>` : ''}
    `;

    const html = this.wrapHtml(subject, contentHtml, branding, context);
    const text = context.body_text || `Hi ${context.customer_name || 'Customer'},\n\n${context.message || 'Notification from ' + context.company_name}\n\nLink: ${context.payment_link || ''}`;

    return { template_id: templateId, subject, html, text };
  }
}
