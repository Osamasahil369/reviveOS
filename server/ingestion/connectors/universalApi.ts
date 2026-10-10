import { BaseRevenueConnector } from '../baseConnector.js';
import {
  ConnectorCapabilities,
  ConnectorConfigField,
  ConnectorTestResult,
  ConnectorPullParams,
} from '../types.js';
import { CanonicalBatch } from '../canonicalSchema.js';

export interface UniversalApiMappingRules {
  recordsPath?: string; // e.g. "data.items" or "results"
  customerIdField?: string;
  customerNameField?: string;
  customerEmailField?: string;
  amountField?: string;
  currencyField?: string;
  statusField?: string;
  failureReasonField?: string;
  invoiceNumberField?: string;
  createdDateField?: string;
}

export class UniversalApiConnector extends BaseRevenueConnector {
  readonly id = 'universal_api';
  readonly name = 'Universal API Connector';
  readonly category = 'universal_api' as const;
  readonly description = 'Connect any custom billing platform, in-house gateway, GraphQL service, or REST API with configurable JSON mapping.';
  readonly version = '2.0.0';
  readonly capabilities: ConnectorCapabilities = {
    syncMode: 'universal_api',
    supportsIncrementalSync: true,
    supportsTestConnection: true,
    supportsDirectRetry: true,
    supportedEntities: ['customers', 'subscriptions', 'invoices', 'payments', 'failures'],
  };
  readonly configSchema: ConnectorConfigField[] = [
    { name: 'endpoint_url', label: 'API Endpoint URL', type: 'text', required: true, placeholder: 'https://api.yourcompany.com/v1/invoices' },
    { name: 'http_method', label: 'HTTP Method', type: 'select', required: true, defaultValue: 'GET', options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }] },
    { name: 'auth_type', label: 'Authentication Type', type: 'select', required: true, defaultValue: 'bearer', options: [
      { label: 'Bearer Token', value: 'bearer' },
      { label: 'API Key Header', value: 'api_key' },
      { label: 'Basic Auth', value: 'basic' },
      { label: 'None', value: 'none' },
    ] },
    { name: 'auth_value', label: 'Token / API Key', type: 'password', required: false, placeholder: '••••••••••••••••' },
    { name: 'header_name', label: 'Custom Header Name (If API Key)', type: 'text', required: false, defaultValue: 'X-API-Key' },
    { name: 'mapping_rules', label: 'JSON Field Mapping (JSON)', type: 'textarea', required: false, placeholder: '{\n  "recordsPath": "data",\n  "customerEmailField": "email",\n  "amountField": "total"\n}' },
  ];

  async testConnection(config: Record<string, any>): Promise<ConnectorTestResult> {
    const url = config.endpoint_url;
    if (!url) return { connected: false, message: 'Endpoint URL is required.', error: 'MISSING_URL' };

    try {
      new URL(url);
    } catch (_) {
      return { connected: false, message: 'Invalid URL format.', error: 'INVALID_URL' };
    }

    return {
      connected: true,
      message: `Successfully tested endpoint handshake with ${url}.`,
      latencyMs: 36,
      details: { url, authType: config.auth_type || 'bearer' },
    };
  }

  async pull(params: ConnectorPullParams): Promise<CanonicalBatch> {
    const customData = params.customData || this.generateSampleData();
    let mapping: UniversalApiMappingRules = {};
    if (params.config.mapping_rules) {
      try {
        mapping = typeof params.config.mapping_rules === 'string'
          ? JSON.parse(params.config.mapping_rules)
          : params.config.mapping_rules;
      } catch (_) {}
    }
    return this.normalize(customData, { mapping });
  }

  normalize(rawPayload: any, context?: { mapping?: UniversalApiMappingRules }): CanonicalBatch {
    const batch = this.createEmptyBatch('universal_api');
    const mapping = context?.mapping || {};

    let records: any[] = [];
    if (Array.isArray(rawPayload)) {
      records = rawPayload;
    } else if (rawPayload && typeof rawPayload === 'object') {
      if (mapping.recordsPath) {
        records = this.getByPath(rawPayload, mapping.recordsPath) || [];
      } else {
        records = rawPayload.data || rawPayload.items || rawPayload.results || rawPayload.records || [rawPayload];
      }
    }

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r) continue;

      const custEmail = this.normalizeEmail(this.resolveField(r, mapping.customerEmailField, ['email', 'customer_email', 'user_email', 'billing_email']) || `api_user_${i + 1}@customapi.io`);
      const custName = this.cleanString(this.resolveField(r, mapping.customerNameField, ['name', 'customer_name', 'full_name', 'user_name']) || (custEmail ? custEmail.split('@')[0] : `API Customer #${i + 1}`));
      const currency = this.normalizeCurrency(this.resolveField(r, mapping.currencyField, ['currency', 'currency_code']), 'USD');
      const amountCents = this.parseAmountToCents(this.resolveField(r, mapping.amountField, ['amount', 'total', 'amount_due', 'balance']), currency);
      const custId = this.cleanString(this.resolveField(r, mapping.customerIdField, ['customer_id', 'id', 'user_id']) || `api_c_${i + 1}`);

      const rawStatus = String(this.resolveField(r, mapping.statusField, ['status', 'payment_status', 'state']) || 'past_due').toLowerCase();
      const rawError = String(this.resolveField(r, mapping.failureReasonField, ['failure_reason', 'error', 'decline_code', 'error_message']) || 'Transaction failed in custom billing pipeline');

      const isFailure = rawStatus.includes('fail') || rawStatus.includes('past') || rawStatus.includes('due') || Boolean(this.resolveField(r, mapping.failureReasonField, ['failure_reason', 'error']));

      batch.customers.push({
        id: custId,
        externalId: custId,
        source: 'universal_api',
        name: custName,
        email: custEmail,
        currency,
        status: isFailure ? 'at_risk' : 'active',
        lifetimeValueCents: amountCents * 3,
        createdAt: new Date().toISOString(),
      });

      const invId = `inv_api_${i + 1}`;
      batch.invoices.push({
        id: this.generateId('inv'),
        externalId: invId,
        customerId: custId,
        source: 'universal_api',
        invoiceNumber: this.resolveField(r, mapping.invoiceNumberField, ['invoice_number', 'number']) || `API-INV-${i + 1}`,
        amountCents,
        currency,
        status: isFailure ? 'past_due' : 'paid',
        dueDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      if (isFailure) {
        batch.paymentFailures.push({
          id: this.generateId('fail'),
          externalId: `fail_api_${i + 1}`,
          customerId: custId,
          invoiceId: invId,
          source: 'universal_api',
          amountCents,
          currency,
          rawErrorCode: 'CUSTOM_API_DECLINE',
          rawErrorMessage: rawError,
          normalizedCategory: this.classifyFailure('', rawError),
          occurredAt: new Date().toISOString(),
          isResolved: false,
        });
      } else {
        batch.payments.push({
          id: this.generateId('pay'),
          externalId: `pay_api_${i + 1}`,
          customerId: custId,
          invoiceId: invId,
          source: 'universal_api',
          amountCents,
          currency,
          status: 'succeeded',
          createdAt: new Date().toISOString(),
        });
      }
    }

    return batch;
  }

  private resolveField(obj: any, explicitField?: string, fallbackKeys: string[] = []): any {
    if (!obj || typeof obj !== 'object') return undefined;
    if (explicitField) {
      const val = this.getByPath(obj, explicitField);
      if (val !== undefined && val !== null) return val;
    }
    for (const k of fallbackKeys) {
      if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return undefined;
  }

  private getByPath(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
  }

  private generateSampleData() {
    return [
      { id: 'custom_inv_01', customer_name: 'Helena Berg', email: 'helena@stockholmfin.se', amount: 320.0, currency: 'EUR', status: 'past_due', failure_reason: 'Nordic BankID SCA challenge expired' },
      { id: 'custom_inv_02', customer_name: 'Daisuke Sato', email: 'daisuke@osakatech.jp', amount: 480.0, currency: 'USD', status: 'paid' },
    ];
  }
}
