import crypto from 'crypto';
import {
  IRevenueConnector,
  SourceCategory,
  ConnectorCapabilities,
  ConnectorConfigField,
  ConnectorTestResult,
  ConnectorPullParams,
} from './types.js';
import {
  CanonicalBatch,
  CanonicalCustomer,
  CanonicalSubscription,
  CanonicalInvoice,
  CanonicalPayment,
  CanonicalPaymentFailure,
  normalizeFailureCategory,
  CanonicalBillingInterval,
} from './canonicalSchema.js';

export abstract class BaseRevenueConnector implements IRevenueConnector {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly category: SourceCategory;
  abstract readonly description: string;
  abstract readonly version: string;
  abstract readonly capabilities: ConnectorCapabilities;
  abstract readonly configSchema: ConnectorConfigField[];
  readonly icon?: string;

  abstract testConnection(config: Record<string, any>): Promise<ConnectorTestResult>;
  abstract pull(params: ConnectorPullParams): Promise<CanonicalBatch>;
  abstract normalize(rawPayload: any, context?: any): CanonicalBatch;

  protected generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  protected createEmptyBatch(sourceName: string): CanonicalBatch {
    return {
      source: sourceName,
      batchId: this.generateId('batch'),
      ingestedAt: new Date().toISOString(),
      customers: [],
      subscriptions: [],
      invoices: [],
      payments: [],
      paymentFailures: [],
    };
  }

  protected parseAmountToCents(val: any, defaultCurrency: string = 'USD'): number {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') {
      // If already an integer > 100 and no decimals, check if it's already in cents or currency subunits
      // In payment gateways like Stripe/Razorpay, raw amounts are in subunits (cents/paise)
      return Math.round(val);
    }
    const str = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(str);
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
  }

  protected parseDateIso(val: any): string {
    if (!val) return new Date().toISOString();
    const d = new Date(val);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  }

  protected cleanString(val: any, fallback: string = ''): string {
    if (val === null || val === undefined) return fallback;
    return String(val).trim();
  }

  protected normalizeEmail(val: any): string {
    if (!val) return '';
    const clean = String(val).trim().toLowerCase();
    return clean.includes('@') ? clean : '';
  }

  protected normalizeCurrency(val: any, fallback: string = 'USD'): string {
    if (!val) return fallback.toUpperCase();
    return String(val).trim().toUpperCase();
  }

  protected normalizeInterval(val: any): CanonicalBillingInterval {
    const s = String(val || '').toLowerCase();
    if (s.includes('year') || s.includes('annual')) return 'yearly';
    if (s.includes('month')) return 'monthly';
    if (s.includes('week')) return 'weekly';
    if (s.includes('day')) return 'daily';
    if (s.includes('quarter')) return 'quarterly';
    if (s.includes('6_month') || s.includes('half')) return 'every_6_months';
    return 'monthly';
  }

  protected classifyFailure(code: string = '', message: string = '') {
    return normalizeFailureCategory(code, message);
  }
}
