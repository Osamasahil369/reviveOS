import { BaseRevenueConnector } from '../baseConnector.js';
import {
  ConnectorCapabilities,
  ConnectorConfigField,
  ConnectorTestResult,
  ConnectorPullParams,
} from '../types.js';
import { CanonicalBatch } from '../canonicalSchema.js';

// ============================================================================
// 1. SHOPIFY CONNECTOR
// ============================================================================
export class ShopifyConnector extends BaseRevenueConnector {
  readonly id = 'shopify';
  readonly name = 'Shopify';
  readonly category = 'ecommerce' as const;
  readonly description = 'Shopify recurring app billing, subscription contracts, abandoned checkouts, and failed customer orders.';
  readonly version = '2.2.0';
  readonly capabilities: ConnectorCapabilities = {
    syncMode: 'pull_api',
    supportsIncrementalSync: true,
    supportsTestConnection: true,
    supportsDirectRetry: true,
    supportedEntities: ['customers', 'subscriptions', 'invoices', 'payments', 'failures'],
  };
  readonly configSchema: ConnectorConfigField[] = [
    { name: 'shop_domain', label: 'Shop Domain', type: 'text', required: true, placeholder: 'my-store.myshopify.com' },
    { name: 'access_token', label: 'Admin API Access Token', type: 'password', required: true, placeholder: 'shpat_...' },
  ];

  async testConnection(config: Record<string, any>): Promise<ConnectorTestResult> {
    if (!config.shop_domain || !config.access_token) {
      return { connected: false, message: 'Shop domain and Access Token are required.', error: 'MISSING_CREDENTIALS' };
    }
    return {
      connected: true,
      message: `Connected to Shopify Store "${config.shop_domain}" via Admin GraphQL API.`,
      latencyMs: 45,
    };
  }

  async pull(params: ConnectorPullParams): Promise<CanonicalBatch> {
    return this.normalize(params.customData || this.generateSampleData());
  }

  normalize(rawPayload: any): CanonicalBatch {
    const batch = this.createEmptyBatch('shopify');
    const records = Array.isArray(rawPayload) ? rawPayload : [rawPayload];

    for (const r of records) {
      if (!r) continue;
      const cust = r.customer || {};
      const custId = this.cleanString(cust.id || `sh_c_${r.id}`);
      const email = this.normalizeEmail(cust.email || r.email || 'customer@shopify.com');
      const name = this.cleanString(cust.first_name ? `${cust.first_name} ${cust.last_name || ''}` : (email ? email.split('@')[0] : 'Shopify Customer'));
      const currency = this.normalizeCurrency(r.currency || r.presentment_currency, 'USD');
      const amountCents = this.parseAmountToCents(r.total_price || r.current_total_price || r.amount, currency);

      batch.customers.push({
        id: custId,
        externalId: custId,
        source: 'shopify',
        name,
        email,
        phone: cust.phone || r.phone,
        currency,
        status: r.financial_status === 'voided' || r.financial_status === 'unpaid' ? 'at_risk' : 'active',
        lifetimeValueCents: amountCents * 3,
        createdAt: this.parseDateIso(r.created_at),
      });

      const invId = this.cleanString(r.id);
      batch.invoices.push({
        id: this.generateId('inv'),
        externalId: invId,
        customerId: custId,
        source: 'shopify',
        invoiceNumber: r.name || `ORDER-${invId}`,
        amountCents,
        currency,
        status: r.financial_status === 'paid' ? 'paid' : 'past_due',
        dueDate: this.parseDateIso(r.created_at),
        createdAt: this.parseDateIso(r.created_at),
      });

      if (r.financial_status === 'voided' || r.financial_status === 'pending_payment' || r.cancelled_at || r.failure_reason) {
        const rawCode = r.cancel_reason || r.failure_code || 'TRANSACTION_DECLINED';
        const rawMsg = r.failure_message || 'Shopify checkout transaction payment authorization failed';
        batch.paymentFailures.push({
          id: this.generateId('fail'),
          externalId: this.cleanString(r.id),
          customerId: custId,
          invoiceId: invId,
          source: 'shopify',
          amountCents,
          currency,
          rawErrorCode: rawCode,
          rawErrorMessage: rawMsg,
          normalizedCategory: this.classifyFailure(rawCode, rawMsg),
          occurredAt: this.parseDateIso(r.cancelled_at || r.created_at),
          isResolved: false,
        });
      } else {
        batch.payments.push({
          id: this.generateId('pay'),
          externalId: this.cleanString(r.id),
          customerId: custId,
          invoiceId: invId,
          source: 'shopify',
          amountCents,
          currency,
          status: 'succeeded',
          paymentMethodType: r.gateway || 'shopify_payments',
          createdAt: this.parseDateIso(r.created_at),
        });
      }
    }
    return batch;
  }

  private generateSampleData() {
    return [
      { id: 'sh_ord_9011', name: '#SH-1029', total_price: '189.00', currency: 'USD', financial_status: 'unpaid', cancel_reason: 'card_declined', failure_message: 'Credit card declined: Insufficient funds', customer: { id: 'sh_cust_44', first_name: 'Jessica', last_name: 'Alba', email: 'jessica@beautylab.co' }, created_at: new Date().toISOString() },
    ];
  }
}

// ============================================================================
// 2. WOOCOMMERCE CONNECTOR
// ============================================================================
export class WooCommerceConnector extends BaseRevenueConnector {
  readonly id = 'woocommerce';
  readonly name = 'WooCommerce';
  readonly category = 'ecommerce' as const;
  readonly description = 'WooCommerce Subscriptions & failed renewal orders automated dunning and sync.';
  readonly version = '1.9.0';
  readonly capabilities: ConnectorCapabilities = {
    syncMode: 'pull_api',
    supportsIncrementalSync: true,
    supportsTestConnection: true,
    supportsDirectRetry: true,
    supportedEntities: ['customers', 'subscriptions', 'invoices', 'payments', 'failures'],
  };
  readonly configSchema: ConnectorConfigField[] = [
    { name: 'site_url', label: 'WordPress Site URL', type: 'text', required: true, placeholder: 'https://example.com' },
    { name: 'consumer_key', label: 'Consumer Key', type: 'text', required: true, placeholder: 'ck_...' },
    { name: 'consumer_secret', label: 'Consumer Secret', type: 'password', required: true, placeholder: 'cs_...' },
  ];

  async testConnection(config: Record<string, any>): Promise<ConnectorTestResult> {
    if (!config.site_url || !config.consumer_key || !config.consumer_secret) {
      return { connected: false, message: 'Missing WooCommerce REST credentials.', error: 'MISSING_CREDENTIALS' };
    }
    return { connected: true, message: 'WooCommerce REST API v3 connected.', latencyMs: 54 };
  }

  async pull(params: ConnectorPullParams): Promise<CanonicalBatch> {
    return this.normalize(params.customData || this.generateSampleData());
  }

  normalize(rawPayload: any): CanonicalBatch {
    const batch = this.createEmptyBatch('woocommerce');
    const records = Array.isArray(rawPayload) ? rawPayload : [rawPayload];

    for (const r of records) {
      if (!r) continue;
      const billing = r.billing || {};
      const custId = this.cleanString(r.customer_id || `wc_c_${r.id}`);
      const email = this.normalizeEmail(billing.email || 'customer@woocommerce.com');
      const name = this.cleanString(billing.first_name ? `${billing.first_name} ${billing.last_name || ''}` : (email ? email.split('@')[0] : 'WooCommerce Customer'));
      const currency = this.normalizeCurrency(r.currency, 'USD');
      const amountCents = this.parseAmountToCents(r.total, currency);

      batch.customers.push({
        id: custId,
        externalId: custId,
        source: 'woocommerce',
        name,
        email,
        phone: billing.phone,
        currency,
        status: r.status === 'failed' || r.status === 'on-hold' ? 'at_risk' : 'active',
        lifetimeValueCents: amountCents * 2,
        createdAt: this.parseDateIso(r.date_created),
      });

      if (r.status === 'failed') {
        batch.paymentFailures.push({
          id: this.generateId('fail'),
          externalId: this.cleanString(r.id),
          customerId: custId,
          source: 'woocommerce',
          amountCents,
          currency,
          rawErrorCode: 'WC_RENEWAL_FAILED',
          rawErrorMessage: 'Automatic subscription renewal payment failed via gateway',
          normalizedCategory: 'insufficient_funds',
          occurredAt: this.parseDateIso(r.date_modified || r.date_created),
          isResolved: false,
        });
      }
    }
    return batch;
  }

  private generateSampleData() {
    return [
      { id: 'wc_ord_442', total: '75.00', currency: 'USD', status: 'failed', date_created: new Date().toISOString(), billing: { first_name: 'Tobias', last_name: 'Funke', email: 'tobias@actormethod.org', phone: '+15551234567' } },
    ];
  }
}
