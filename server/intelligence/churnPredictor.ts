import { db } from '../store/db.js';
import { supabaseService } from '../db/supabaseService.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { Customer, Subscription, Invoice, PaymentFailure } from '../../src/types/index.js';

export type ChurnRiskCategory = 'LOW_RISK' | 'WATCH' | 'AT_RISK' | 'CRITICAL';

export interface ChurnDriverEvidence {
  key: string;
  label: string;
  value: string | number;
  significance: 'positive' | 'neutral' | 'negative';
  source: 'payment_ledger' | 'subscription_state' | 'customer_health' | 'invoice_record';
}

export interface ChurnPredictionRecord {
  id: string;
  workspaceId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  riskCategory: ChurnRiskCategory;
  riskScore: number; // 0 to 100 deterministic integer
  confidence: 'high' | 'medium' | 'low';
  mainDrivers: string[];
  evidence: ChurnDriverEvidence[];
  changeOverTime: string;
  recommendedIntervention: string;
  evaluatedAt: string;
  customer?: Customer;
  subscription?: Subscription;
}

export interface ChurnQueueResponse {
  workspaceId: string;
  totalCustomersEvaluated: number;
  criticalCount: number;
  atRiskCount: number;
  watchCount: number;
  lowRiskCount: number;
  currency: string;
  generatedAt: string;
  queue: ChurnPredictionRecord[];
}

export class ChurnPredictorEngine {
  /**
   * Generates a deterministic, explainable churn prediction queue for all customers in a workspace.
   * Strictly enforces workspace isolation.
   */
  public static async evaluateWorkspace(
    workspaceId: string,
    options: { categoryFilter?: ChurnRiskCategory; limit?: number } = {}
  ): Promise<ChurnQueueResponse> {
    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new Error('Valid workspaceId is required for Churn Prediction Engine.');
    }

    let customers: Customer[] = [];
    let subscriptions: Subscription[] = [];
    let invoices: Invoice[] = [];
    let paymentFailures: PaymentFailure[] = [];

    if (isSupabaseAuthoritative()) {
      customers = await supabaseService.getCustomers(workspaceId);
      subscriptions = await supabaseService.getSubscriptions(workspaceId);
      invoices = await supabaseService.getInvoices(workspaceId);
      paymentFailures = await supabaseService.getPaymentFailures(workspaceId);
    } else {
      customers = db.getCustomers(workspaceId);
      subscriptions = db.getSubscriptions(workspaceId);
      invoices = db.getInvoices(workspaceId);
      paymentFailures = db.getPaymentFailures(workspaceId);
    }

    let defaultCurrency = 'USD';
    if (isSupabaseAuthoritative()) {
      const ws = await supabaseService.getWorkspaceById(workspaceId);
      if (ws?.currency) defaultCurrency = ws.currency;
    } else {
      const ws = db.getWorkspace(workspaceId);
      if (ws?.currency) defaultCurrency = ws.currency;
    }
    const subMap = new Map<string, Subscription>();
    subscriptions.forEach((s) => subMap.set(s.customer_id, s));

    const invListMap = new Map<string, Invoice[]>();
    invoices.forEach((i) => {
      const list = invListMap.get(i.customer_id) || [];
      list.push(i);
      invListMap.set(i.customer_id, list);
    });

    const failureListMap = new Map<string, PaymentFailure[]>();
    paymentFailures.forEach((f) => {
      const list = failureListMap.get(f.customer_id) || [];
      list.push(f);
      failureListMap.set(f.customer_id, list);
    });

    const records: ChurnPredictionRecord[] = [];

    for (const cust of customers) {
      const sub = subMap.get(cust.id);
      const custInvoices = invListMap.get(cust.id) || [];
      const custFailures = failureListMap.get(cust.id) || [];

      const activeFailures = custFailures.filter((f) => !f.is_resolved);
      const recentFailures = activeFailures.length;
      const paymentReliabilityScore = Math.min(100, recentFailures * 35);

      const overdueInvoices = custInvoices.filter((i) => i.status === 'open' || i.status === 'past_due' || i.status === 'uncollectible');
      const delinquentAmountCents = overdueInvoices.reduce((sum, i) => sum + (i.amount_cents || 0), 0);
      const invoiceDelinquencyScore = Math.min(100, overdueInvoices.length * 40 + (delinquentAmountCents > 100000 ? 30 : 0));

      let subscriptionRiskScore = 10;
      if (!sub || sub.status === 'canceled' || sub.status === 'past_due' || sub.status === 'unpaid') {
        subscriptionRiskScore = 95;
      } else if (sub.status === 'paused') {
        subscriptionRiskScore = 70;
      }

      const rawHealth = cust.health_score;
      let healthScore: number | null = null;
      if (typeof rawHealth === 'number' && !isNaN(rawHealth)) {
        healthScore = rawHealth;
      } else if (rawHealth && typeof rawHealth === 'object') {
        if ('overall_score' in rawHealth && typeof (rawHealth as any).overall_score === 'number' && !isNaN((rawHealth as any).overall_score)) {
          healthScore = Number((rawHealth as any).overall_score);
        } else if ('score' in rawHealth && typeof (rawHealth as any).score === 'number' && !isNaN((rawHealth as any).score)) {
          healthScore = Number((rawHealth as any).score);
        }
      }

      const recoveryFailureScore = Math.min(100, custFailures.filter((f) => !f.is_resolved).length * 50);

      let riskScore: number;
      if (healthScore !== null) {
        const healthDeteriorationScore = Math.max(0, 100 - healthScore);
        riskScore = Math.round(
          paymentReliabilityScore * 0.30 +
          invoiceDelinquencyScore * 0.25 +
          subscriptionRiskScore * 0.20 +
          healthDeteriorationScore * 0.15 +
          recoveryFailureScore * 0.10
        );
      } else {
        // Renormalize available signals (weights sum to 0.85) when health telemetry is absent
        const rawWeighted =
          paymentReliabilityScore * 0.30 +
          invoiceDelinquencyScore * 0.25 +
          subscriptionRiskScore * 0.20 +
          recoveryFailureScore * 0.10;
        riskScore = Math.round(rawWeighted / 0.85);
      }

      let riskCategory: ChurnRiskCategory = 'LOW_RISK';
      if (riskScore >= 75 || subscriptionRiskScore >= 90) {
        riskCategory = 'CRITICAL';
      } else if (riskScore >= 50) {
        riskCategory = 'AT_RISK';
      } else if (riskScore >= 30) {
        riskCategory = 'WATCH';
      }

      const mainDrivers: string[] = [];
      const evidence: ChurnDriverEvidence[] = [];

      if (recentFailures > 0) {
        mainDrivers.push(`${recentFailures} payment failure(s) recorded`);
        evidence.push({
          key: 'payment_failures',
          label: 'Payment Failures',
          value: recentFailures,
          significance: 'negative',
          source: 'payment_ledger',
        });
      }

      if (overdueInvoices.length > 0) {
        mainDrivers.push(`${overdueInvoices.length} unpaid/overdue invoice(s)`);
        evidence.push({
          key: 'delinquent_invoices',
          label: 'Overdue Invoices',
          value: overdueInvoices.length,
          significance: 'negative',
          source: 'invoice_record',
        });
      }

      if (healthScore !== null) {
        evidence.push({
          key: 'customer_health',
          label: 'Customer Health Score',
          value: healthScore,
          significance: healthScore > 75 ? 'positive' : healthScore > 50 ? 'neutral' : 'negative',
          source: 'customer_health',
        });
      }

      if (mainDrivers.length === 0) {
        mainDrivers.push('Stable billing history and healthy account engagement');
      }

      let intervention = 'Standard account maintenance and automated renewal reminders.';
      if (riskCategory === 'CRITICAL') {
        intervention = 'Immediate Customer Success executive outreach and VIP concierge intervention.';
      } else if (riskCategory === 'AT_RISK') {
        intervention = 'Trigger Recovery Copilot intervention plan to resolve outstanding payment/invoice friction.';
      } else if (riskCategory === 'WATCH') {
        intervention = 'Monitor usage cadence and verify proactive notification delivery.';
      }

      const changeOverTime = healthScore !== null && healthScore < 70
        ? 'Health score declined recently'
        : 'Stable over last 30 billing cycles';

      records.push({
        id: `churn_${cust.id}`,
        workspaceId,
        customerId: cust.id,
        customerName: cust.name,
        customerEmail: cust.email,
        riskCategory,
        riskScore: Math.min(100, Math.max(0, riskScore)),
        confidence: recentFailures > 0 || overdueInvoices.length > 0 ? 'high' : 'medium',
        mainDrivers,
        evidence,
        changeOverTime,
        recommendedIntervention: intervention,
        evaluatedAt: new Date().toISOString(),
        customer: cust,
        subscription: sub,
      });
    }

    records.sort((a, b) => b.riskScore - a.riskScore);

    let filteredQueue = records;
    if (options.categoryFilter && options.categoryFilter !== 'LOW_RISK') {
      filteredQueue = records.filter((r) => r.riskCategory === options.categoryFilter);
    }

    const finalQueue = options.limit ? filteredQueue.slice(0, options.limit) : filteredQueue;

    return {
      workspaceId,
      totalCustomersEvaluated: records.length,
      criticalCount: records.filter((r) => r.riskCategory === 'CRITICAL').length,
      atRiskCount: records.filter((r) => r.riskCategory === 'AT_RISK').length,
      watchCount: records.filter((r) => r.riskCategory === 'WATCH').length,
      lowRiskCount: records.filter((r) => r.riskCategory === 'LOW_RISK').length,
      currency: defaultCurrency,
      generatedAt: new Date().toISOString(),
      queue: finalQueue,
    };
  }
}
