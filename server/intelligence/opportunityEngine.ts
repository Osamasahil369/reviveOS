import { db } from '../store/db.js';
import { supabaseService } from '../db/supabaseService.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import crypto from 'crypto';
import {
  RecoveryOpportunity,
  Customer,
  Subscription,
  Invoice,
  PaymentFailure,
} from '../../src/types/index.js';
import {
  OpportunityIntelligenceRecord,
  PrioritizedQueueResponse,
  ActionRecord,
  OutcomeRecord,
  AiEnrichmentResult,
  CurrencyQueueTotals,
} from './types.js';
import { OpportunityScoringEngine, OPPORTUNITY_SCORING_VERSION } from './scoringEngine.js';
import { AiOpportunityEnricher } from './aiEnricher.js';

const ALLOWED_ACTION_TYPES = [
  'smart_retry',
  'magic_link',
  'proactive_renewal',
  'customer_outreach',
  'review_expansion_evidence',
  'manual_review',
];

const ALLOWED_CHANNELS = [
  'gateway',
  'email',
  'hosted_portal',
  'manual',
  'system',
];

const ALLOWED_OUTCOMES = [
  'recovered',
  'unrecoverable',
  'expired',
  'canceled',
  'partial_recovery',
];

const URGENCY_RANK: Record<string, number> = {
  immediate: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export class AiOpportunityEngine {
  /**
   * Generates a fully prioritized, explainable intelligence queue across all active opportunities
   * in the specified workspace. Strictly enforces workspace isolation and operates idempotently.
   */
  public static async generatePrioritizedQueue(
    workspaceId: string,
    options: { limit?: number; enrichWithAi?: boolean; categoryFilter?: string } = {}
  ): Promise<PrioritizedQueueResponse> {
    if (!workspaceId || typeof workspaceId !== 'string') {
      const err: any = new Error('Valid workspaceId is required for AI Opportunity Engine.');
      err.status = 400;
      throw err;
    }

    let opportunities: RecoveryOpportunity[] = [];
    let customers: Customer[] = [];
    let subscriptions: Subscription[] = [];
    let invoices: Invoice[] = [];
    let paymentFailures: PaymentFailure[] = [];

    try {
      if (isSupabaseAuthoritative()) {
        opportunities = await supabaseService.getRecoveryOpportunities(workspaceId);
        customers = await supabaseService.getCustomers(workspaceId);
        subscriptions = await supabaseService.getSubscriptions(workspaceId);
        invoices = await supabaseService.getInvoices(workspaceId);
        paymentFailures = await supabaseService.getPaymentFailures(workspaceId);
      } else {
        opportunities = db.getOpportunities(workspaceId);
        customers = db.getCustomers(workspaceId);
        subscriptions = db.getSubscriptions(workspaceId);
        invoices = db.getInvoices(workspaceId);
        paymentFailures = db.getPaymentFailures(workspaceId);
      }
    } catch (dbErr: any) {
      const err: any = new Error(`Core database retrieval failure: ${dbErr?.message || dbErr}`);
      err.status = 500;
      throw err;
    }

    try {
      let actionableOpps = opportunities.filter(
        (o) => o.status !== 'recovered' && o.status !== 'expired' && o.status !== 'cancelled'
      );

      if (options.categoryFilter && options.categoryFilter !== 'all') {
        actionableOpps = actionableOpps.filter((o) => o.failure_category === options.categoryFilter);
      }

      let defaultCurrency = 'USD';
      if (isSupabaseAuthoritative()) {
        const ws = await supabaseService.getWorkspaceById(workspaceId);
        if (ws?.currency) defaultCurrency = ws.currency.toUpperCase();
      } else {
        const ws = db.getWorkspace(workspaceId);
        if (ws?.currency) defaultCurrency = ws.currency.toUpperCase();
      }

      const customerMap = new Map<string, Customer>();
      customers.forEach((c) => customerMap.set(c.id, c));

      const subscriptionMap = new Map<string, Subscription>();
      subscriptions.forEach((s) => subscriptionMap.set(s.id, s));

      const invoiceMap = new Map<string, Invoice>();
      invoices.forEach((i) => invoiceMap.set(i.id, i));

      const failureMap = new Map<string, PaymentFailure>();
      paymentFailures.forEach((f) => failureMap.set(f.id, f));

      const evaluatedRecords: OpportunityIntelligenceRecord[] = [];

      for (const opp of actionableOpps) {
        if (typeof opp.amount_at_risk_cents !== 'number') {
          continue;
        }

        const resolvedCust = customerMap.get(opp.customer_id) || opp.customer;
        if (!resolvedCust) {
          continue;
        }
        const cust = resolvedCust;

        const sub = opp.subscription?.id ? subscriptionMap.get(opp.subscription.id) : subscriptions.find((s) => s.customer_id === cust.id);
        const inv = opp.invoice?.id ? invoiceMap.get(opp.invoice.id) : invoices.find((i) => i.customer_id === cust.id);
        const failure = opp.payment_failure_id ? failureMap.get(opp.payment_failure_id) : undefined;

        const scored = OpportunityScoringEngine.evaluate(opp, cust, sub, inv, failure);

        const currency = (opp.currency || defaultCurrency).toUpperCase();

        const defaultAiEnrichment: AiEnrichmentResult = {
          operatorSummary: scored.reason,
          communicationStrategy: {
            recommendedChannel: 'email',
            suggestedSubject: `Billing Update - ${cust.name}`,
            suggestedTone: 'empathetic_direct',
            keyTalkingPoints: ['Automated payment update', 'Direct portal link'],
          },
          contextualReasoning: scored.rankingExplanation,
          isAiGenerated: false,
          aiStatus: 'unavailable',
          generatedAt: new Date().toISOString(),
        };

        const intelligenceRecord: OpportunityIntelligenceRecord = {
          id: `intel_${opp.id}`,
          opportunityId: opp.id,
          workspaceId,
          scoringVersion: OPPORTUNITY_SCORING_VERSION,
          opportunityType: scored.opportunityType,
          amountCents: opp.amount_at_risk_cents,
          currency,
          priority: scored.priority,
          priorityScore: scored.priorityScore,
          urgency: scored.urgency,
          recoveryLikelihood: scored.recoveryLikelihood,
          recoveryLikelihoodScore: scored.recoveryLikelihoodScore,
          confidence: scored.confidence,
          expectedValueCents: scored.expectedValueCents,
          reason: scored.reason,
          evidence: scored.evidence,
          rankingExplanation: scored.rankingExplanation,
          recommendedAction: scored.recommendedAction,
          recommendedActionLabel: scored.recommendedActionLabel,
          recommendedTiming: scored.recommendedTiming,
          expectedImpact: scored.expectedImpact,
          isExpansionCandidate: scored.isExpansionCandidate,
          expansionEvidenceStatus: scored.expansionEvidenceStatus,
          scoreBreakdown: scored.scoreBreakdown,
          daysOverdue: scored.daysOverdue,
          aiEnrichment: defaultAiEnrichment,
          opportunity: opp,
          customer: cust,
          subscription: sub,
          invoice: inv,
          paymentFailure: failure,
          evaluatedAt: new Date().toISOString(),
          updatedAt: opp.updated_at || opp.created_at,
        };

        evaluatedRecords.push(intelligenceRecord);
      }

      // Sort queue deterministically:
      // 1. priorityScore desc
      // 2. expectedValueCents desc only if same currency
      // 3. urgency rank desc
      // 4. trigger timestamp (created_at desc)
      // 5. opportunityId stable lexical tie-break
      evaluatedRecords.sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }
        if (a.currency === b.currency && b.expectedValueCents !== a.expectedValueCents) {
          return b.expectedValueCents - a.expectedValueCents;
        }
        const urgencyDiff = (URGENCY_RANK[b.urgency] || 0) - (URGENCY_RANK[a.urgency] || 0);
        if (urgencyDiff !== 0) {
          return urgencyDiff;
        }
        const timeA = new Date(a.opportunity.created_at || 0).getTime();
        const timeB = new Date(b.opportunity.created_at || 0).getTime();
        if (timeB !== timeA) {
          return timeB - timeA;
        }
        return a.opportunityId.localeCompare(b.opportunityId);
      });

       // AI Cost Control & Concurrency: enrich top 10 opportunities with max 3 concurrent requests if requested
      if (options.enrichWithAi !== false) {
        const topForAi = evaluatedRecords.slice(0, 10);
        const rest = evaluatedRecords.slice(10);

        const enrichBatch = async (batch: OpportunityIntelligenceRecord[]) => {
          return Promise.all(
            batch.map(async (record) => {
              try {
                record.aiEnrichment = await AiOpportunityEnricher.enrich(
                  workspaceId,
                  record.opportunity,
                  record.customer,
                  {
                    opportunityType: record.opportunityType,
                    priority: record.priority,
                    priorityScore: record.priorityScore,
                    amountCents: record.amountCents,
                    currency: record.currency,
                    reason: record.reason,
                    recommendedAction: record.recommendedAction,
                    daysOverdue: record.daysOverdue,
                    subscription: record.subscription,
                  }
                );
              } catch (aiErr: any) {
                record.aiEnrichment = {
                  ...record.aiEnrichment,
                  aiStatus: 'failed',
                  failureReason: aiErr?.message || String(aiErr),
                };
              }
            })
          );
        };

        // Bounded concurrency max 3
        for (let i = 0; i < topForAi.length; i += 3) {
          const chunk = topForAi.slice(i, i + 3);
          await enrichBatch(chunk);
        }
      }

      const finalQueue = options.limit ? evaluatedRecords.slice(0, options.limit) : evaluatedRecords;

      // Currency-safe totals by currency (Do NOT sum raw cents across different currencies)
      const totalsByCurrency: Record<string, CurrencyQueueTotals> = {};
      evaluatedRecords.forEach((r) => {
        const curr = (r.currency || defaultCurrency).toUpperCase();
        if (!totalsByCurrency[curr]) {
          totalsByCurrency[curr] = { totalAtRiskCents: 0, totalExpectedValueCents: 0, count: 0 };
        }
        totalsByCurrency[curr].totalAtRiskCents += r.amountCents;
        totalsByCurrency[curr].totalExpectedValueCents += r.expectedValueCents;
        totalsByCurrency[curr].count += 1;
      });

      const primaryTotals = totalsByCurrency[defaultCurrency] || { totalAtRiskCents: 0, totalExpectedValueCents: 0, count: evaluatedRecords.length };

      const summary = {
        criticalCount: evaluatedRecords.filter((r) => r.priority === 'P1_CRITICAL').length,
        highCount: evaluatedRecords.filter((r) => r.priority === 'P2_HIGH').length,
        mediumCount: evaluatedRecords.filter((r) => r.priority === 'P3_MEDIUM').length,
        lowCount: evaluatedRecords.filter((r) => r.priority === 'P4_LOW').length,
        byAction: {} as Record<string, number>,
        byLikelihood: {
          high: evaluatedRecords.filter((r) => r.recoveryLikelihood === 'high').length,
          medium: evaluatedRecords.filter((r) => r.recoveryLikelihood === 'medium').length,
          low: evaluatedRecords.filter((r) => r.recoveryLikelihood === 'low').length,
        },
      };

      evaluatedRecords.forEach((r) => {
        summary.byAction[r.recommendedAction] = (summary.byAction[r.recommendedAction] || 0) + 1;
      });

      return {
        workspaceId,
        scoringVersion: OPPORTUNITY_SCORING_VERSION,
        totalPrioritized: evaluatedRecords.length,
        totalAtRiskCents: primaryTotals.totalAtRiskCents,
        totalExpectedValueCents: primaryTotals.totalExpectedValueCents,
        queueOpportunityValueCents: primaryTotals.totalAtRiskCents,
        queueExpectedRecoveryValueCents: primaryTotals.totalExpectedValueCents,
        currency: defaultCurrency,
        totalsByCurrency,
        generatedAt: new Date().toISOString(),
        queue: finalQueue,
        summary,
      };
    } catch (processingErr: any) {
      if (processingErr.status) throw processingErr;
      const err: any = new Error(`Queue generation failed: ${processingErr?.message || processingErr}`);
      err.status = 500;
      throw err;
    }
  }

  /**
   * Retrieves single opportunity intelligence record with detailed explainability.
   * Loads only what is needed (target opportunity, linked customer, subscription, invoice, payment failure).
   */
  public static async getOpportunityIntelligence(
    workspaceId: string,
    opportunityId: string
  ): Promise<OpportunityIntelligenceRecord | null> {
    if (!workspaceId || !opportunityId) return null;

    let opp: RecoveryOpportunity | null = null;
    let cust: Customer | undefined = undefined;
    let sub: Subscription | undefined = undefined;
    let inv: Invoice | undefined = undefined;
    let failure: PaymentFailure | undefined = undefined;

    try {
      if (isSupabaseAuthoritative()) {
        opp = await supabaseService.getRecoveryOpportunityById(workspaceId, opportunityId);
        if (!opp || opp.workspace_id !== workspaceId) return null;
        if (opp.customer_id) {
          cust = (await supabaseService.getCustomerById(workspaceId, opp.customer_id)) || opp.customer;
        }
        if (opp.subscription?.id) {
          sub = (await supabaseService.getSubscriptionById(workspaceId, opp.subscription.id)) || undefined;
        } else if (opp.customer_id) {
          const subs = await supabaseService.getSubscriptions(workspaceId);
          sub = subs.find((s) => s.customer_id === opp.customer_id);
        }
        if (opp.invoice?.id) {
          const invs = await supabaseService.getInvoices(workspaceId);
          inv = invs.find((i) => i.id === opp.invoice?.id || i.customer_id === opp.customer_id);
        } else if (opp.customer_id) {
          const invs = await supabaseService.getInvoices(workspaceId);
          inv = invs.find((i) => i.customer_id === opp.customer_id);
        }
        if (opp.payment_failure_id) {
          const failures = await supabaseService.getPaymentFailures(workspaceId);
          failure = failures.find((f) => f.id === opp.payment_failure_id);
        }
      } else {
        opp = db.getOpportunityById(opportunityId, workspaceId);
        if (!opp) return null;
        cust = db.getCustomerById(opp.customer_id, workspaceId) || opp.customer;
        const subs = db.getSubscriptions(workspaceId);
        sub = opp.subscription?.id ? subs.find((s) => s.id === opp.subscription?.id) : subs.find((s) => s.customer_id === cust?.id);
        const invs = db.getInvoices(workspaceId);
        inv = opp.invoice?.id ? invs.find((i) => i.id === opp.invoice?.id) : invs.find((i) => i.customer_id === cust?.id);
        const paymentFailures = db.getPaymentFailures(workspaceId);
        failure = opp.payment_failure_id ? paymentFailures.find((f) => f.id === opp.payment_failure_id) : undefined;
      }
    } catch (err: any) {
      const error: any = new Error(`Failed to fetch opportunity intelligence: ${err.message}`);
      error.status = 500;
      throw error;
    }

    if (!opp || !cust) return null;

    let defaultCurrency = 'USD';
    if (isSupabaseAuthoritative()) {
      const ws = await supabaseService.getWorkspaceById(workspaceId);
      if (ws?.currency) defaultCurrency = ws.currency.toUpperCase();
    } else {
      const ws = db.getWorkspace(workspaceId);
      if (ws?.currency) defaultCurrency = ws.currency.toUpperCase();
    }

    const scored = OpportunityScoringEngine.evaluate(opp, cust, sub, inv, failure);
    const currency = (opp.currency || defaultCurrency).toUpperCase();

    let aiEnrichment: AiEnrichmentResult;
    try {
      aiEnrichment = await AiOpportunityEnricher.enrich(
        workspaceId,
        opp,
        cust,
        {
          opportunityType: scored.opportunityType,
          priority: scored.priority,
          priorityScore: scored.priorityScore,
          amountCents: opp.amount_at_risk_cents,
          currency,
          reason: scored.reason,
          recommendedAction: scored.recommendedAction,
          daysOverdue: scored.daysOverdue,
          subscription: sub,
        }
      );
    } catch (aiErr: any) {
      aiEnrichment = {
        operatorSummary: scored.reason,
        communicationStrategy: {
          recommendedChannel: 'email',
          suggestedTone: 'empathetic_direct',
          keyTalkingPoints: ['Automated notification'],
        },
        contextualReasoning: scored.rankingExplanation,
        isAiGenerated: false,
        aiStatus: 'failed',
        failureReason: aiErr?.message || String(aiErr),
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      id: `intel_${opp.id}`,
      opportunityId: opp.id,
      workspaceId,
      scoringVersion: OPPORTUNITY_SCORING_VERSION,
      opportunityType: scored.opportunityType,
      amountCents: opp.amount_at_risk_cents,
      currency,
      priority: scored.priority,
      priorityScore: scored.priorityScore,
      urgency: scored.urgency,
      recoveryLikelihood: scored.recoveryLikelihood,
      recoveryLikelihoodScore: scored.recoveryLikelihoodScore,
      confidence: scored.confidence,
      expectedValueCents: scored.expectedValueCents,
      reason: scored.reason,
      evidence: scored.evidence,
      rankingExplanation: scored.rankingExplanation,
      recommendedAction: scored.recommendedAction,
      recommendedActionLabel: scored.recommendedActionLabel,
      recommendedTiming: scored.recommendedTiming,
      expectedImpact: scored.expectedImpact,
      isExpansionCandidate: scored.isExpansionCandidate,
      expansionEvidenceStatus: scored.expansionEvidenceStatus,
      scoreBreakdown: scored.scoreBreakdown,
      daysOverdue: scored.daysOverdue,
      aiEnrichment,
      opportunity: opp,
      customer: cust,
      subscription: sub,
      invoice: inv,
      paymentFailure: failure,
      evaluatedAt: new Date().toISOString(),
      updatedAt: opp.updated_at || opp.created_at,
    };
  }

  /**
   * Records an operator action taken on an opportunity for feedback loop preparation.
   */
  public static async recordAction(
    workspaceId: string,
    opportunityId: string,
    actionData: { actionType: string; channel?: string; executedBy?: string; notes?: string }
  ): Promise<ActionRecord> {
    if (!workspaceId || !opportunityId) {
      const err: any = new Error('Workspace ID and Opportunity ID are required.');
      err.status = 400;
      throw err;
    }

    // Verify opportunity ownership and existence under workspaceId
    let opp: RecoveryOpportunity | null = null;
    if (isSupabaseAuthoritative()) {
      opp = await supabaseService.getRecoveryOpportunityById(workspaceId, opportunityId);
    } else {
      opp = db.getOpportunityById(opportunityId, workspaceId);
    }

    if (!opp || opp.workspace_id !== workspaceId) {
      const err: any = new Error('Opportunity not found or does not belong to this workspace.');
      err.status = 404;
      throw err;
    }

    const actionType = actionData.actionType || 'smart_retry';
    if (!ALLOWED_ACTION_TYPES.includes(actionType)) {
      const err: any = new Error(`Invalid actionType "${actionType}". Allowed types: ${ALLOWED_ACTION_TYPES.join(', ')}`);
      err.status = 400;
      throw err;
    }

    const rawChannel = actionData.channel || 'hosted_portal';
    const channel = rawChannel === 'portal' ? 'hosted_portal' : rawChannel;
    if (!ALLOWED_CHANNELS.includes(channel)) {
      const err: any = new Error(`Invalid channel "${channel}". Allowed channels: ${ALLOWED_CHANNELS.join(', ')}`);
      err.status = 400;
      throw err;
    }

    // Use crypto.randomUUID() instead of Math.random() or act_ prefixes
    const actionRecord: ActionRecord = {
      id: crypto.randomUUID(),
      workspaceId,
      opportunityId,
      actionType,
      channel,
      executedBy: actionData.executedBy || 'operator',
      notes: actionData.notes,
      executedAt: new Date().toISOString(),
    };

    if (isSupabaseAuthoritative()) {
      await supabaseService.recordOpportunityAction({
        id: actionRecord.id,
        workspace_id: workspaceId,
        opportunity_id: opportunityId,
        action_type: actionRecord.actionType,
        channel: actionRecord.channel,
        executed_by: actionRecord.executedBy,
        notes: actionRecord.notes,
        executed_at: actionRecord.executedAt,
      });
    } else {
      db.recordOpportunityAction(actionRecord);
    }

    return actionRecord;
  }

  /**
   * Records a resolution outcome for the historical learning feedback loop.
   */
  public static async recordOutcome(
    workspaceId: string,
    opportunityId: string,
    outcomeData: {
      outcome: string;
      recoveredAmountCents: number;
      timeToRecoverySeconds?: number;
      settlementMethod?: string;
      feedbackNotes?: string;
    }
  ): Promise<OutcomeRecord> {
    if (!workspaceId || !opportunityId) {
      const err: any = new Error('Workspace ID and Opportunity ID are required.');
      err.status = 400;
      throw err;
    }

    let opp: RecoveryOpportunity | null = null;
    if (isSupabaseAuthoritative()) {
      opp = await supabaseService.getRecoveryOpportunityById(workspaceId, opportunityId);
    } else {
      opp = db.getOpportunityById(opportunityId, workspaceId);
    }

    if (!opp || opp.workspace_id !== workspaceId) {
      const err: any = new Error('Opportunity not found or does not belong to this workspace.');
      err.status = 404;
      throw err;
    }

    const outcome = outcomeData.outcome;
    if (!ALLOWED_OUTCOMES.includes(outcome)) {
      const err: any = new Error(`Invalid outcome "${outcome}". Allowed outcomes: ${ALLOWED_OUTCOMES.join(', ')}`);
      err.status = 400;
      throw err;
    }

    const recoveredAmountCents = Number(outcomeData.recoveredAmountCents);
    if (isNaN(recoveredAmountCents) || recoveredAmountCents < 0 || !Number.isInteger(recoveredAmountCents)) {
      const err: any = new Error('recoveredAmountCents must be a non-negative integer.');
      err.status = 400;
      throw err;
    }

    if ((outcome === 'recovered' || outcome === 'partial_recovery') && recoveredAmountCents > opp.amount_at_risk_cents) {
      const err: any = new Error('recoveredAmountCents cannot exceed opportunity amount at risk unless explicitly supported.');
      err.status = 400;
      throw err;
    }

    if (outcomeData.timeToRecoverySeconds !== undefined) {
      const t = Number(outcomeData.timeToRecoverySeconds);
      if (isNaN(t) || t < 0 || !Number.isInteger(t)) {
        const err: any = new Error('timeToRecoverySeconds must be a non-negative integer.');
        err.status = 400;
        throw err;
      }
    }

    // Use crypto.randomUUID() instead of Math.random() or out_ prefixes
    const outcomeRecord: OutcomeRecord = {
      id: crypto.randomUUID(),
      workspaceId,
      opportunityId,
      outcome: outcome as any,
      recoveredAmountCents,
      timeToRecoverySeconds: outcomeData.timeToRecoverySeconds,
      settlementMethod: outcomeData.settlementMethod,
      resolvedAt: new Date().toISOString(),
      feedbackNotes: outcomeData.feedbackNotes,
    };

    if (isSupabaseAuthoritative()) {
      await supabaseService.recordOpportunityOutcome({
        id: outcomeRecord.id,
        workspace_id: workspaceId,
        opportunity_id: opportunityId,
        outcome: outcomeRecord.outcome,
        recovered_amount_cents: outcomeRecord.recoveredAmountCents,
        time_to_recovery_seconds: outcomeRecord.timeToRecoverySeconds,
        settlement_method: outcomeRecord.settlementMethod,
        resolved_at: outcomeRecord.resolvedAt,
        feedback_notes: outcomeRecord.feedbackNotes,
      });
    } else {
      db.recordOpportunityOutcome(outcomeRecord);
    }

    return outcomeRecord;
  }
}
