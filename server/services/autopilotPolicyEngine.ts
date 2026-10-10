import crypto from 'crypto';
import { db } from '../store/db.js';
import {
  AutopilotDecision,
  AutopilotSettings,
  Customer,
  PolicyAuditEntry,
  PolicyEvaluationResult,
  RecoveryOpportunity,
  Workspace,
} from '../../src/types/index.js';

export const DEFAULT_POLICY_THRESHOLDS = {
  DEFAULT_MAX_AMOUNT_CENTS: 50000, // $500
};

export class AutopilotPolicyEngine {
  /**
   * Deterministic Policy Evaluation Engine
   * Takes opportunity, customer, workspace, and autopilot settings, and deterministically
   * outputs AUTONOMOUS, MANUAL_REVIEW, or BLOCKED with a plain-English explanation.
   */
  public static evaluate(
    opportunity: (Partial<RecoveryOpportunity> & {
      amount_due_cents?: number;
      is_fraud?: boolean;
      is_chargeback?: boolean;
      has_active_dispute?: boolean;
      dispute_status?: string;
      dispute_id?: string;
    }) | null | undefined,
    customer: (Partial<Customer> & {
      is_vip?: boolean;
      is_enterprise?: boolean;
      account_type?: string;
      tier?: string;
      is_high_risk?: boolean;
      risk_level?: string;
      risk_score?: number;
      tags?: string[];
      plan_name?: string;
    }) | null | undefined,
    workspace: Partial<Workspace> | null | undefined,
    autopilotSettings: Partial<AutopilotSettings> | null | undefined
  ): PolicyEvaluationResult {
    const timestamp = new Date().toISOString();

    const opp = opportunity || {};
    const cust = customer || opp.customer || {};
    const settings: Partial<AutopilotSettings> = autopilotSettings || workspace?.autopilot_settings || {};

    const isINR = (opp.currency || workspace?.currency || '').toUpperCase() === 'INR';
    const defaultThreshold = isINR ? 5000000 : DEFAULT_POLICY_THRESHOLDS.DEFAULT_MAX_AMOUNT_CENTS; // ₹50,000 for INR, $500 for USD

    const thresholdCents =
      typeof settings.auto_recover_limit_cents === 'number' && (!isINR || settings.auto_recover_limit_cents !== DEFAULT_POLICY_THRESHOLDS.DEFAULT_MAX_AMOUNT_CENTS)
        ? settings.auto_recover_limit_cents
        : defaultThreshold;

    const vipProtectionOn = settings.vip_customer_protection !== false;
    const enterpriseProtectionOn = settings.enterprise_account_protection !== false;

    // Normalize error/failure codes and messages for inspection
    const rawFailureCode = (
      opp.payment_failure?.provider_failure_code ||
      (opp as any).failure_code ||
      opp.payment_failure?.normalized_category ||
      opp.failure_category ||
      ''
    ).toLowerCase();

    const rawErrorMessage = (
      opp.payment_failure?.raw_error_message ||
      (opp as any).raw_error_message ||
      ''
    ).toLowerCase();

    const combinedText = `${rawFailureCode} ${rawErrorMessage}`;

    // -------------------------------------------------------------
    // 1. DETERMINISTIC BLOCKED RULES (Highest Priority - Never Automate)
    // -------------------------------------------------------------

    // Rule: Fraud
    const isFraud =
      opp.is_fraud === true ||
      combinedText.includes('fraud') ||
      combinedText.includes('fraudulent') ||
      combinedText.includes('suspected_fraud') ||
      combinedText.includes('pickup_card') ||
      combinedText.includes('card_velocity_exceeded') ||
      (opp as any).fraud_score && (opp as any).fraud_score > 75;

    if (isFraud) {
      return {
        decision: 'BLOCKED',
        reason: 'Fraud detected on payment method. Recovery blocked.',
        rule_evaluated: 'BLOCKED_FRAUD',
        timestamp,
        metadata: {
          failure_code: rawFailureCode,
          rule: 'fraud',
        },
      };
    }

    // Rule: Stolen Card
    const isStolenCard =
      rawFailureCode === 'stolen_card' ||
      combinedText.includes('stolen_card') ||
      combinedText.includes('stolen');

    if (isStolenCard) {
      return {
        decision: 'BLOCKED',
        reason: 'Card reported stolen. Recovery blocked for security.',
        rule_evaluated: 'BLOCKED_STOLEN_CARD',
        timestamp,
        metadata: {
          failure_code: rawFailureCode,
          rule: 'stolen_card',
        },
      };
    }

    // Rule: Lost Card
    const isLostCard =
      rawFailureCode === 'lost_card' ||
      combinedText.includes('lost_card') ||
      (combinedText.includes('lost') && !combinedText.includes('connection'));

    if (isLostCard) {
      return {
        decision: 'BLOCKED',
        reason: 'Card reported lost. Recovery blocked.',
        rule_evaluated: 'BLOCKED_LOST_CARD',
        timestamp,
        metadata: {
          failure_code: rawFailureCode,
          rule: 'lost_card',
        },
      };
    }

    // Rule: Chargeback
    const isChargeback =
      opp.is_chargeback === true ||
      combinedText.includes('chargeback') ||
      rawFailureCode === 'chargeback';

    if (isChargeback) {
      return {
        decision: 'BLOCKED',
        reason: 'Chargeback detected. Automatic recovery is blocked.',
        rule_evaluated: 'BLOCKED_CHARGEBACK',
        timestamp,
        metadata: {
          rule: 'chargeback',
        },
      };
    }

    // Rule: Active Dispute
    const disputeStatus = (opp.dispute_status || '').toLowerCase();
    const hasActiveDispute =
      opp.has_active_dispute === true ||
      Boolean(opp.dispute_id && disputeStatus !== 'none' && disputeStatus !== 'resolved' && disputeStatus !== 'won') ||
      disputeStatus === 'active' ||
      disputeStatus === 'under_review' ||
      disputeStatus === 'needs_response' ||
      combinedText.includes('dispute');

    if (hasActiveDispute) {
      return {
        decision: 'BLOCKED',
        reason: 'Customer has active dispute.',
        rule_evaluated: 'BLOCKED_ACTIVE_DISPUTE',
        timestamp,
        metadata: {
          dispute_status: opp.dispute_status,
          rule: 'active_dispute',
        },
      };
    }

    // -------------------------------------------------------------
    // 2. DETERMINISTIC MANUAL REVIEW RULES (Requires Human Oversight)
    // -------------------------------------------------------------

    // Rule: Invoice Amount Exceeds Workspace Threshold
    const amountCents =
      typeof opp.amount_at_risk_cents === 'number'
        ? opp.amount_at_risk_cents
        : typeof opp.amount_due_cents === 'number'
        ? opp.amount_due_cents
        : typeof opp.invoice?.amount_cents === 'number'
        ? opp.invoice.amount_cents
        : typeof opp.payment_failure?.amount_cents === 'number'
        ? opp.payment_failure.amount_cents
        : 0;

    if (amountCents > thresholdCents) {
      return {
        decision: 'MANUAL_REVIEW',
        reason: 'Invoice exceeds automatic recovery limit.',
        rule_evaluated: 'MANUAL_REVIEW_THRESHOLD_EXCEEDED',
        timestamp,
        metadata: {
          amount_cents: amountCents,
          threshold_cents: thresholdCents,
          rule: 'amount_threshold',
        },
      };
    }

    // Rule: VIP Customer Protection
    const isVipCustomer =
      cust.is_vip === true ||
      cust.tier === 'vip' ||
      (Array.isArray(cust.tags) && cust.tags.some((t) => t.toLowerCase() === 'vip')) ||
      (Boolean((cust as any).plan_name && (cust as any).plan_name.toLowerCase().includes('vip'))) ||
      (Boolean(cust.name && cust.name.toLowerCase().includes('vip')));

    if (vipProtectionOn && isVipCustomer) {
      return {
        decision: 'MANUAL_REVIEW',
        reason: 'VIP customer account requires manual review.',
        rule_evaluated: 'MANUAL_REVIEW_VIP_CUSTOMER',
        timestamp,
        metadata: {
          customer_id: cust.id,
          vip_protection: true,
          rule: 'vip_customer',
        },
      };
    }

    // Rule: Enterprise Account Protection
    const isEnterpriseCustomer =
      cust.is_enterprise === true ||
      cust.account_type === 'enterprise' ||
      cust.tier === 'enterprise' ||
      (Array.isArray(cust.tags) && cust.tags.some((t) => t.toLowerCase() === 'enterprise')) ||
      (Boolean((cust as any).plan_name && (cust as any).plan_name.toLowerCase().includes('enterprise')));

    if (enterpriseProtectionOn && isEnterpriseCustomer) {
      return {
        decision: 'MANUAL_REVIEW',
        reason: 'Enterprise account requires manual review.',
        rule_evaluated: 'MANUAL_REVIEW_ENTERPRISE_ACCOUNT',
        timestamp,
        metadata: {
          customer_id: cust.id,
          enterprise_protection: true,
          rule: 'enterprise_account',
        },
      };
    }

    // Rule: High Risk Account
    const isHighRiskAccount =
      cust.is_high_risk === true ||
      cust.risk_level === 'high' ||
      cust.risk_level === 'critical' ||
      (typeof cust.risk_score === 'number' && cust.risk_score >= 70) ||
      (cust.health_score && typeof cust.health_score === 'object' && cust.health_score.risk_level === 'Critical Risk');

    if (isHighRiskAccount) {
      return {
        decision: 'MANUAL_REVIEW',
        reason: 'High risk account flagged for manual review.',
        rule_evaluated: 'MANUAL_REVIEW_HIGH_RISK_ACCOUNT',
        timestamp,
        metadata: {
          customer_id: cust.id,
          risk_level: cust.risk_level,
          risk_score: cust.risk_score,
          rule: 'high_risk_account',
        },
      };
    }

    // -------------------------------------------------------------
    // 3. DETERMINISTIC AUTONOMOUS RULES (Safe for Automated Recovery)
    // -------------------------------------------------------------

    // Rule: Insufficient Funds
    const isInsufficientFunds =
      rawFailureCode.includes('insufficient_funds') ||
      rawFailureCode.includes('insufficient_balance') ||
      rawFailureCode.includes('nsf') ||
      combinedText.includes('insufficient funds');

    if (isInsufficientFunds) {
      return {
        decision: 'AUTONOMOUS',
        reason: 'Insufficient funds qualifies for automatic recovery.',
        rule_evaluated: 'AUTONOMOUS_INSUFFICIENT_FUNDS',
        timestamp,
        metadata: {
          failure_code: rawFailureCode,
          rule: 'insufficient_funds',
        },
      };
    }

    // Rule: Temporary Provider Failure
    const isTemporaryProviderFailure =
      rawFailureCode.includes('temporary_failure') ||
      rawFailureCode.includes('processing_error') ||
      rawFailureCode.includes('issuer_down') ||
      rawFailureCode.includes('gateway_timeout') ||
      rawFailureCode.includes('network_error') ||
      rawFailureCode.includes('rate_limit') ||
      combinedText.includes('temporary') ||
      combinedText.includes('try again later');

    if (isTemporaryProviderFailure) {
      return {
        decision: 'AUTONOMOUS',
        reason: 'Temporary provider failure qualifies for automatic recovery.',
        rule_evaluated: 'AUTONOMOUS_PROVIDER_FAILURE',
        timestamp,
        metadata: {
          failure_code: rawFailureCode,
          rule: 'temporary_provider_failure',
        },
      };
    }

    // Rule: Soft Declines
    const isSoftDecline =
      rawFailureCode.includes('soft_decline') ||
      rawFailureCode.includes('generic_decline') ||
      rawFailureCode.includes('card_declined') ||
      rawFailureCode.includes('do_not_honor') ||
      (opp.failure_category as string) === 'soft_decline' ||
      ((opp.payment_failure?.normalized_category as unknown as string) === 'soft_decline');

    if (isSoftDecline) {
      return {
        decision: 'AUTONOMOUS',
        reason: 'Soft decline qualifies for automatic recovery.',
        rule_evaluated: 'AUTONOMOUS_SOFT_DECLINE',
        timestamp,
        metadata: {
          failure_code: rawFailureCode,
          rule: 'soft_decline',
        },
      };
    }

    // Default Autonomous Rule: Standard Customer Below Threshold
    return {
      decision: 'AUTONOMOUS',
      reason: 'Standard customer and invoice below recovery threshold qualifies for automatic recovery.',
      rule_evaluated: 'AUTONOMOUS_STANDARD_CUSTOMER',
      timestamp,
      metadata: {
        amount_cents: amountCents,
        threshold_cents: thresholdCents,
        rule: 'standard_customer_below_threshold',
      },
    };
  }

  /**
   * Evaluates an opportunity in a workspace and records the evaluation in the Policy Audit Log.
   */
  public static evaluateAndLog(
    workspaceId: string,
    opportunityId: string
  ): PolicyEvaluationResult {
    if (!workspaceId) throw new Error('workspaceId is required for policy evaluation');
    if (!opportunityId) throw new Error('opportunityId is required for policy evaluation');

    const opp = db.getOpportunityById(opportunityId, workspaceId);
    if (!opp) throw new Error(`Opportunity ${opportunityId} not found in workspace ${workspaceId}`);

    const customer = db.getCustomerById(opp.customer_id, workspaceId) || opp.customer;
    const workspace = db.getWorkspace(workspaceId);
    const settings = db.getAutopilotSettings(workspaceId);

    const result = this.evaluate(opp, customer, workspace, settings);

    // Save decision onto stored opportunity
    opp.policy_decision = result;

    // Record into policy audit ledger
    this.recordAuditEntry(workspaceId, {
      opportunity_id: opportunityId,
      customer_id: opp.customer_id,
      rule_evaluated: result.rule_evaluated,
      decision: result.decision,
      reason: result.reason,
      timestamp: result.timestamp,
      metadata: result.metadata,
    });

    return result;
  }

  /**
   * Stores an entry in the Policy Audit Log with multi-tenant isolation.
   */
  public static recordAuditEntry(
    workspaceId: string,
    entry: {
      opportunity_id?: string;
      customer_id?: string;
      rule_evaluated: string;
      decision: AutopilotDecision;
      reason: string;
      timestamp?: string;
      metadata?: Record<string, any>;
    }
  ): PolicyAuditEntry {
    return db.recordPolicyAuditEntry(workspaceId, {
      opportunity_id: entry.opportunity_id,
      customer_id: entry.customer_id,
      rule_evaluated: entry.rule_evaluated,
      decision: entry.decision,
      reason: entry.reason,
      timestamp: entry.timestamp || new Date().toISOString(),
      metadata: entry.metadata,
    });
  }

  /**
   * Fetches Policy Audit Logs for a workspace, optionally filtered by opportunity.
   */
  public static getAuditLogs(
    workspaceId: string,
    opportunityId?: string
  ): PolicyAuditEntry[] {
    return db.getPolicyAuditLogs(workspaceId, opportunityId);
  }
}
