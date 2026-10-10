import { db } from '../store/db.js';
import { supabaseService } from '../db/supabaseService.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { Customer, Subscription } from '../../src/types/index.js';
import { calculateMonthlyEquivalent } from '../../src/utils/subscription.js';

export type ExpansionEvidenceStatus = 'confirmed_evidence' | 'insufficient_evidence';
export type ExpansionTier = 'EXPANSION_READY' | 'GROWTH_SIGNAL' | 'WATCH' | 'NO_SIGNAL';

export interface ExpansionOpportunityRecord {
  id: string;
  workspaceId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  currentArrCents: number;
  currency: string;
  currentPlan: string;
  expansionTier: ExpansionTier;
  expansionSignal: string;
  evidenceStatus: ExpansionEvidenceStatus;
  evidenceDetails: string[];
  explainableDrivers: string[];
  estimatedValueCents: number | null;
  estimatedValueLabel: string;
  confidence: 'high' | 'medium' | 'low';
  recommendedAction: string;
  evaluatedAt: string;
  customer?: Customer;
  subscription?: Subscription;
}

export interface ExpansionQueueResponse {
  workspaceId: string;
  totalEvaluated: number;
  confirmedCount: number;
  insufficientEvidenceCount: number;
  currency: string;
  generatedAt: string;
  queue: ExpansionOpportunityRecord[];
}

export class ExpansionFinderEngine {
  /**
   * Generates an evidence-based expansion revenue queue.
   * Strictly enforces that healthy customers are NOT expansion opportunities without explicit verifiable evidence.
   */
  public static async evaluateWorkspace(
    workspaceId: string,
    options: { limit?: number } = {}
  ): Promise<ExpansionQueueResponse> {
    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new Error('Valid workspaceId is required for Expansion Finder Engine.');
    }

    let customers: Customer[] = [];
    let subscriptions: Subscription[] = [];
    let failures: any[] = [];

    if (isSupabaseAuthoritative()) {
      customers = await supabaseService.getCustomers(workspaceId);
      subscriptions = await supabaseService.getSubscriptions(workspaceId);
      failures = await supabaseService.getPaymentFailures(workspaceId);
    } else {
      customers = db.getCustomers(workspaceId);
      subscriptions = db.getSubscriptions(workspaceId);
      failures = db.getPaymentFailures(workspaceId);
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

    const records: ExpansionOpportunityRecord[] = [];

    for (const cust of customers) {
      const sub = subMap.get(cust.id);
      const currentPlan = sub?.plan_name || 'No Active Plan';
      // A customer with no real subscription amount must have currentArrCents = 0.
      // Do not invent 9900 or another arbitrary default financial amount.
      // Use actual billing interval to calculate accurate annual run rate (ARR).
      const monthlyAmountCents = (typeof sub?.amount_cents === 'number' && !isNaN(sub.amount_cents) && sub.amount_cents > 0)
        ? calculateMonthlyEquivalent(sub.amount_cents, sub.billing_interval || 'monthly', sub.custom_interval_count, sub.custom_interval_unit)
        : 0;
      const currentArrCents = monthlyAmountCents * 12;

      const custMeta = (cust as any).metadata || {};
      const hasExplicitSignal = Boolean(
        custMeta.expansion_signal || custMeta.usage_growth_pct || custMeta.seat_expansion
      );
      const rawHealth = cust.health_score;
      let healthScore: number | null = null;
      if (typeof rawHealth === 'number' && !isNaN(rawHealth)) {
        healthScore = rawHealth;
      } else if (rawHealth && typeof rawHealth === 'object' && 'overall_score' in rawHealth && typeof (rawHealth as any).overall_score === 'number' && !isNaN((rawHealth as any).overall_score)) {
        healthScore = Number((rawHealth as any).overall_score);
      } else if (rawHealth && typeof rawHealth === 'object' && 'score' in rawHealth && typeof (rawHealth as any).score === 'number' && !isNaN((rawHealth as any).score)) {
        healthScore = Number((rawHealth as any).score);
      }

      const custFailures = failures.filter((f) => f.customer_id === cust.id);
      const hasActiveUnresolvedFailure = custFailures.some((f) => !f.is_resolved);

      // Missing health data (null) cannot be used as evidence for an expansion opportunity
      const isHighHealthAccount = healthScore !== null && healthScore >= 88 && cust.total_recovered_cents > 50000;

      let evidenceStatus: ExpansionEvidenceStatus = 'insufficient_evidence';
      let expansionSignal = 'Expansion candidate — insufficient expansion evidence';
      let evidenceDetails = [
        healthScore !== null
          ? `Customer health score: ${healthScore}/100.`
          : 'Account health status: Unknown (no telemetry present).',
        'Explicit product usage telemetry, seat count, and plan limits are not currently present in the database.',
      ];
      let estimatedValueCents: number | null = null;
      let estimatedValueLabel = 'Value requires review';
      let recommendedAction = 'Collect usage telemetry and seat metrics to evaluate tier upgrade eligibility.';
      let confidence: 'high' | 'medium' | 'low' = 'low';
      let expansionTier: ExpansionTier = 'NO_SIGNAL';
      const explainableDrivers: string[] = [];

      // Generate grounded explainable drivers
      if (cust.lifetime_value_cents > 50000) {
        explainableDrivers.push(`Increasing Spend: LTV of ${(cust.lifetime_value_cents / 100).toFixed(2)} ${cust.currency}`);
      }
      if (cust.total_recovered_cents > 0) {
        explainableDrivers.push(`Successful Recoveries: ${(cust.total_recovered_cents / 100).toFixed(2)} ${cust.currency} settled revenue`);
      }
      if (custFailures.length === 0 || custFailures.every((f) => f.is_resolved)) {
        explainableDrivers.push(`Strong Payment History: No unresolved payment failures`);
      }
      if (healthScore !== null && healthScore >= 80) {
        explainableDrivers.push(`Healthy Account: Account health score is ${healthScore}/100`);
      }
      if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
        explainableDrivers.push(`Subscription Stability: Active subscription on ${currentPlan}`);
      }

      // Determine Expansion Tier
      if (hasActiveUnresolvedFailure) {
        expansionTier = 'NO_SIGNAL';
      } else if (typeof custMeta.expansion_amount_cents === 'number' && custMeta.expansion_amount_cents > 0) {
        expansionTier = 'EXPANSION_READY';
      } else if (hasExplicitSignal) {
        expansionTier = 'GROWTH_SIGNAL';
      } else if (healthScore !== null && healthScore >= 80 && cust.current_risk_status !== 'at_risk' && (cust.total_recovered_cents > 0 || cust.lifetime_value_cents >= 100000)) {
        expansionTier = 'EXPANSION_READY';
      } else if (healthScore !== null && healthScore >= 70 && cust.current_risk_status !== 'at_risk') {
        expansionTier = 'GROWTH_SIGNAL';
      } else if ((healthScore !== null && healthScore >= 40) || cust.current_risk_status === 'at_risk') {
        expansionTier = 'WATCH';
      } else {
        expansionTier = 'NO_SIGNAL';
      }

      // 1. Explicit verified expansion amount
      if (typeof custMeta.expansion_amount_cents === 'number' && custMeta.expansion_amount_cents > 0) {
        evidenceStatus = 'confirmed_evidence';
        expansionSignal = custMeta.expansion_signal || 'Confirmed high engagement with explicit expansion contract telemetry';
        evidenceDetails = [
          `Customer lifetime value: ${(cust.lifetime_value_cents / 100).toFixed(2)} ${cust.currency}`,
          healthScore !== null ? `Customer health score: ${healthScore}/100` : 'Customer health score: Unknown (no telemetry)',
          `Explicit verified expansion amount: ${(custMeta.expansion_amount_cents / 100).toFixed(2)} ${cust.currency}`,
        ];
        estimatedValueCents = custMeta.expansion_amount_cents;
        estimatedValueLabel = `${cust.currency} ${(estimatedValueCents / 100).toFixed(2)} confirmed expansion opportunity`;
        recommendedAction = 'Schedule account review for enterprise tier upgrade or add-on module adoption.';
        confidence = 'high';
      }
      // 2. Explicit growth/seat/usage signal without monetary amount
      else if (hasExplicitSignal) {
        evidenceStatus = 'confirmed_evidence';
        expansionSignal = custMeta.expansion_signal || 'Usage growth or seat expansion signal detected';
        evidenceDetails = [
          `Customer lifetime value: ${(cust.lifetime_value_cents / 100).toFixed(2)} ${cust.currency}`,
          healthScore !== null ? `Customer health score: ${healthScore}/100` : 'Customer health score: Unknown (no telemetry)',
          'Explicit product usage growth / seat expansion signal detected (monetary value unquantified pending contract telemetry)',
        ];
        estimatedValueCents = null;
        estimatedValueLabel = 'Signal detected — value not quantified';
        recommendedAction = 'Collect usage telemetry and seat metrics to evaluate tier upgrade eligibility.';
        confidence = 'medium';
      }
      // 3. Healthy / high-LTV / recovered history alone: NOT an expansion amount or confirmed evidence
      else if (isHighHealthAccount) {
        evidenceStatus = 'insufficient_evidence';
        expansionSignal = 'Healthy account in good standing — insufficient expansion evidence';
        evidenceDetails = [
          `Customer lifetime value: ${(cust.lifetime_value_cents / 100).toFixed(2)} ${cust.currency}`,
          healthScore !== null ? `Customer health score: ${healthScore}/100` : 'Customer health score: Unknown (no telemetry)',
          'Historical health, LTV, or recoveries alone do not prove expansion opportunity without product telemetry',
        ];
        estimatedValueCents = null;
        estimatedValueLabel = 'Value requires review';
        recommendedAction = 'Maintain relationship health; collect product telemetry before pitching upgrades.';
        confidence = 'low';
      }

      records.push({
        id: `expansion_${cust.id}`,
        workspaceId,
        customerId: cust.id,
        customerName: cust.name,
        customerEmail: cust.email,
        currentArrCents,
        currency: cust.currency || defaultCurrency,
        currentPlan,
        expansionTier,
        expansionSignal,
        evidenceStatus,
        evidenceDetails,
        explainableDrivers,
        estimatedValueCents,
        estimatedValueLabel,
        confidence,
        recommendedAction,
        evaluatedAt: new Date().toISOString(),
        customer: cust,
        subscription: sub,
      });
    }

    records.sort((a, b) => {
      if (a.evidenceStatus === 'confirmed_evidence' && b.evidenceStatus !== 'confirmed_evidence') return -1;
      if (b.evidenceStatus === 'confirmed_evidence' && a.evidenceStatus !== 'confirmed_evidence') return 1;
      return b.currentArrCents - a.currentArrCents;
    });

    const finalQueue = options.limit ? records.slice(0, options.limit) : records;

    return {
      workspaceId,
      totalEvaluated: records.length,
      confirmedCount: records.filter((r) => r.evidenceStatus === 'confirmed_evidence').length,
      insufficientEvidenceCount: records.filter((r) => r.evidenceStatus === 'insufficient_evidence').length,
      currency: defaultCurrency,
      generatedAt: new Date().toISOString(),
      queue: finalQueue,
    };
  }
}
