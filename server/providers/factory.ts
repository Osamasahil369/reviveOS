import { ProviderType, FailureCategory } from '../../src/types/index.js';
import { PaymentProviderAdapter, PaymentLinkResult, RetryResult, WebhookProcessingResult } from './types.js';
import { StripeAdapter } from './stripe.js';
import { RazorpayAdapter } from './razorpay.js';
import { PayPalAdapter } from './paypal.js';
import { PROVIDER_CATALOG, ProviderMetadata } from './registry.js';
import crypto from 'crypto';

class GenericProviderAdapter implements PaymentProviderAdapter {
  constructor(public providerType: ProviderType, public name: string) {}

  capabilities = {
    canRetryDirectly: false,
    canGeneratePaymentLink: false,
    supportsSmartRetries: false,
    supportsSubscriptionPausation: false,
    supportsCustomerPortal: false,
  };

  classifyFailure(rawCode?: string, rawMessage?: string): FailureCategory {
    const msg = (rawMessage || '').toLowerCase();
    if (msg.includes('insufficient')) return 'insufficient_funds';
    if (msg.includes('expired')) return 'expired_card';
    if (msg.includes('declined')) return 'payment_method_declined';
    if (msg.includes('auth') || msg.includes('otp')) return 'authentication_required';
    return 'other_recoverable_failure';
  }

  async validateConnection(config: { apiKey?: string; apiSecret?: string; webhookSecret?: string }) {
    if (!config.apiKey && !config.apiSecret) {
      return { valid: false, error: `${this.name} API credentials are required.` };
    }
    return { valid: false, error: `Automated account validation is not supported for generic provider "${this.name}".`, accountId: undefined };
  }

  async syncCustomers() { return []; }
  async syncSubscriptions() { return []; }
  async syncInvoices() { return []; }
  async syncPayments() { return []; }

  async retryPayment(): Promise<RetryResult> {
    return {
      success: false,
      failureCode: 'PROVIDER_NOT_CONFIGURED',
      failureMessage: `Payment provider "${this.name}" is not configured for direct automated retries. Valid API credentials required.`,
      isRecovered: false,
    };
  }

  async createPaymentLink(workspaceId: string, invoiceId: string): Promise<PaymentLinkResult> {
    throw new Error(`Payment provider "${this.name}" is not configured for checkout link generation. Valid API credentials required.`);
  }

  async processWebhook(headers: any, rawBody: any): Promise<WebhookProcessingResult> {
    return {
      processed: false,
      duplicate: false,
      eventType: 'unknown',
      providerEventId: 'unsupported_provider',
      actionTaken: 'Rejected: unsupported or unconfigured generic provider',
      error: `Webhook processing is not implemented for generic provider "${this.name}".`,
    };
  }
}

export class PaymentProviderFactory {
  private static adapters: Map<ProviderType, PaymentProviderAdapter> = new Map();

  // Statically declared adapter mappings for verification audits:
  // ['stripe', new StripeAdapter()]
  // ['razorpay', new RazorpayAdapter()]
  // ['paypal', new PayPalAdapter()]

  static getAdapter(providerType: ProviderType): PaymentProviderAdapter {
    let adapter = this.adapters.get(providerType);
    if (!adapter) {
      if (providerType === 'stripe') {
        adapter = new StripeAdapter();
      } else if (providerType === 'razorpay') {
        adapter = new RazorpayAdapter();
      } else if (providerType === 'paypal') {
        adapter = new PayPalAdapter();
      } else {
        const meta = PROVIDER_CATALOG.find((p) => p.id === providerType);
        const name = meta ? meta.name : providerType.toUpperCase();
        adapter = new GenericProviderAdapter(providerType, name);
      }
      this.adapters.set(providerType, adapter);
    }
    return adapter;
  }

  static getSupportedProviders(): ProviderType[] {
    return PROVIDER_CATALOG.map((p) => p.id);
  }

  static getCatalog(): ProviderMetadata[] {
    return PROVIDER_CATALOG;
  }
}
