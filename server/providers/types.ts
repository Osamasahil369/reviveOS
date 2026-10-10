import {
  FailureCategory,
  ProviderCapabilities,
  ProviderType,
  Customer,
  Subscription,
  Invoice,
  Payment,
} from '../../src/types/index.js';

export interface ProviderSyncResult {
  customersSynced: number;
  subscriptionsSynced: number;
  invoicesSynced: number;
  paymentsSynced: number;
  failuresDetected: number;
}

export interface RetryResult {
  success: boolean;
  paymentId?: string;
  failureCode?: string;
  failureMessage?: string;
  isRecovered: boolean;
}

export interface PaymentLinkResult {
  url: string;
  providerCheckoutId?: string;
  expiresAt?: string | null;
}

export interface WebhookProcessingResult {
  processed: boolean;
  duplicate: boolean;
  eventType: string;
  providerEventId: string;
  actionTaken: string;
  affectedOpportunityId?: string;
  recoveredAmountCents?: number;
  error?: string;
}

export interface PaymentProviderAdapter {
  providerType: ProviderType;
  capabilities: ProviderCapabilities;

  validateConnection(config: { apiKey?: string; apiSecret?: string; webhookSecret?: string }): Promise<{
    valid: boolean;
    accountId?: string;
    error?: string;
  }>;

  syncCustomers(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Customer[]>;
  syncSubscriptions(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Subscription[]>;
  syncInvoices(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Invoice[]>;
  syncPayments(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Payment[]>;

  retryPayment(
    workspaceId: string,
    invoiceId: string,
    paymentId?: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<RetryResult>;

  createPaymentLink(
    workspaceId: string,
    invoiceId: string,
    customerId: string,
    amountCents: number,
    currency: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<PaymentLinkResult>;

  processWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | any,
    webhookSecret?: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<WebhookProcessingResult>;

  classifyFailure(rawCode?: string, rawMessage?: string): FailureCategory;
}
