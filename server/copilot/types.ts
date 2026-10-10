import { RecoveryOpportunity, Customer, Subscription, Invoice, PaymentFailure, FailureCategory } from '../../src/types/index.js';
import { RecommendedActionType } from '../intelligence/types.js';
import { HistoricalEvidenceSummary } from '../learning/outcomeLearningEngine.js';

export type RecoveryStrategyType =
  | 'failed_payment'
  | 'overdue_invoice'
  | 'renewal'
  | 'churn_intervention'
  | 'expansion';

export type CopilotApprovalStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed';

export type CopilotActionState =
  | 'pending'
  | 'recommended'
  | 'approved'
  | 'queued'
  | 'executing'
  | 'succeeded'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'expired';

export interface CopilotStep {
  id: string;
  planId: string;
  stepNumber: number;
  actionType: RecommendedActionType | string;
  actionLabel: string;
  reason: string;
  timing: string;
  expectedPurpose: string;
  state: CopilotActionState;
  isRetryable: boolean;
  requiresHumanApproval: boolean;
  executedAt?: string;
  resultReference?: string;
  failureReason?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotRecoveryPlan {
  id: string;
  workspaceId: string;
  opportunityId: string;
  strategyType: RecoveryStrategyType;
  goal: string;
  why: string[];
  recommendedSteps: CopilotStep[];
  expectedResult: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
  recoverySummary?: string;
  whyThisMatters?: string[];
  recommendedActionSummary?: string;
  alternativeActionsConsidered?: Array<{
    actionType: string;
    actionLabel: string;
    reasonNotSelected: string;
  }>;
  timingRecommendation?: {
    timing: string;
    explanation: string;
  };
  riskAssessment?: {
    level: 'Low' | 'Medium' | 'High';
    explanation: string;
  };
  confidenceExplanation?: {
    level: 'Low' | 'Medium' | 'High';
    explanation: string;
  };
  relevantHistoricalOutcomes?: {
    successPatterns: string[];
    failurePatterns: string[];
    nextBestAction: string;
  };
  expectedRecoveryValueExplanation?: string;
  approvalStatus: CopilotApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  planVersion?: string | number;
  rejectedReason?: string;
  workflowStatus?: 'not_started' | 'executing' | 'success' | 'partial_success' | 'failed';
  workflowOutcome?: 'success' | 'partial_success' | 'failed';
  currentStepIndex?: number;
  historicalEvidence?: HistoricalEvidenceSummary;
}

export interface CopilotExecutionLog {
  id: string;
  workspaceId: string;
  opportunityId: string;
  stepId: string;
  actionType: string;
  stateBefore: CopilotActionState;
  stateAfter: CopilotActionState;
  executedBy: string;
  providerReference?: string;
  resultStatus: 'success' | 'failed';
  failureReason?: string;
  executedAt: string;
}
