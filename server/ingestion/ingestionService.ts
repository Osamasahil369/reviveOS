import crypto from 'crypto';
import { db } from '../store/db.js';
import { universalConnectorRegistry } from './registry.js';
import './connectors/index.js'; // Ensure all 30 connectors are registered
import {
  CanonicalBatch,
  CanonicalCustomer,
  CanonicalInvoice,
  CanonicalSubscription,
  CanonicalPayment,
  CanonicalPaymentFailure,
} from './canonicalSchema.js';
import {
  IngestionJobRecord,
  IngestionSummaryMetrics,
  SourceCategory,
} from './types.js';
import { RevenueLeakScanner } from '../scanner/revenueScanner.js';
import { AutonomousRecoveryEngine } from '../services/autonomousRecoveryEngine.js';
import { RecoveryDispatchEngine } from '../services/recoveryDispatchEngine.js';
import { RevenueBrainEngine } from '../intelligence/revenueBrain.js';
import {
  Customer,
  Subscription,
  Invoice,
  Payment,
  PaymentFailure,
  RecoveryOpportunity,
} from '../../src/types/index.js';

export class UniversalIngestionService {
  private static jobs: IngestionJobRecord[] = [];

  /**
   * Execute an ingestion job for any registered connector
   */
  public static async executeIngestion(
    workspaceId: string,
    connectorId: string,
    config: Record<string, any> = {},
    customData?: any,
    options: { deduplicationMode?: 'merge' | 'skip'; runScanner?: boolean; triggerAutopilot?: boolean } = {}
  ): Promise<{
    job: IngestionJobRecord;
    batch: CanonicalBatch;
    opportunitiesCreated: RecoveryOpportunity[];
    scannerResult?: any;
    revenueBrainResult?: any;
  }> {
    const workspace = db.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const connector = universalConnectorRegistry.get(connectorId);
    if (!connector) {
      throw new Error(`Connector "${connectorId}" is not registered in the Universal Connector Registry.`);
    }

    const jobId = `job_ingest_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const startTime = Date.now();

    const job: IngestionJobRecord = {
      id: jobId,
      workspaceId,
      connectorId: connector.id,
      connectorName: connector.name,
      category: connector.category,
      status: 'running',
      startedAt: new Date().toISOString(),
      recordsExtracted: 0,
      customersIngested: 0,
      subscriptionsIngested: 0,
      invoicesIngested: 0,
      paymentsIngested: 0,
      failuresIngested: 0,
      opportunitiesGenerated: 0,
      totalAtRiskCents: 0,
      currency: workspace.currency || 'USD',
      downstreamPipelineSummary: {
        scannerExecuted: false,
        missionsUpdated: false,
        autopilotTriggered: false,
        emailRecoveryQueued: false,
        revenueBrainRefreshed: false,
      },
    };

    try {
      // 1. EXTRACT / PULL DATA FROM CONNECTOR
      const batch = await connector.pull({
        workspaceId,
        config,
        customData,
      });

      job.recordsExtracted =
        batch.customers.length +
        batch.subscriptions.length +
        batch.invoices.length +
        batch.payments.length +
        batch.paymentFailures.length;

      // 2. NORMALIZE & PERSIST CANONICAL ENTITIES INTO WORKSPACE DATABASE
      const existingCustomers = db.getCustomers(workspaceId);
      const custByEmail = new Map<string, Customer>();
      const custByExtId = new Map<string, Customer>();
      for (const c of existingCustomers) {
        if (c.email) custByEmail.set(c.email.toLowerCase(), c);
        if (c.provider_customer_id) custByExtId.set(c.provider_customer_id.toLowerCase(), c);
      }

      const dedupeMode = options.deduplicationMode || 'merge';
      const createdOpps: RecoveryOpportunity[] = [];
      const nowIso = new Date().toISOString();

      // Ingest Customers
      for (const cc of batch.customers) {
        const emailKey = cc.email ? cc.email.toLowerCase() : '';
        const extKey = cc.externalId ? cc.externalId.toLowerCase() : '';
        const existing = (emailKey ? custByEmail.get(emailKey) : undefined) || (extKey ? custByExtId.get(extKey) : undefined);

        let customer: Customer;
        if (existing) {
          if (dedupeMode === 'skip') continue;
          customer = existing;
          customer.name = cc.name || customer.name;
          if (cc.phone) customer.phone = cc.phone;
          customer.currency = cc.currency || customer.currency;
          customer.lifetime_value_cents = (customer.lifetime_value_cents || 0) + (cc.lifetimeValueCents || 0);
          if (cc.status === 'at_risk' || cc.status === 'past_due') {
            customer.current_risk_status = 'at_risk';
          }
          customer.updated_at = nowIso;
        } else {
          customer = {
            id: `cust_${connector.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            workspace_id: workspaceId,
            provider_type: (connector.category === 'payments' ? connector.id : 'stripe') as any,
            provider_customer_id: cc.externalId || cc.id,
            email: cc.email,
            name: cc.name,
            phone: cc.phone,
            country: cc.country || (cc.currency === 'INR' ? 'IN' : 'US'),
            currency: cc.currency || workspace.currency || 'USD',
            lifetime_value_cents: cc.lifetimeValueCents || 0,
            total_recovered_cents: 0,
            current_risk_status: cc.status === 'at_risk' || cc.status === 'past_due' ? 'at_risk' : 'healthy',
            created_at: cc.createdAt || nowIso,
            updated_at: nowIso,
          };
          db.addCustomer(customer);
          if (emailKey) custByEmail.set(emailKey, customer);
          if (extKey) custByExtId.set(extKey, customer);
          job.customersIngested++;
        }
      }

      // Ingest Subscriptions
      for (const cs of batch.subscriptions) {
        const cust = custByExtId.get(cs.customerId.toLowerCase()) || custByEmail.get(cs.customerId.toLowerCase()) || db.getCustomers(workspaceId)[0];
        if (!cust) continue;

        const sub: Subscription = {
          id: `sub_${connector.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          workspace_id: workspaceId,
          customer_id: cust.id,
          provider_type: (connector.category === 'payments' ? connector.id : 'stripe') as any,
          provider_subscription_id: cs.externalId,
          plan_name: cs.planName,
          amount_cents: cs.amountCents,
          currency: cs.currency || cust.currency,
          billing_interval: cs.billingInterval as any,
          status: cs.status as any,
          subscription_start_date: cs.currentPeriodStart || nowIso,
          current_period_end: cs.currentPeriodEnd || nowIso,
          renewal_count: 0,
          created_at: cs.createdAt || nowIso,
          updated_at: nowIso,
        };
        db.addSubscription(sub);
        job.subscriptionsIngested++;
      }

      // Ingest Invoices
      for (const ci of batch.invoices) {
        const cust = custByExtId.get(ci.customerId.toLowerCase()) || custByEmail.get(ci.customerId.toLowerCase()) || db.getCustomers(workspaceId)[0];
        if (!cust) continue;

        const inv: Invoice = {
          id: `inv_${connector.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          workspace_id: workspaceId,
          customer_id: cust.id,
          subscription_id: ci.subscriptionId,
          provider_type: (connector.category === 'payments' ? connector.id : 'stripe') as any,
          provider_invoice_id: ci.externalId,
          amount_cents: ci.amountCents,
          currency: ci.currency || cust.currency,
          status: ci.status as any,
          due_date: ci.dueDate || nowIso,
          paid_at: ci.paidAt,
          hosted_invoice_url: ci.hostedInvoiceUrl,
          created_at: ci.createdAt || nowIso,
        };
        db.addInvoice(inv);
        job.invoicesIngested++;
      }

      // Ingest Payments as Invoices
      for (const cp of batch.payments) {
        const cust = custByExtId.get(cp.customerId.toLowerCase()) || custByEmail.get(cp.customerId.toLowerCase()) || db.getCustomers(workspaceId)[0];
        if (!cust) continue;

        const inv: Invoice = {
          id: `pay_inv_${connector.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          workspace_id: workspaceId,
          customer_id: cust.id,
          provider_type: (connector.category === 'payments' ? connector.id : 'stripe') as any,
          provider_invoice_id: cp.externalId,
          amount_cents: cp.amountCents,
          currency: cp.currency || cust.currency,
          status: cp.status === 'succeeded' ? 'paid' : (cp.status as any),
          due_date: cp.createdAt || nowIso,
          paid_at: cp.status === 'succeeded' ? (cp.createdAt || nowIso) : undefined,
          created_at: cp.createdAt || nowIso,
        };
        db.addInvoice(inv);
        job.paymentsIngested++;
      }

      // Ingest Payment Failures & Generate Recovery Opportunities
      for (const cf of batch.paymentFailures) {
        const cust = custByExtId.get(cf.customerId.toLowerCase()) || custByEmail.get(cf.customerId.toLowerCase()) || db.getCustomers(workspaceId)[0];
        if (!cust) continue;

        const failId = `fail_${connector.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const failure: PaymentFailure = {
          id: failId,
          workspace_id: workspaceId,
          customer_id: cust.id,
          invoice_id: cf.invoiceId,
          amount_cents: cf.amountCents,
          currency: cf.currency || cust.currency,
          provider_type: (connector.category === 'payments' ? connector.id : 'stripe') as any,
          provider_failure_code: cf.rawErrorCode,
          raw_error_message: cf.rawErrorMessage,
          normalized_category: cf.normalizedCategory,
          occurred_at: cf.occurredAt || nowIso,
          is_resolved: cf.isResolved || false,
          created_at: nowIso,
        };
        db.addPaymentFailure(failure);
        job.failuresIngested++;
        job.totalAtRiskCents += cf.amountCents;

        // Create Canonical Recovery Opportunity
        const opp = db.createRecoveryOpportunity(workspaceId, {
          customer_id: cust.id,
          payment_failure_id: failure.id,
          amount_at_risk_cents: cf.amountCents,
          currency: cf.currency || cust.currency,
          failure_category: cf.normalizedCategory,
          status: 'new',
          customer: cust,
          payment_failure: failure,
          recommended_action: `Recover ${cf.normalizedCategory.replace(/_/g, ' ')} via canonical multi-channel dunning link`,
        });
        createdOpps.push(opp);
        job.opportunitiesGenerated++;
      }

      // 3. DOWNSTREAM INTEGRATIONS EXECUTION
      // ===================================
      let scannerResult: any = null;
      let revenueBrainResult: any = null;

      // 3A. RECOVERY SCANNER
      if (options.runScanner !== false) {
        try {
          scannerResult = await RevenueLeakScanner.executeScan(workspaceId, { dryRun: false });
          if (job.downstreamPipelineSummary) {
            job.downstreamPipelineSummary.scannerExecuted = true;
          }
        } catch (scanErr) {
          console.warn('[Ingestion Pipeline] Scanner notification warning:', scanErr);
        }
      }

      // 3B. RECOVERY AUTOPILOT & RECOVERY DISPATCH
      if (options.triggerAutopilot !== false && createdOpps.length > 0) {
        try {
          for (const opp of createdOpps.slice(0, 10)) {
            const autoRes = await AutonomousRecoveryEngine.processOpportunity(workspaceId, opp.id);
            if (autoRes.executed && autoRes.workflow) {
              await RecoveryDispatchEngine.dispatchWorkflow(workspaceId, autoRes.workflow.id);
            }
          }
          if (job.downstreamPipelineSummary) {
            job.downstreamPipelineSummary.autopilotTriggered = true;
            job.downstreamPipelineSummary.emailRecoveryQueued = true;
          }
        } catch (autoErr) {
          console.warn('[Ingestion Pipeline] Autopilot warning:', autoErr);
        }
      }

      // 3C. REVENUE BRAIN COMMAND LAYER
      try {
        revenueBrainResult = await RevenueBrainEngine.evaluateWorkspace(workspaceId);
        if (job.downstreamPipelineSummary) {
          job.downstreamPipelineSummary.revenueBrainRefreshed = true;
          job.downstreamPipelineSummary.missionsUpdated = true;
        }
      } catch (rbErr) {
        console.warn('[Ingestion Pipeline] Revenue Brain warning:', rbErr);
      }

      // 4. FINALIZE JOB
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.durationMs = Date.now() - startTime;
      UniversalIngestionService.jobs.unshift(job);

      // Audit log
      db.recordAuditLog(
        workspaceId,
        'data_ingestion.completed',
        'universal_connector',
        jobId,
        {
          connectorId: connector.id,
          records: job.recordsExtracted,
          failures: job.failuresIngested,
          opportunities: job.opportunitiesGenerated,
          atRiskCents: job.totalAtRiskCents,
        },
        'System Ingestion Pipeline'
      );

      return {
        job,
        batch,
        opportunitiesCreated: createdOpps,
        scannerResult,
        revenueBrainResult,
      };
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || String(err);
      job.completedAt = new Date().toISOString();
      job.durationMs = Date.now() - startTime;
      UniversalIngestionService.jobs.unshift(job);
      throw err;
    }
  }

  /**
   * Test connection credentials for any registered connector
   */
  public static async testConnector(
    connectorId: string,
    config: Record<string, any>
  ) {
    const connector = universalConnectorRegistry.get(connectorId);
    if (!connector) {
      throw new Error(`Connector "${connectorId}" is not registered.`);
    }
    return connector.testConnection(config);
  }

  /**
   * List recent ingestion jobs for a workspace
   */
  public static getJobs(workspaceId?: string): IngestionJobRecord[] {
    if (!workspaceId) return this.jobs;
    return this.jobs.filter((j) => j.workspaceId === workspaceId);
  }

  /**
   * Aggregate metrics across all ingested sources
   */
  public static getSummary(workspaceId: string): IngestionSummaryMetrics {
    const workspaceJobs = this.getJobs(workspaceId);
    const allConnectors = universalConnectorRegistry.getAll();

    const categoryMap: Record<SourceCategory, { connectorsCount: number; recordsCount: number }> = {
      payments: { connectorsCount: 0, recordsCount: 0 },
      ecommerce: { connectorsCount: 0, recordsCount: 0 },
      accounting: { connectorsCount: 0, recordsCount: 0 },
      crm: { connectorsCount: 0, recordsCount: 0 },
      files: { connectorsCount: 0, recordsCount: 0 },
      databases: { connectorsCount: 0, recordsCount: 0 },
      universal_api: { connectorsCount: 0, recordsCount: 0 },
    };

    allConnectors.forEach((c) => {
      if (categoryMap[c.category]) {
        categoryMap[c.category].connectorsCount++;
      }
    });

    workspaceJobs.forEach((j) => {
      if (categoryMap[j.category]) {
        categoryMap[j.category].recordsCount += j.recordsExtracted;
      }
    });

    const totalAtRisk = workspaceJobs.reduce((acc, j) => acc + (j.totalAtRiskCents || 0), 0);
    const uniqueSourcesConnected = new Set(workspaceJobs.map((j) => j.connectorId)).size;

    return {
      totalConnectorsAvailable: allConnectors.length,
      totalSourcesConnected: uniqueSourcesConnected,
      totalIngestionJobsRun: workspaceJobs.length,
      totalCustomersUnified: workspaceJobs.reduce((acc, j) => acc + (j.customersIngested || 0), 0),
      totalAtRiskRevenueCents: totalAtRisk,
      totalRecoverableRevenueCents: Math.round(totalAtRisk * 0.72),
      breakdownByCategory: categoryMap,
    };
  }
}
