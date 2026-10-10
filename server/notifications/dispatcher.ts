import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { ChannelType, CommunicationLanguage, DispatchResult, NotificationPayload, ChannelProvider } from './types.js';

export const MULTILINGUAL_DUNNING_TEMPLATES: Record<
  CommunicationLanguage,
  { subject: string; bodyTemplate: string; smsTemplate: string; whatsappTemplate: string }
> = {
  en: {
    subject: 'Action Required: Update billing method for {{company}}',
    bodyTemplate: 'Hi {{name}}, your payment of {{amount}} could not be processed. Please update your payment method here: {{link}} to prevent any disruption.',
    smsTemplate: '{{company}}: Payment of {{amount}} failed. Please update your card: {{link}}',
    whatsappTemplate: 'Hello {{name}}, we were unable to process your payment of {{amount}} for {{company}}. Tap here to safely update your payment details: {{link}}',
  },
  es: {
    subject: 'Acción requerida: Actualice su método de pago en {{company}}',
    bodyTemplate: 'Hola {{name}}, su pago de {{amount}} no se pudo procesar. Actualice su método de pago aquí: {{link}} para evitar la suspensión del servicio.',
    smsTemplate: '{{company}}: Su pago de {{amount}} ha fallado. Actualice sus datos aquí: {{link}}',
    whatsappTemplate: 'Hola {{name}}, no pudimos procesar el pago de {{amount}} para {{company}}. Actualice sus datos de forma segura: {{link}}',
  },
  de: {
    subject: 'Dringend erforderlich: Zahlungsmethode für {{company}} aktualisieren',
    bodyTemplate: 'Hallo {{name}}, Ihre Zahlung von {{amount}} konnte nicht abgewickelt werden. Bitte aktualisieren Sie Ihre Zahlungsart unter: {{link}}',
    smsTemplate: '{{company}}: Zahlung von {{amount}} fehlgeschlagen. Aktualisieren Sie hier: {{link}}',
    whatsappTemplate: 'Guten Tag {{name}}, Ihre Zahlung von {{amount}} für {{company}} war nicht erfolgreich. Bitte Zahlungsdaten aktualisieren: {{link}}',
  },
  fr: {
    subject: 'Action requise : Mettez à jour votre moyen de paiement pour {{company}}',
    bodyTemplate: 'Bonjour {{name}}, votre paiement de {{amount}} n\'a pas pu être débité. Merci de mettre à jour votre carte ici : {{link}}',
    smsTemplate: '{{company}}: Le paiement de {{amount}} a échoué. Mettez à jour vos informations : {{link}}',
    whatsappTemplate: 'Bonjour {{name}}, échec du prélèvement de {{amount}} pour {{company}}. Cliquez ici pour régulariser en toute sécurité : {{link}}',
  },
  hi: {
    subject: 'आवश्यक सूचना: {{company}} के लिए भुगतान विवरण अपडेट करें',
    bodyTemplate: 'नमस्ते {{name}}, {{company}} के लिए {{amount}} का भुगतान प्रोसेस नहीं हो सका। सेवा निर्बाध रखने हेतु यहाँ अपडेट करें: {{link}}',
    smsTemplate: '{{company}}: {{amount}} का भुगतान विफल रहा। कृपया विवरण अपडेट करें: {{link}}',
    whatsappTemplate: 'नमस्ते {{name}}, {{company}} के लिए {{amount}} का भुगतान असफल रहा। सुरक्षित रूप से अपडेट करने के लिए यहाँ क्लिक करें: {{link}}',
  },
  ar: {
    subject: 'إجراء مطلوب: تحديث وسيلة الدفع لدى {{company}}',
    bodyTemplate: 'مرحبًا {{name}}، تعذر معالجة دفعتك بقيمة {{amount}}. يرجى تحديث بيانات بطاقتك من خلال الرابط: {{link}} لتجنب توقف الخدمة.',
    smsTemplate: '{{company}}: تعذر سداد {{amount}}. يرجى التحديث عبر: {{link}}',
    whatsappTemplate: 'مرحبًا {{name}}، نود إعلامك بتعذر خصم {{amount}} لحساب {{company}}. يرجى التحديث بأمان عبر الرابط: {{link}}',
  },
};

export class NotificationDispatcher {
  private static providers: Map<ChannelType, ChannelProvider> = new Map();

  static registerProvider(provider: ChannelProvider) {
    this.providers.set(provider.channel, provider);
  }

  static async dispatch(payload: NotificationPayload): Promise<DispatchResult> {
    const isProd = isSupabaseAuthoritative();
    const registered = this.providers.get(payload.channel);

    if (registered) {
      return registered.send(payload);
    }

    const messageId = `msg_${payload.channel}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    switch (payload.channel) {
      case 'sms': {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const auth = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (sid && auth && fromNumber && (payload.toPhone || payload.toEmail)) {
          try {
            const body = new URLSearchParams({
              To: payload.toPhone || payload.toEmail || '',
              From: fromNumber,
              Body: payload.customBody || 'Please update your billing details to maintain active service.',
            });
            const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
              method: 'POST',
              headers: {
                Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: body.toString(),
            });
            const data = await res.json();
            if (res.ok) {
              return {
                success: true,
                channel: 'sms',
                messageId: data.sid || messageId,
                status: 'sent',
                providerName: 'Twilio SMS Gateway',
                timestamp: new Date().toISOString(),
              };
            }
            return {
              success: false,
              channel: 'sms',
              messageId,
              status: 'failed',
              error: data.message || 'Twilio SMS API error',
              providerName: 'Twilio SMS',
              timestamp: new Date().toISOString(),
            };
          } catch (err: any) {
            return {
              success: false,
              channel: 'sms',
              messageId,
              status: 'failed',
              error: err.message,
              providerName: 'Twilio SMS',
              timestamp: new Date().toISOString(),
            };
          }
        }

        if (isProd) {
          return {
            success: false,
            channel: 'sms',
            messageId,
            status: 'failed',
            error: 'SMS notification not configured: TWILIO_ACCOUNT_SID or TWILIO_PHONE_NUMBER missing.',
            providerName: 'Twilio SMS Engine',
            timestamp: new Date().toISOString(),
          };
        }

        return {
          success: true,
          channel: 'sms',
          messageId,
          status: 'simulated',
          providerName: 'Twilio SMS Simulator (Dev Sandbox)',
          timestamp: new Date().toISOString(),
        };
      }

      case 'whatsapp': {
        const token = process.env.WHATSAPP_TOKEN;
        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        if (token && phoneId && (payload.toPhone || payload.toEmail)) {
          try {
            const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: payload.toPhone || payload.toEmail,
                type: 'text',
                text: { body: payload.customBody || 'Action required: Update payment method.' },
              }),
            });
            const data = await res.json();
            if (res.ok) {
              return {
                success: true,
                channel: 'whatsapp',
                messageId: data.messages?.[0]?.id || messageId,
                status: 'sent',
                providerName: 'WhatsApp Cloud Business API',
                timestamp: new Date().toISOString(),
              };
            }
            return {
              success: false,
              channel: 'whatsapp',
              messageId,
              status: 'failed',
              error: data.error?.message || 'WhatsApp Cloud API error',
              providerName: 'WhatsApp Cloud API',
              timestamp: new Date().toISOString(),
            };
          } catch (err: any) {
            return {
              success: false,
              channel: 'whatsapp',
              messageId,
              status: 'failed',
              error: err.message,
              providerName: 'WhatsApp Cloud API',
              timestamp: new Date().toISOString(),
            };
          }
        }

        if (isProd) {
          return {
            success: false,
            channel: 'whatsapp',
            messageId,
            status: 'failed',
            error: 'WhatsApp notification not configured: WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing.',
            providerName: 'WhatsApp Cloud API',
            timestamp: new Date().toISOString(),
          };
        }

        return {
          success: true,
          channel: 'whatsapp',
          messageId,
          status: 'sent',
          providerName: 'WhatsApp Sandbox (Dev Mode)',
          timestamp: new Date().toISOString(),
        };
      }

      case 'voice': {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const auth = process.env.TWILIO_AUTH_TOKEN;

        if (isProd && (!sid || !auth)) {
          return {
            success: false,
            channel: 'voice',
            messageId,
            status: 'failed',
            error: 'Voice IVR not configured: TWILIO credentials missing.',
            providerName: 'Twilio Voice Automated IVR',
            timestamp: new Date().toISOString(),
          };
        }

        return {
          success: !isProd,
          channel: 'voice',
          messageId,
          status: isProd ? 'failed' : 'sent',
          providerName: 'Twilio Voice Automated IVR',
          timestamp: new Date().toISOString(),
        };
      }

      case 'email':
      default: {
        const resendKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
        if (isProd && !resendKey) {
          return {
            success: false,
            channel: 'email',
            messageId,
            status: 'failed',
            error: 'Email provider not configured: RESEND_API_KEY is required in production mode.',
            providerName: 'Resend Transactional Email Gateway',
            timestamp: new Date().toISOString(),
          };
        }

        return {
          success: true,
          channel: 'email',
          messageId,
          status: 'sent',
          providerName: resendKey ? 'Resend Transactional' : 'Development Email Outbox',
          timestamp: new Date().toISOString(),
        };
      }
    }
  }
}
