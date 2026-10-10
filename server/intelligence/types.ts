import {
  RecoveryOpportunity,
  Customer,
  Subscription,
  Invoice,
  PaymentFailure,
  FailureCategory,
  RecoveryStatus,
} from '../../src/types/index.js';

export type OpportunityType =
  | 'failed_payment'
  | 'unpaid_invoice'
  | 'renewal_risk'
  | 'churn_risk'
  | 'expansion_candidate';

export type PriorityTier = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';
export type UrgencyLevel = 'immediate' | 'high' | 'medium' | 'low';
export type RecoveryLikelihood = 'high' | 'medium' | 'low';
export type IntelligenceConfidence = 'high' | 'medium' | 'low';

export type RecommendedActionType =
  | 'smart_retry'
  | 'magic_link'
  | 'proactive_renewal'
  | 'customer_outreach'
  | 'review_expansion_evidence'
  | 'manual_review';

export interface OpportunityEvidenceItem {
  key: string;
  label: string;
  value: string | number;
  significance: 'positive' | 'neutral' | 'negative';
  source: 'payment_ledger' | 'subscription_state' | 'customer_profile' | 'gateway_telemetry';
}

export interface FactorScoreBreakdown {
  financialValueScore: number;       // 0-100 (Weight: 30%)
  urgencyScore: number;              // 0-100 (Weight: 25%)
  customerHealthScore: number;       // 0-100 (Weight: 20%)
  recoveryLikelihoodScore: number;   // 0-100 (Weight: 15%)
  attemptPenaltyScore: number;       // 0-100 (Weight: 10%)
  compositeScore: number;            // 0-100 weighted final score
  weights: {
    financialValue: number;
    urgency: number;
    customerHealth: number;
    recoveryLikelihood: number;
    attemptPenalty: number;
  };
}

export type AiStatus = 'generated' | 'fallback' | 'unavailable' | 'failed';

export interface AiEnrichmentResult {
  operatorSummary: string;
  communicationStrategy: {
    recommendedChannel: 'email' | 'sms' | 'hosted_portal' | 'manual_call';
    suggestedSubject?: string;
    suggestedTone: 'empathetic_direct' | 'courteous_reminder' | 'executive_concierge' | 'urgent_security';
    keyTalkingPoints: string[];
  };
  contextualReasoning: string;
  isAiGenerated: boolean;
  aiStatus: AiStatus;
  failureReason?: string;
  generatedAt: string;
  modelUsed?: string;
}

export interface OpportunityIntelligenceRecord {
  id: string;
  opportunityId: string;
  workspaceId: string;
  scoringVersion: string;
  opportunityType: OpportunityType;
  amountCents: number;
  currency: string;
  priority: PriorityTier;
  priorityScore: number;              // 0-100 deterministic integer
  urgency: UrgencyLevel;
  recoveryLikelihood: RecoveryLikelihood;
  recoveryLikelihoodScore: number;    // 0.0 to 1.0 heuristic score
  confidence: IntelligenceConfidence;
  expectedValueCents: number;         // amountCents * recoveryLikelihoodScore
  
  // Explainability Core
  reason: string;                     // Primary headline explanation
  evidence: OpportunityEvidenceItem[];// Concrete verifiable data points
  rankingExplanation: string;         // Why this ranks where it does relative to other items
  
  // Action Recommendations
  recommendedAction: RecommendedActionType;
  recommendedActionLabel: string;
  recommendedTiming: string;
  expectedImpact: string;

  // Expansion Flag
  isExpansionCandidate: boolean;
  expansionEvidenceStatus?: 'confirmed_evidence' | 'insufficient_evidence';

  // Scoring Details
  scoreBreakdown: FactorScoreBreakdown;
  daysOverdue: number | null;

  // AI Enrichment Layer
  aiEnrichment: AiEnrichmentResult;

  // Underlying Mapped Data
  opportunity: RecoveryOpportunity;
  customer: Customer;
  subscription?: Subscription;
  invoice?: Invoice;
  paymentFailure?: PaymentFailure;

  evaluatedAt: string;
  updatedAt: string;
}

export interface ActionRecord {
  id: string;
  workspaceId: string;
  opportunityId: string;
  actionType: RecommendedActionType | string;
  channel?: string;
  executedBy: string; // User ID or 'system_automated'
  notes?: string;
  executedAt: string;
  resultStatus?: string;
  metadata?: Record<string, any>;
}

export interface OutcomeRecord {
  id: string;
  workspaceId: string;
  opportunityId: string;
  outcome: 'recovered' | 'unrecoverable' | 'expired' | 'canceled' | 'partial_recovery';
  recoveredAmountCents: number;
  timeToRecoverySeconds?: number;
  settlementMethod?: string;
  resolvedAt: string;
  feedbackNotes?: string;
}

export interface CurrencyQueueTotals {
  totalAtRiskCents: number;
  totalExpectedValueCents: number;
  count: number;
}

export interface PrioritizedQueueResponse {
  workspaceId: string;
  scoringVersion: string;
  totalPrioritized: number;
  totalAtRiskCents: number;
  totalExpectedValueCents: number;
  queueOpportunityValueCents: number;
  queueExpectedRecoveryValueCents: number;
  currency: string;
  totalsByCurrency: Record<string, CurrencyQueueTotals>;
  generatedAt: string;
  queue: OpportunityIntelligenceRecord[];
  summary: {
    criticalCount: number;  // P1
    highCount: number;      // P2
    mediumCount: number;    // P3
    lowCount: number;       // P4
    byAction: Record<string, number>;
    byLikelihood: Record<string, number>;
  };
}

export type RevenueBrainCategory = 'RECOVERY' | 'CHURN_PREVENTION' | 'EXPANSION';

export interface UnifiedRevenueOpportunity {
  id: string;
  workspaceId: string;
  category: RevenueBrainCategory;
  title: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  financialAmountCents: number;
  expectedValueCents: number;
  currency: string;
  impactScore: number;
  priorityTier: PriorityTier;
  confidence: 'high' | 'medium' | 'low';
  evidenceQuality: 'high' | 'medium' | 'low';
  rankingExplanation: string;
  evidence: string[];
  recommendedAction: string;
  evaluatedAt: string;
  sourceId: string;
  sourceType: 'recovery_opportunity' | 'churn_risk' | 'expansion_opportunity';
  metadata?: Record<string, any>;
}

export interface RevenueBrainResponse {
  workspaceId: string;
  generatedAt: string;
  totalOpportunities: number;
  totalAtRiskCents: number;
  totalRecoverableCents: number;
  totalExpansionValueCents: number;
  summary: {
    recoveryCount: number;
    churnCount: number;
    expansionCount: number;
    p1Count: number;
    p2Count: number;
    p3Count: number;
    p4Count: number;
  };
  opportunities: UnifiedRevenueOpportunity[];
  outcomeOptimizationSummary?: {
    hasSufficientSample: boolean;
    evidenceStatements: string[];
    recommendations: string[];
  };
  activeOptimizations?: Array<{
    type: string;
    target: string;
    whatChanged: string;
    whyOptimizationWasChosen: string;
    historicalEvidence: string;
    confidenceLevel: 'high' | 'medium' | 'low' | 'none';
    confidenceScore: number;
    sampleSize: number;
    isApplied: boolean;
  }>;
}
