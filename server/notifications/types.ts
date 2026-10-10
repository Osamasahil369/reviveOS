export type ChannelType = 'email' | 'sms' | 'whatsapp' | 'voice' | 'ai_agent';

export type CommunicationLanguage = 'en' | 'es' | 'de' | 'fr' | 'hi' | 'ar';

export interface NotificationPayload {
  toEmail?: string;
  toPhone?: string;
  customerName: string;
  amountCents: number;
  currency: string;
  invoiceId?: string;
  paymentLinkUrl?: string;
  channel: ChannelType;
  language?: CommunicationLanguage;
  customSubject?: string;
  customBody?: string;
}

export interface DispatchResult {
  success: boolean;
  channel: ChannelType;
  messageId: string;
  status: 'sent' | 'queued' | 'simulated' | 'failed';
  providerName: string;
  error?: string;
  timestamp: string;
}

export interface ChannelProvider {
  channel: ChannelType;
  name: string;
  enabled: boolean;
  send(payload: NotificationPayload): Promise<DispatchResult>;
}
