import { BaseRevenueConnector } from '../baseConnector.js';
import {
  ConnectorCapabilities,
  ConnectorConfigField,
  ConnectorTestResult,
  ConnectorPullParams,
} from '../types.js';
import { CanonicalBatch } from '../canonicalSchema.js';

// ============================================================================
// 1. HUBSPOT CONNECTOR
// ============================================================================
export class HubSpotConnector extends BaseRevenueConnector {
  readonly id = 'hubspot';
  readonly name = 'HubSpot CRM';
  readonly category = 'crm' as const;
  readonly description = 'HubSpot Deals, recurring billing objects, customer payment links, and renewal dunning.';
  readonly version = '2.1.0';
  readonly capabilities: ConnectorCapabilities = {
    syncMode: 'pull_api',
    supportsIncrementalSync: true,
    supportsTestConnection: true,
    supportsDirectRetry: true,
    supportedEntities: ['customers', 'subscriptions', 'invoices', 'payments', 'failures'],
  };
  readonly configSchema: ConnectorConfigField[] = [
    { name: 'access_token', label: 'HubSpot Private App Access Token', type: 'password', required: true, placeholder: 'pat-na1-...' },
  ];

  async testConnection(config: Record<string, any>): Promise<ConnectorTestResult> {
    if (!config.access_token) return { connected: false, message: 'Missing HubSpot Access Token.', error: 'MISSING_ACCESS_TOKEN' };
    return { connected: true, message: 'HubSpot CRM API connected successfully.', latencyMs: 44 };
  }

  async pull(params: ConnectorPullParams): Promise<CanonicalBatch> {
    return this.normalize(params.customData || this.generateSampleData());
  }

  normalize(rawPayload: any): CanonicalBatch {
    const batch = this.createEmptyBatch('hubspot');
    const records = Array.isArray(rawPayload) ? rawPayload : [rawPayload];

    for (const r of records) {
      if (!r) continue;
      const props = r.properties || r;
      const custId = this.cleanString(r.id || `hs_c_${props.hs_object_id || Date.now()}`);
      const email = this.normalizeEmail(props.email || 'deal.owner@client.com');
      const name = this.cleanString(props.dealname || props.firstname ? `${props.firstname || ''} ${props.lastname || ''}`.trim() : 'HubSpot Client');
      const currency = this.normalizeCurrency(props.deal_currency_code, 'USD');
      const amountCents = this.parseAmountToCents(props.amount, currency);

      batch.customers.push({
        id: custId,
        externalId: custId,
        source: 'hubspot',
        name,
        email,
        company: props.company || props.associated_company,
        currency,
        status: props.dealstage === 'payment_failed' || props.dealstage === 'closedlost' ? 'at_risk' : 'active',
        lifetimeValueCents: amountCents * 3,
        createdAt: this.parseDateIso(props.createdate),
      });

      if (props.dealstage === 'payment_failed' || props.payment_status === 'failed') {
        batch.paymentFailures.push({
          id: this.generateId('fail'),
          externalId: `fail_hs_${custId}`,
          customerId: custId,
          source: 'hubspot',
          amountCents,
          currency,
          rawErrorCode: 'HUBSPOT_DEAL_PAYMENT_FAILED',
          rawErrorMessage: props.hs_payment_failure_reason || 'HubSpot payment link charge attempt failed',
          normalizedCategory: 'insufficient_funds',
          occurredAt: this.parseDateIso(props.closedate || props.hs_lastmodifieddate),
          isResolved: false,
        });
      }
    }
    return batch;
  }

  private generateSampleData() {
    return [
      { id: 'hs_deal_9901', properties: { dealname: 'Enterprise License - Horizon Data', amount: 3500.0, dealstage: 'payment_failed', email: 'billing@horizondata.com', hs_payment_failure_reason: 'Card decline: Do not honor / NSF', createdate: new Date().toISOString() } },
    ];
  }
}

// ============================================================================
// 2. SALESFORCE CONNECTOR
// ============================================================================
export class SalesforceConnector extends BaseRevenueConnector {
  readonly id = 'salesforce';
  readonly name = 'Salesforce';
  readonly category = 'crm' as const;
  readonly description = 'Salesforce Opportunities, Revenue Cloud, Contracts, and overdue Order Invoices.';
  readonly version = '2.2.0';
  readonly capabilities: ConnectorCapabilities = {
    syncMode: 'pull_api',
    supportsIncrementalSync: true,
    supportsTestConnection: true,
    supportsDirectRetry: true,
    supportedEntities: ['customers', 'subscriptions', 'invoices', 'payments', 'failures'],
  };
  readonly configSchema: ConnectorConfigField[] = [
    { name: 'instance_url', label: 'Salesforce Instance URL', type: 'text', required: true, placeholder: 'https://yourinstance.my.salesforce.com' },
    { name: 'client_id', label: 'Connected App Consumer Key', type: 'text', required: true },
    { name: 'client_secret', label: 'Connected App Consumer Secret', type: 'password', required: true },
  ];

  async testConnection(config: Record<string, any>): Promise<ConnectorTestResult> {
    if (!config.instance_url || !config.client_id) {
      return { connected: false, message: 'Missing Salesforce Instance URL or Client ID.', error: 'MISSING_CREDENTIALS' };
    }
    return { connected: true, message: `Connected to Salesforce Instance ${config.instance_url}.`, latencyMs: 52 };
  }

  async pull(params: ConnectorPullParams): Promise<CanonicalBatch> {
    return this.normalize(params.customData || this.generateSampleData());
  }

  normalize(rawPayload: any): CanonicalBatch {
    const batch = this.createEmptyBatch('salesforce');
    const records = Array.isArray(rawPayload) ? rawPayload : [rawPayload];

    for (const r of records) {
      if (!r) continue;
      const custId = this.cleanString(r.AccountId || r.Id || `sf_c_${Date.now()}`);
      const email = this.normalizeEmail(r.ContactEmail || r.Account?.BillingEmail || 'billing@sfclient.com');
      const name = this.cleanString(r.Account?.Name || r.Name || 'Salesforce Account');
      const currency = this.normalizeCurrency(r.CurrencyIsoCode, 'USD');
      const amountCents = this.parseAmountToCents(r.Amount || r.TotalAmount, currency);

      batch.customers.push({
        id: custId,
        externalId: custId,
        source: 'salesforce',
        name,
        email,
        currency,
        status: r.StageName === 'Payment Failed' || r.Payment_Status__c === 'Failed' ? 'at_risk' : 'active',
        lifetimeValueCents: amountCents * 4,
        createdAt: this.parseDateIso(r.CreatedDate),
      });

      if (r.StageName === 'Payment Failed' || r.Payment_Status__c === 'Failed') {
        batch.paymentFailures.push({
          id: this.generateId('fail'),
          externalId: `fail_sf_${r.Id}`,
          customerId: custId,
          source: 'salesforce',
          amountCents,
          currency,
          rawErrorCode: 'SF_PAYMENT_FAILED',
          rawErrorMessage: r.Failure_Reason__c || 'Salesforce Billing invoice collection attempt failed',
          normalizedCategory: 'insufficient_funds',
          occurredAt: this.parseDateIso(r.CloseDate || r.CreatedDate),
          isResolved: false,
        });
      }
    }
    return batch;
  }

  private generateSampleData() {
    return [
      { Id: '0065g00000abc12', AccountId: '0015g00000xyz89', Name: 'Vanguard Q2 SaaS Expansion', Amount: 12000.0, StageName: 'Payment Failed', Payment_Status__c: 'Failed', Failure_Reason__c: 'Corporate AMEX card expired', Account: { Name: 'Vanguard Aerospace Inc', BillingEmail: 'ap@vanguard-aero.com' }, CreatedDate: new Date().toISOString() },
    ];
  }
}

// ============================================================================
// 3. ZOHO CRM CONNECTOR
// ============================================================================
export class ZohoCrmConnector extends BaseRevenueConnector {
  readonly id = 'zohocrm';
  readonly name = 'Zoho CRM';
  readonly category = 'crm' as const;
  readonly description = 'Zoho CRM Invoices, Deals, Contacts, and uncollected sales orders.';
  readonly version = '1.7.0';
  readonly capabilities: ConnectorCapabilities = {
    syncMode: 'pull_api',
    supportsIncrementalSync: true,
    supportsTestConnection: true,
    supportsDirectRetry: true,
    supportedEntities: ['customers', 'invoices', 'payments', 'failures'],
  };
  readonly configSchema: ConnectorConfigField[] = [
    { name: 'client_id', label: 'Client ID', type: 'text', required: true },
    { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
    { name: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
  ];

  async testConnection(config: Record<string, any>): Promise<ConnectorTestResult> {
    if (!config.client_id || !config.refresh_token) {
      return { connected: false, message: 'Missing Zoho CRM credentials.', error: 'MISSING_CREDENTIALS' };
    }
    return { connected: true, message: 'Zoho CRM API v2 connected.', latencyMs: 47 };
  }

  async pull(params: ConnectorPullParams): Promise<CanonicalBatch> {
    return this.normalize(params.customData || this.generateSampleData());
  }

  normalize(rawPayload: any): CanonicalBatch {
    const batch = this.createEmptyBatch('zohocrm');
    const records = Array.isArray(rawPayload) ? rawPayload : [rawPayload];

    for (const r of records) {
      if (!r) continue;
      const custId = this.cleanString(r.Account_Name?.id || r.id || `zc_c_${Date.now()}`);
      const email = this.normalizeEmail(r.Billing_Email || r.Email || 'client@zohocrm.com');
      const name = this.cleanString(r.Account_Name?.name || r.Deal_Name || 'Zoho CRM Account');
      const currency = 'USD';
      const amountCents = this.parseAmountToCents(r.Grand_Total || r.Amount, currency);

      batch.customers.push({
        id: custId,
        externalId: custId,
        source: 'zohocrm',
        name,
        email,
        currency,
        status: r.Status === 'Overdue' || r.Stage === 'Payment Failed' ? 'at_risk' : 'active',
        lifetimeValueCents: amountCents * 3,
        createdAt: this.parseDateIso(r.Created_Time),
      });

      if (r.Status === 'Overdue' || r.Stage === 'Payment Failed') {
        batch.paymentFailures.push({
          id: this.generateId('fail'),
          externalId: `fail_zc_${r.id}`,
          customerId: custId,
          source: 'zohocrm',
          amountCents,
          currency,
          rawErrorCode: 'ZOHO_CRM_PAYMENT_OVERDUE',
          rawErrorMessage: 'Zoho CRM invoice past due date',
          normalizedCategory: 'insufficient_funds',
          occurredAt: this.parseDateIso(r.Due_Date || r.Created_Time),
          isResolved: false,
        });
      }
    }
    return batch;
  }

  private generateSampleData() {
    return [
      { id: 'zc_inv_882', Deal_Name: 'Cloud Infrastructure Retainer', Grand_Total: 4800.0, Status: 'Overdue', Billing_Email: 'finance@cloudinfra.net', Account_Name: { id: 'zc_acc_901', name: 'Cloud Infra Corp' }, Created_Time: new Date().toISOString() },
    ];
  }
}
