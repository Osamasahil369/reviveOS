import {
  RecoveryOpportunity,
  Customer,
  Subscription,
  Invoice,
  PaymentFailure,
  FailureCategory,
} from '../../src/types/index.js';
import {
  OpportunityType,
  PriorityTier,
  UrgencyLevel,
  RecoveryLikelihood,
  IntelligenceConfidence,
  RecommendedActionType,
  OpportunityEvidenceItem,
  FactorScoreBreakdown,
} from './types.js';
import { calculateCustomerHealthScore } from '../../src/utils/healthScore.js';

export const OPPORTUNITY_SCORING_VERSION = 'v1';

export const SCORING_WEIGHTS = {
  financialValue: 0.30,
  urgency: 0.25,
  customerHealth: 0.20,
  recoveryLikelihood: 0.15,
  attemptPenalty: 0.10,
};

export interface ScoredOpportunityResult {
  opportunityType: OpportunityType;
  priority: PriorityTier;
  priorityScore: number;
  urgency: UrgencyLevel;
  recoveryLikelihood: RecoveryLikelihood;
  recoveryLikelihoodScore: number;
  confidence: IntelligenceConfidence;
  expectedValueCents: number;
  reason: string;
  evidence: OpportunityEvidenceItem[];
  rankingExplanation: string;
  recommendedAction: RecommendedActionType;
  recommendedActionLabel: string;
  recommendedTiming: string;
  expectedImpact: string;
  isExpansionCandidate: boolean;
  expansionEvidenceStatus?: 'confirmed_evidence' | 'insufficient_evidence';
  scoreBreakdown: FactorScoreBreakdown;
  daysOverdue: number | null;
}

export class OpportunityScoringEngine {
  /**
   * Deterministically evaluates an opportunity and its linked workspace entities.
   * Produces an explainable, weighted score with concrete evidence points and explicit reasoning.
   */
  public static evaluate(
    opportunity: RecoveryOpportunity,
    customer: Customer,
    subscription?: Subscription,
    invoice?: Invoice,
    paymentFailure?: PaymentFailure
  ): ScoredOpportunityResult {
    const amountCents = opportunity.amount_at_risk_cents !== undefined && opportunity.amount_at_risk_cents !== null
      ? opportunity.amount_at_risk_cents
      : invoice?.amount_cents;
    if (typeof amountCents !== 'number' || isNaN(amountCents)) {
      throw new Error(`Opportunity ${opportunity.id} missing required authoritative amount_at_risk_cents and invoice amount`);
    }
    const failureCategory = opportunity.failure_category || paymentFailure?.normalized_category || 'payment_method_declined';
    const now = new Date();

    // 1. Determine Opportunity Type
    const opportunityType = this.determineOpportunityType(opportunity, subscription);
    const isExpansion = opportunityType === 'expansion_candidate';
    const expansionEvidenceStatus = isExpansion ? 'insufficient_evidence' : undefined;

    // 2. Compute Individual Factor Scores (0-100)
    const financialValueScore = this.computeFinancialValueScore(amountCents);
    const urgencyDetails = this.computeUrgencyScore(opportunity, subscription, invoice, paymentFailure, now);
    const healthDetails = this.computeCustomerHealthScore(customer, subscription, paymentFailure, invoice, opportunity);
    const likelihoodDetails = this.computeRecoveryLikelihood(failureCategory, opportunity.current_step_number);
    const attemptPenaltyScore = this.computeAttemptPenaltyScore(opportunity.current_step_number);

    // 3. Calculate Composite Weighted Score
    const rawComposite =
      SCORING_WEIGHTS.financialValue * financialValueScore +
      SCORING_WEIGHTS.urgency * urgencyDetails.score +
      SCORING_WEIGHTS.customerHealth * healthDetails.score +
      SCORING_WEIGHTS.recoveryLikelihood * (likelihoodDetails.score * 100) -
      SCORING_WEIGHTS.attemptPenalty * attemptPenaltyScore;

    const priorityScore = Math.min(100, Math.max(1, Math.round(rawComposite)));

    // 4. Map Priority Tier & Urgency
    const priority = this.mapPriorityTier(priorityScore);
    const urgency = urgencyDetails.urgency;
    const recoveryLikelihood = likelihoodDetails.likelihood;
    const recoveryLikelihoodScore = likelihoodDetails.score;
    const confidence = this.computeConfidence(customer, invoice, paymentFailure);

    // 5. Expected Value Calculation
    const expectedValueCents = Math.round(amountCents * recoveryLikelihoodScore);

    // 6. Action Recommendation
    const actionRecommendation = this.determineRecommendedAction(
      opportunityType,
      failureCategory,
      opportunity.current_step_number,
      urgencyDetails.daysOverdue
    );

    // 7. Extract Concrete Evidence List
    const evidence = this.assembleEvidence(
      opportunity,
      customer,
      amountCents,
      failureCategory,
      urgencyDetails.daysOverdue,
      healthDetails.score,
      subscription,
      opportunity.current_step_number
    );

    // 8. Generate Human-Readable Reason & Ranking Explanation
    const reason = this.buildPrimaryReason(
      opportunityType,
      amountCents,
      opportunity.currency || 'USD',
      customer.name,
      urgencyDetails.daysOverdue,
      failureCategory
    );

    const rankingExplanation = this.buildRankingExplanation(
      priority,
      priorityScore,
      amountCents,
      opportunity.currency || 'USD',
      urgencyDetails.daysOverdue,
      customer,
      likelihoodDetails.likelihood
    );

    const expectedImpact = this.buildExpectedImpact(
      amountCents,
      opportunity.currency || 'USD',
      customer.name,
      opportunityType
    );

    const scoreBreakdown: FactorScoreBreakdown = {
      financialValueScore,
      urgencyScore: urgencyDetails.score,
      customerHealthScore: healthDetails.score,
      recoveryLikelihoodScore: Math.round(likelihoodDetails.score * 100),
      attemptPenaltyScore,
      compositeScore: priorityScore,
      weights: SCORING_WEIGHTS,
    };

    return {
      opportunityType,
      priority,
      priorityScore,
      urgency,
      recoveryLikelihood,
      recoveryLikelihoodScore,
      confidence,
      expectedValueCents,
      reason,
      evidence,
      rankingExplanation,
      recommendedAction: actionRecommendation.action,
      recommendedActionLabel: actionRecommendation.label,
      recommendedTiming: actionRecommendation.timing,
      expectedImpact,
      isExpansionCandidate: isExpansion,
      expansionEvidenceStatus,
      scoreBreakdown,
      daysOverdue: urgencyDetails.daysOverdue,
    };
  }

  private static determineOpportunityType(
    opportunity: RecoveryOpportunity,
    subscription?: Subscription
  ): OpportunityType {
    if ((opportunity.failure_category as string) === 'other_recoverable_failure' || (opportunity as any).opportunity_type === 'renewal_risk') {
      return 'renewal_risk';
    }
    if (opportunity.failure_category && (opportunity.failure_category as string) !== 'other_recoverable_failure') {
      return 'failed_payment';
    }
    if (opportunity.customer?.current_risk_status === 'at_risk' || opportunity.customer?.current_risk_status === 'churned') {
      return 'churn_risk';
    }
    if (opportunity.invoice && (opportunity.invoice.status === 'open' || opportunity.invoice.status === 'past_due')) {
      return 'unpaid_invoice';
    }
    return 'failed_payment';
  }

  private static computeFinancialValueScore(amountCents: number): number {
    if (amountCents >= 200000) return 98; // $2,000+
    if (amountCents >= 100000) return 90; // $1,000+
    if (amountCents >= 50000) return 80;  // $500+
    if (amountCents >= 20000) return 70;  // $200+
    if (amountCents >= 10000) return 60;  // $100+
    if (amountCents >= 5000) return 50;   // $50+
    return 35;
  }

  private static computeUrgencyScore(
    opportunity: RecoveryOpportunity,
    subscription?: Subscription,
    invoice?: Invoice,
    paymentFailure?: PaymentFailure,
    now: Date = new Date()
  ): { score: number; urgency: UrgencyLevel; daysOverdue: number | null } {
    let daysOverdue: number | null = null;

    const opportunityType = this.determineOpportunityType(opportunity, subscription);

    if (opportunityType === 'renewal_risk') {
      if (subscription?.current_period_end) {
        const renewalDate = new Date(subscription.current_period_end);
        if (!isNaN(renewalDate.getTime())) {
          const daysUntilRenewal = Math.floor((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntilRenewal <= 2) return { score: 95, urgency: 'immediate', daysOverdue: null };
          if (daysUntilRenewal <= 5) return { score: 85, urgency: 'high', daysOverdue: null };
          if (daysUntilRenewal <= 14) return { score: 70, urgency: 'medium', daysOverdue: null };
          return { score: 55, urgency: 'medium', daysOverdue: null };
        }
      }
      return { score: 60, urgency: 'medium', daysOverdue: null };
    }

    // Check payment failure date, invoice date, or opportunity creation date
    const dateStr = paymentFailure?.occurred_at || invoice?.due_date || invoice?.created_at || opportunity.created_at;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        const diffMs = now.getTime() - parsed.getTime();
        daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
    }

    const effectiveDays = daysOverdue ?? 0;

    if (effectiveDays <= 1) return { score: 95, urgency: 'immediate', daysOverdue };
    if (effectiveDays <= 3) return { score: 85, urgency: 'high', daysOverdue };
    if (effectiveDays <= 7) return { score: 70, urgency: 'medium', daysOverdue };
    if (effectiveDays <= 14) return { score: 55, urgency: 'medium', daysOverdue };
    if (effectiveDays <= 30) return { score: 40, urgency: 'low', daysOverdue };
    return { score: 25, urgency: 'low', daysOverdue };
  }

  private static computeCustomerHealthScore(
    customer: Customer,
    subscription?: Subscription,
    paymentFailure?: PaymentFailure,
    invoice?: Invoice,
    opportunity?: RecoveryOpportunity
  ): { score: number } {
    const failedPaymentsCount = (paymentFailure && !paymentFailure.is_resolved) ? 1 : 0;
    const retriesCount = opportunity?.current_step_number ? Math.max(0, opportunity.current_step_number - 1) : 0;
    const hasPastDueInvoice = invoice?.status === 'past_due' || invoice?.status === 'open' || customer.current_risk_status === 'at_risk';
    const openInvoiceAgeDays = invoice?.due_date || invoice?.created_at ? Math.max(0, Math.floor((Date.now() - new Date(invoice.due_date || invoice.created_at).getTime()) / (1000 * 60 * 60 * 24))) : undefined;
    const subscriptionCreatedAt = subscription?.created_at || customer.created_at;

    const health = calculateCustomerHealthScore({
      failedPaymentsCount,
      retriesCount,
      hasPastDueInvoice,
      openInvoiceAgeDays,
      subscriptionCreatedAt,
    });

    return { score: health.score };
  }

  private static computeRecoveryLikelihood(
    category: FailureCategory,
    attemptCount: number = 1
  ): { likelihood: RecoveryLikelihood; score: number } {
    let baseScore = 0.70;

    switch (category) {
      case 'insufficient_funds':
        baseScore = 0.85; // Highly recoverable via smart retry
        break;
      case 'payment_method_declined':
        baseScore = 0.75; // Recoverable via hosted payment link
        break;
      case 'expired_card':
        baseScore = 0.70; // Requires token update
        break;
      case 'authentication_required':
        baseScore = 0.65; // Customer 3DS authorization required
        break;
      case 'bank_related_failure':
        baseScore = 0.55;
        break;
      case 'other_recoverable_failure':
        baseScore = 0.80; // Proactive renewal
        break;
      default:
        baseScore = 0.50;
    }

    // Step penalty: each previous attempt slightly discounts likelihood
    const attempts = Math.max(1, attemptCount);
    const discounted = Math.max(0.15, baseScore - (attempts - 1) * 0.12);

    let likelihood: RecoveryLikelihood = 'medium';
    if (discounted >= 0.75) likelihood = 'high';
    else if (discounted < 0.50) likelihood = 'low';

    return { likelihood, score: Math.round(discounted * 100) / 100 };
  }

  private static computeAttemptPenaltyScore(stepNumber: number = 1): number {
    if (stepNumber <= 1) return 0;
    if (stepNumber === 2) return 25;
    if (stepNumber === 3) return 55;
    return 85;
  }

  private static mapPriorityTier(score: number): PriorityTier {
    if (score >= 75) return 'P1_CRITICAL';
    if (score >= 55) return 'P2_HIGH';
    if (score >= 35) return 'P3_MEDIUM';
    return 'P4_LOW';
  }

  private static computeConfidence(
    customer: Customer,
    invoice?: Invoice,
    paymentFailure?: PaymentFailure
  ): IntelligenceConfidence {
    let dataPoints = 0;
    if (customer.lifetime_value_cents > 0) dataPoints++;
    if (invoice?.amount_cents) dataPoints++;
    if (paymentFailure?.normalized_category) dataPoints++;
    if (customer.current_risk_status) dataPoints++;

    if (dataPoints >= 3) return 'high';
    if (dataPoints >= 2) return 'medium';
    return 'low';
  }

  private static determineRecommendedAction(
    type: OpportunityType,
    category: FailureCategory,
    attemptNumber: number,
    daysOverdue: number | null
  ): { action: RecommendedActionType; label: string; timing: string } {
    if (type === 'renewal_risk') {
      return {
        action: 'proactive_renewal',
        label: 'Proactive Renewal Verification',
        timing: 'Dispatch 48 hours before billing period rollover',
      };
    }

    if (type === 'churn_risk') {
      return {
        action: 'customer_outreach',
        label: 'Executive Customer Concierge Outreach',
        timing: 'Engage within 24 hours to prevent account cancellation',
      };
    }

    if (type === 'expansion_candidate') {
      return {
        action: 'review_expansion_evidence',
        label: 'Audit Account for Verified Expansion Telemetry',
        timing: 'Review at next quarterly business cycle',
      };
    }

    const effectiveDays = daysOverdue ?? 1;

    // Failed payments & unpaid invoices
    if (category === 'insufficient_funds' && attemptNumber <= 1 && effectiveDays <= 3) {
      return {
        action: 'smart_retry',
        label: 'Trigger Smart Gateway Retry',
        timing: 'Execute smart retry based on current billing evidence',
      };
    }

    if (category === 'expired_card' || attemptNumber >= 2 || effectiveDays > 3) {
      return {
        action: 'magic_link',
        label: 'Send Dynamic Customer Payment Link',
        timing: 'Send immediately via authenticated customer portal link',
      };
    }

    return {
      action: 'smart_retry',
      label: 'Execute Smart Automated Recovery',
      timing: 'Queue for automated retry based on failure category',
    };
  }

  private static assembleEvidence(
    opp: RecoveryOpportunity,
    customer: Customer,
    amountCents: number,
    category: FailureCategory,
    daysOverdue: number | null,
    healthScore: number,
    subscription?: Subscription,
    attemptNumber: number = 1
  ): OpportunityEvidenceItem[] {
    const evidence: OpportunityEvidenceItem[] = [
      {
        key: 'amount_at_risk',
        label: 'Revenue Amount at Risk',
        value: `${(amountCents / 100).toFixed(2)} ${opp.currency || 'USD'}`,
        significance: amountCents >= 10000 ? 'negative' : 'neutral',
        source: 'payment_ledger',
      },
      {
        key: 'failure_age',
        label: 'Days Elapsed Since Trigger',
        value: daysOverdue !== null ? `${daysOverdue} day(s) ago` : 'Unknown',
        significance: daysOverdue !== null && daysOverdue <= 3 ? 'positive' : 'neutral',
        source: 'gateway_telemetry',
      },
      {
        key: 'failure_reason',
        label: 'Gateway Decline Classification',
        value: category.replace(/_/g, ' ').toUpperCase(),
        significance: category === 'insufficient_funds' ? 'positive' : 'neutral',
        source: 'gateway_telemetry',
      },
      {
        key: 'customer_health',
        label: 'Account Health Index',
        value: `${healthScore}/100`,
        significance: healthScore >= 70 ? 'positive' : 'negative',
        source: 'customer_profile',
      },
      {
        key: 'attempt_count',
        label: 'Recovery Attempt Sequence',
        value: `Step ${attemptNumber} of 4`,
        significance: attemptNumber === 1 ? 'positive' : 'neutral',
        source: 'payment_ledger',
      },
    ];

    if (subscription?.plan_name) {
      evidence.push({
        key: 'subscription_plan',
        label: 'Active Subscription Plan',
        value: subscription.plan_name,
        significance: 'positive',
        source: 'subscription_state',
      });
    }

    return evidence;
  }

  private static buildPrimaryReason(
    type: OpportunityType,
    amountCents: number,
    currency: string,
    customerName: string,
    daysOverdue: number | null,
    category: FailureCategory
  ): string {
    const formattedAmount = `${(amountCents / 100).toFixed(2)} ${currency}`;
    if (type === 'renewal_risk') {
      return `${formattedAmount} upcoming renewal for ${customerName} requires proactive confirmation before period close.`;
    }
    if (type === 'churn_risk') {
      return `Behavioral churn signals detected on ${customerName} account representing ${formattedAmount} at-risk ARR.`;
    }
    if (type === 'expansion_candidate') {
      return `Expansion candidate (${customerName}) — flagged for review pending verified usage telemetry.`;
    }
    const ageStr = daysOverdue !== null ? `${daysOverdue} day(s) ago` : 'recently';
    return `${formattedAmount} payment failed ${ageStr} (${category.replace(/_/g, ' ')}) on ${customerName} account.`;
  }

  private static buildRankingExplanation(
    priority: PriorityTier,
    score: number,
    amountCents: number,
    currency: string,
    daysOverdue: number | null,
    customer: Customer,
    likelihood: RecoveryLikelihood
  ): string {
    const formattedAmount = `${(amountCents / 100).toFixed(2)} ${currency}`;
    const tenureDays = Math.max(1, Math.floor((Date.now() - new Date(customer.created_at || Date.now()).getTime()) / 86400000));
    const freshnessStr = daysOverdue !== null ? `${daysOverdue}d freshness within high-recovery window` : 'freshness unknown';
    
    return `Ranks ${priority} (Score: ${score}/100) due to ${formattedAmount} value, ${freshnessStr}, ${tenureDays}d established customer relationship, and ${likelihood} recovery probability.`;
  }

  private static buildExpectedImpact(
    amountCents: number,
    currency: string,
    customerName: string,
    type: OpportunityType
  ): string {
    const formattedAmount = `${(amountCents / 100).toFixed(2)} ${currency}`;
    if (type === 'renewal_risk') {
      return `Secures ${formattedAmount} recurring ARR renewal and maintains unbroken subscription continuity for ${customerName}.`;
    }
    return `Recovers ${formattedAmount} in earned cash flow and restores billing token for ${customerName}.`;
  }
}
