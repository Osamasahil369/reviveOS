import { db } from '../store/db.js';
import { supabaseService } from '../db/supabaseService.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import {
  RecoveryOpportunity,
  Customer,
  Subscription,
  Invoice,
  PaymentFailure,
  FailureCategory,
} from '../../src/types/index.js';
import { calculateCustomerHealthScore } from '../../src/utils/healthScore.js';
import {
  calculateCanonicalFinancials,
  type ScannerCurrencyTotal,
  type CanonicalLeak,
} from './canonicalFinancials.js';

export type { ScannerCurrencyTotal, CanonicalLeak };
export { calculateCanonicalFinancials };

export interface ScannerVectorSummary {
  vectorId: string;
  name: string;
  scannedCount: number;
  detectedCount: number;
  amountAtRiskCents: number;
  status: 'clean' | 'leaks_detected' | 'insufficient_data';
  description: string;
  signalsUsed: string[];
}

export interface ScannerRunResult {
  workspaceId: string;
  scannedAt: string;
  totalRecordsAudited: number;
  totalAtRiskCents: number;
  totalRecoverableRevenueCents: number;
  riskSignalsCount: number;
  expansionOpportunityCents: number;
  newOpportunitiesCreated: number;
  existingOpportunitiesMaintained: number;
  currency: string;
  totalsByCurrency: Record<string, ScannerCurrencyTotal>;
  vectors: ScannerVectorSummary[];
  createdOpportunities: RecoveryOpportunity[];
  methodology: {
    engineType: 'deterministic_rule_based';
    aiDisclosure: string;
    idempotent: boolean;
  };
}

export class RevenueLeakScanner {
  /**
   * Re-export canonical financial calculator for system-wide metrics consistency.
   */
  public static calculateCanonicalFinancials = calculateCanonicalFinancials;

  /**
   * Run a comprehensive, authoritative financial audit across all workspace records.
   * Enforces canonical single-obligation accounting, separates risk signals and expansion
   * upside from confirmed Revenue At Risk, and guarantees database schema integrity.
   */
  public static async executeScan(
    workspaceId: string,
    options: { dryRun?: boolean; categoryFilter?: string } = {}
  ): Promise<ScannerRunResult> {
    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new Error('Valid workspaceId is required for Revenue Leak Scanner execution.');
    }

    // 1. Ingest raw underlying authoritative records
    let customers: Customer[] = [];
    let subscriptions: Subscription[] = [];
    let invoices: Invoice[] = [];
    let paymentFailures: PaymentFailure[] = [];
    let existingOpps: RecoveryOpportunity[] = [];

    if (isSupabaseAuthoritative()) {
      customers = await supabaseService.getCustomers(workspaceId);
      subscriptions = await supabaseService.getSubscriptions(workspaceId);
      invoices = await supabaseService.getInvoices(workspaceId);
      paymentFailures = await supabaseService.getPaymentFailures(workspaceId);
      existingOpps = await supabaseService.getRecoveryOpportunities(workspaceId);
    } else {
      customers = db.getCustomers(workspaceId);
      subscriptions = db.getSubscriptions(workspaceId);
      invoices = db.getInvoices(workspaceId);
      paymentFailures = db.getPaymentFailures(workspaceId);
      existingOpps = db.getOpportunities(workspaceId);
    }

    let defaultCurrency = 'USD';
    if (isSupabaseAuthoritative()) {
      const ws = await supabaseService.getWorkspaceById(workspaceId);
      if (ws?.currency) defaultCurrency = ws.currency;
    } else {
      const ws = db.getWorkspace(workspaceId);
      if (ws?.currency) defaultCurrency = ws.currency;
    }

    const totalRecords = customers.length + subscriptions.length + invoices.length + paymentFailures.length;

    // Handle empty workspace: Return honest zero/insufficient-data state
    if (totalRecords === 0) {
      return {
        workspaceId,
        scannedAt: new Date().toISOString(),
        totalRecordsAudited: 0,
        totalAtRiskCents: 0,
        totalRecoverableRevenueCents: 0,
        riskSignalsCount: 0,
        expansionOpportunityCents: 0,
        newOpportunitiesCreated: 0,
        existingOpportunitiesMaintained: 0,
        currency: defaultCurrency,
        totalsByCurrency: {
          [defaultCurrency]: {
            totalAtRiskCents: 0,
            totalRecoverableRevenueCents: 0,
            expansionOpportunityCents: 0,
          },
        },
        vectors: [
          {
            vectorId: 'vec_failed_payments',
            name: 'Confirmed Billing Leakage',
            scannedCount: 0,
            detectedCount: 0,
            amountAtRiskCents: 0,
            status: 'insufficient_data',
            description: 'No billing records available for audit.',
            signalsUsed: ['payment_failure.normalized_category', 'invoices.status', 'invoices.amount_cents'],
          },
          {
            vectorId: 'vec_repeated_failures',
            name: 'Compounding Payment Failures',
            scannedCount: 0,
            detectedCount: 0,
            amountAtRiskCents: 0,
            status: 'insufficient_data',
            description: 'No failure history available.',
            signalsUsed: ['payment_failures.count_per_customer >= 2'],
          },
          {
            vectorId: 'vec_renewal_risks',
            name: 'Subscription Renewal Risks',
            scannedCount: 0,
            detectedCount: 0,
            amountAtRiskCents: 0,
            status: 'insufficient_data',
            description: 'No subscription records available.',
            signalsUsed: ['subscriptions.current_period_end <= 14d', 'supporting_failure_evidence'],
          },
          {
            vectorId: 'vec_churn_signals',
            name: 'Behavioral Churn Risk Signals',
            scannedCount: 0,
            detectedCount: 0,
            amountAtRiskCents: 0,
            status: 'insufficient_data',
            description: 'No customer activity data.',
            signalsUsed: ['customer.health_score < 50', 'customer.current_risk_status in (at_risk)'],
          },
          {
            vectorId: 'vec_expansion_telemetry',
            name: 'Expansion Opportunity Signals',
            scannedCount: 0,
            detectedCount: 0,
            amountAtRiskCents: 0,
            status: 'insufficient_data',
            description: 'No customer telemetry available.',
            signalsUsed: ['metadata.expansion_signal', 'verified_growth_history'],
          },
        ],
        createdOpportunities: [],
        methodology: {
          engineType: 'deterministic_rule_based',
          aiDisclosure:
            'ReviveOS uses deterministic mathematical rules and authoritative ledger validation. We do not use hallucinating black-box LLMs for financial state detection.',
          idempotent: true,
        },
      };
    }

    // Build lookup maps for relational integrity
    const customerMap = new Map<string, Customer>();
    customers.forEach((c) => customerMap.set(c.id, c));

    // Track existing tracked keys for strict idempotency
    const existingFailureIds = new Set<string>();
    const existingInvoiceIds = new Set<string>();
    existingOpps.forEach((opp) => {
      if (opp.payment_failure_id) existingFailureIds.add(opp.payment_failure_id);
      if (opp.invoice?.id) existingInvoiceIds.add(opp.invoice.id);
      if (opp.invoice?.provider_invoice_id) existingInvoiceIds.add(opp.invoice.provider_invoice_id);
      if ((opp as any).invoice_id) existingInvoiceIds.add((opp as any).invoice_id);
    });

    let existingOpportunitiesMaintained = 0;
    let riskSignalsCount = 0;

    // =========================================================================
    // CANONICAL FINANCIAL LEAK ACCOUNTING (VECTORS 1 & UNDERLYING EXPOSURE)
    // =========================================================================
    const canonicalResult = calculateCanonicalFinancials({
      paymentFailures,
      invoices,
      defaultCurrency,
      categoryFilter: options.categoryFilter,
    });

    // Attach relational customer & subscription objects for opportunity creation
    const canonicalLeaks = canonicalResult.canonicalLeaks;

    // Prepare opportunities for persistence:
    // CRITICAL: recovery_opportunities.payment_failure_id is NOT NULL in database schema.
    // If an invoice has no actual payment failure, DO NOT fabricate a payment failure or ID.
    // Only persist RecoveryOpportunity when payment_failure_id is present and authentic.
    const newOpportunitiesToCreate: Partial<RecoveryOpportunity>[] = [];

    for (const leak of canonicalLeaks) {
      const cust = customerMap.get(leak.customerId);
      // Strict relational integrity: do NOT create recovery opportunity if customer is missing/non-existent
      if (!cust) {
        continue;
      }

      const sub = subscriptions.find((s) => s.id === leak.invoice?.subscription_id || s.customer_id === leak.customerId);

      // Check if an existing opportunity already tracks this failure or invoice
      const isAlreadyTracked =
        (leak.paymentFailureId && existingFailureIds.has(leak.paymentFailureId)) ||
        (leak.invoiceId && existingInvoiceIds.has(leak.invoiceId)) ||
        (leak.invoice?.provider_invoice_id && existingInvoiceIds.has(leak.invoice.provider_invoice_id));

      if (isAlreadyTracked) {
        existingOpportunitiesMaintained++;
        continue;
      }

      // Respect database constraint: payment_failure_id is required
      if (!leak.paymentFailureId) {
        // Expose as detected financial leak in reporting, but do NOT insert invalid row
        continue;
      }

      newOpportunitiesToCreate.push({
        workspace_id: workspaceId,
        customer_id: leak.customerId,
        payment_failure_id: leak.paymentFailureId,
        amount_at_risk_cents: leak.amountCents,
        currency: leak.currency,
        failure_category: leak.failureCategory,
        recommended_action: leak.recommendedAction,
        status: 'new',
        customer: cust,
        subscription: sub,
        invoice: leak.invoice,
        payment_failure: leak.paymentFailure,
      });

      existingFailureIds.add(leak.paymentFailureId);
      if (leak.invoiceId) existingInvoiceIds.add(leak.invoiceId);
    }

    // Vector 1 Summary metrics
    const v1Scanned = paymentFailures.length + invoices.length;
    const v1Detected = canonicalLeaks.length;
    let v1AmountAtRisk = 0;
    canonicalLeaks.forEach((leak) => {
      v1AmountAtRisk += leak.amountCents;
    });

    // =========================================================================
    // VECTOR 2: Repeated Payment Failures (Escalation Signal, NOT New Financial Loss)
    // =========================================================================
    let v2Scanned = 0;
    let v2Detected = 0;
    const failuresByCustomer = new Map<string, number>();
    paymentFailures.forEach((pf) => {
      // Resolved failures are resolved historical records; only active unresolved failures count towards compounding repeated failure signals
      if (pf.is_resolved) return;
      failuresByCustomer.set(pf.customer_id, (failuresByCustomer.get(pf.customer_id) || 0) + 1);
    });

    failuresByCustomer.forEach((count) => {
      v2Scanned++;
      if (count >= 2) {
        v2Detected++;
        riskSignalsCount++;
      }
    });

    // =========================================================================
    // VECTOR 3: Subscription Renewal Risks (Evidence-Based, Expected Renewals Excluded)
    // =========================================================================
    let v3Scanned = 0;
    let v3Detected = 0;
    const now = new Date();
    const fourteenDaysAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    for (const sub of subscriptions) {
      if (sub.status === 'canceled' || sub.status === 'paused') continue;

      const renewalDateStr = sub.current_period_end || sub.next_billing_date;
      if (!renewalDateStr) continue;

      const renewalDate = new Date(renewalDateStr);
      if (isNaN(renewalDate.getTime())) continue;

      const isUpcomingRenewal = renewalDate <= fourteenDaysAhead;
      if (isUpcomingRenewal) {
        v3Scanned++;
        const cust = customerMap.get(sub.customer_id);

        // Check for supporting failure evidence (ignoring resolved failures):
        const hasPaymentFailures = paymentFailures.some((pf) => pf.customer_id === sub.customer_id && !pf.is_resolved);
        const hasUnpaidInvoice = invoices.some(
          (inv) =>
            inv.customer_id === sub.customer_id &&
            (inv.status === 'open' || inv.status === 'past_due' || inv.status === 'uncollectible')
        );
        const isCustomerAtRisk = cust?.current_risk_status === 'at_risk';

        if (hasPaymentFailures || hasUnpaidInvoice || isCustomerAtRisk) {
          v3Detected++;
          riskSignalsCount++;
        }
        // Normal upcoming renewal without evidence is an expected renewal, NOT a leak.
      }
    }

    // =========================================================================
    // VECTOR 4: Behavioral Churn Risk Signals (Risk Signal, NOT Confirmed Loss)
    // =========================================================================
    let v4Scanned = 0;
    let v4Detected = 0;

    for (const cust of customers) {
      v4Scanned++;
      // Active unresolved failures only for churn risk evaluation
      const custFailures = paymentFailures.filter((pf) => pf.customer_id === cust.id && !pf.is_resolved);
      const healthScore = calculateCustomerHealthScore({
        failedPaymentsCount: custFailures.length,
        retriesCount: custFailures.length > 0 ? 1 : 0,
        hasPastDueInvoice: cust.current_risk_status === 'at_risk',
        openInvoiceAgeDays: cust.current_risk_status === 'at_risk' ? 15 : 0,
        subscriptionCreatedAt: cust.created_at,
      });

      if (healthScore.score < 50 || cust.current_risk_status === 'at_risk') {
        v4Detected++;
        riskSignalsCount++;
      }
    }

    // =========================================================================
    // VECTOR 5: Expansion Telemetry (Potential Upside, NEVER Revenue At Risk)
    // =========================================================================
    let v5Scanned = 0;
    let v5Detected = 0;
    let totalExpansionOpportunityCents = 0;
    const expansionByCurrency: Record<string, number> = {};

    for (const cust of customers) {
      v5Scanned++;
      const custMeta = (cust as any).metadata || {};
      const hasExplicitSignal = Boolean(
        custMeta.expansion_amount_cents || custMeta.expansion_signal || custMeta.usage_growth_pct || custMeta.seat_expansion
      );

      // RULE: Healthy/LTV/recovered history alone does NOT become an expansion signal.
      // An expansion signal requires explicit usage growth or seat telemetry.
      if (hasExplicitSignal) {
        v5Detected++;
        const curr = cust.currency || defaultCurrency;

        // RULE: Only explicit, verified expansion_amount_cents can quantify a monetary amount.
        let quantifiedExpansion = 0;
        if (typeof custMeta.expansion_amount_cents === 'number' && custMeta.expansion_amount_cents > 0) {
          quantifiedExpansion = custMeta.expansion_amount_cents;
        }

        if (quantifiedExpansion > 0) {
          totalExpansionOpportunityCents += quantifiedExpansion;
          expansionByCurrency[curr] = (expansionByCurrency[curr] || 0) + quantifiedExpansion;
        }
      }
    }

    // =========================================================================
    // MULTI-CURRENCY SAFETY & PER-CURRENCY AGGREGATION
    // =========================================================================
    const totalsByCurrency: Record<string, ScannerCurrencyTotal> = { ...canonicalResult.totalsByCurrency };

    Object.entries(expansionByCurrency).forEach(([curr, expAmt]) => {
      if (!totalsByCurrency[curr]) {
        totalsByCurrency[curr] = {
          totalAtRiskCents: 0,
          totalRecoverableRevenueCents: 0,
          expansionOpportunityCents: 0,
        };
      }
      totalsByCurrency[curr].expansionOpportunityCents += expAmt;
    });

    const primaryCurrency = canonicalResult.primaryCurrency;
    const primaryTotals = totalsByCurrency[primaryCurrency] || {
      totalAtRiskCents: canonicalResult.totalAtRiskCents,
      totalRecoverableRevenueCents: canonicalResult.totalRecoverableRevenueCents,
      expansionOpportunityCents: 0,
    };

    // =========================================================================
    // PERSISTENCE (Idempotent write strictly matching DB constraints)
    // =========================================================================
    const createdList: RecoveryOpportunity[] = [];

    if (!options.dryRun && newOpportunitiesToCreate.length > 0) {
      for (const oppData of newOpportunitiesToCreate) {
        // Enforce required foreign keys
        if (!oppData.payment_failure_id || !oppData.customer_id) {
          continue;
        }

        if (isSupabaseAuthoritative()) {
          const created = await supabaseService.createRecoveryOpportunity(workspaceId, oppData);
          createdList.push(created);
        } else {
          const created = db.createRecoveryOpportunity(workspaceId, oppData);
          createdList.push(created);
        }
      }
    }

    const vectors: ScannerVectorSummary[] = [
      {
        vectorId: 'vec_failed_payments',
        name: 'Confirmed Billing Leakage',
        scannedCount: v1Scanned,
        detectedCount: v1Detected,
        amountAtRiskCents: v1AmountAtRisk,
        status: v1Detected > 0 ? 'leaks_detected' : 'clean',
        description: 'Audits open, failed, and past-due invoice ledgers with canonical single-obligation deduplication.',
        signalsUsed: ['payment_failure.normalized_category', 'invoices.status', 'invoices.amount_cents', 'canonical_dedup'],
      },
      {
        vectorId: 'vec_repeated_failures',
        name: 'Compounding Payment Failures',
        scannedCount: v2Scanned,
        detectedCount: v2Detected,
        amountAtRiskCents: 0, // Signal only, underlying exposure is in Vector 1
        status: v2Detected > 0 ? 'leaks_detected' : 'clean',
        description: 'Identifies accounts experiencing multiple sequential decline events for escalation priority.',
        signalsUsed: ['payment_failures.count_per_customer >= 2', 'escalation_priority'],
      },
      {
        vectorId: 'vec_renewal_risks',
        name: 'Subscription Renewal Risks',
        scannedCount: v3Scanned,
        detectedCount: v3Detected,
        amountAtRiskCents: 0, // Expected renewals excluded; confirmed losses are in Vector 1
        status: v3Detected > 0 ? 'leaks_detected' : 'clean',
        description: 'Scans active subscriptions renewing within 14 days with supporting decline or risk evidence.',
        signalsUsed: ['subscriptions.current_period_end <= 14d', 'supporting_failure_evidence'],
      },
      {
        vectorId: 'vec_churn_signals',
        name: 'Behavioral Churn Risk Signals',
        scannedCount: v4Scanned,
        detectedCount: v4Detected,
        amountAtRiskCents: 0, // Risk signal only; does not inflate confirmed Revenue At Risk
        status: v4Detected > 0 ? 'leaks_detected' : 'clean',
        description: 'Deterministic rule evaluation of customer payment frequency, past-due duration, and health score.',
        signalsUsed: ['customer.health_score < 50', 'customer.current_risk_status in (at_risk)'],
      },
      {
        vectorId: 'vec_expansion_telemetry',
        name: 'Expansion Opportunity Signals',
        scannedCount: v5Scanned,
        detectedCount: v5Detected,
        amountAtRiskCents: 0, // Expansion is potential upside, never Revenue At Risk
        status: v5Detected > 0 ? 'leaks_detected' : 'clean',
        description: 'Verifiable accounts with explicit growth telemetry, seat expansion, or high tenure & LTV.',
        signalsUsed: ['metadata.expansion_signal', 'metadata.usage_growth_pct', 'verified_growth_history'],
      },
    ];

    return {
      workspaceId,
      scannedAt: new Date().toISOString(),
      totalRecordsAudited: totalRecords,
      totalAtRiskCents: primaryTotals.totalAtRiskCents,
      totalRecoverableRevenueCents: primaryTotals.totalRecoverableRevenueCents,
      riskSignalsCount,
      expansionOpportunityCents: primaryTotals.expansionOpportunityCents,
      newOpportunitiesCreated: createdList.length,
      existingOpportunitiesMaintained,
      currency: primaryCurrency,
      totalsByCurrency,
      vectors,
      createdOpportunities: createdList,
      methodology: {
        engineType: 'deterministic_rule_based',
        aiDisclosure:
          'ReviveOS uses deterministic mathematical rules and authoritative ledger validation. We do not use hallucinating black-box LLMs for financial state detection.',
        idempotent: true,
      },
    };
  }
}
