export interface WhatsAppTemplate {
  id: string;
  name: string;
  day: number;
  triggerEvent: string;
  body: string;
}

export interface WhatsAppNotificationLog {
  id: string;
  customerId: string;
  phone: string;
  templateId: string;
  status: 'sent' | 'delivered' | 'failed';
  timestamp: string;
}

export class WhatsAppRecoveryEngine {
  private static templates: WhatsAppTemplate[] = [
    {
      id: 'day0_alert',
      name: 'Immediate Decline Alert (Day 0)',
      day: 0,
      triggerEvent: 'payment_failed',
      body: 'Hi {{customer_name}}, your monthly subscription payment of {{amount}} for {{workspace_name}} has declined. Tap to safely update your payment details: {{recovery_link}}',
    },
    {
      id: 'day2_reminder',
      name: 'First Recovery Reminder (Day 2)',
      day: 2,
      triggerEvent: 'grace_period',
      body: 'Hi {{customer_name}}, this is a quick friendly reminder that we are unable to process your billing. Please use this secure 1-click portal to update your card: {{recovery_link}}',
    },
    {
      id: 'day4_warning',
      name: 'Grace Warning Notice (Day 4)',
      day: 4,
      triggerEvent: 'grace_period_warning',
      body: 'Hello {{customer_name}}, your subscription to {{workspace_name}} is currently at risk of being suspended. Please clear your outstanding balance: {{recovery_link}}',
    },
    {
      id: 'day7_critical',
      name: 'Critical Suspension Threat (Day 7)',
      day: 7,
      triggerEvent: 'suspension_threat',
      body: 'Urgent: {{customer_name}}, your membership with {{workspace_name}} will be suspended in 48 hours unless your billing is updated. Please tap here to keep your membership active: {{recovery_link}}',
    },
    {
      id: 'day10_final',
      name: 'Account Suspended Notice (Day 10)',
      day: 10,
      triggerEvent: 'canceled',
      body: 'Notice: {{customer_name}}, your subscription has been officially suspended. Tap here to reactivate your plan instantly: {{recovery_link}}',
    },
  ];

  public static getTemplates(): WhatsAppTemplate[] {
    return this.templates;
  }

  public static async sendWhatsAppNotification(
    provider: 'twilio' | 'meta',
    phone: string,
    customerName: string,
    amount: string,
    workspaceName: string,
    recoveryLink: string,
    templateId: string
  ): Promise<WhatsAppNotificationLog> {
    const tpl = this.templates.find((t) => t.id === templateId) || this.templates[0];
    const logBody = tpl.body
      .replace('{{customer_name}}', customerName)
      .replace('{{amount}}', amount)
      .replace('{{workspace_name}}', workspaceName)
      .replace('{{recovery_link}}', recoveryLink);

    console.log(`[WhatsApp Recovery Engine] Sending via ${provider.toUpperCase()} to ${phone}: ${logBody}`);

    return {
      id: `wa_log_${Math.random().toString(36).substr(2, 9)}`,
      customerId: 'customer_123',
      phone,
      templateId,
      status: 'sent',
      timestamp: new Date().toISOString(),
    };
  }
}
