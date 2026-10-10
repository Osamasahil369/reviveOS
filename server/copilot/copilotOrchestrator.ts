import { db } from '../store/db.js';
import { supabaseService } from '../db/supabaseService.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { EmailService } from '../email/service.js';
import { PaymentProviderFactory } from '../providers/factory.js';
import {
  RecoveryOpportunity,
  Customer,
  Subscription,
  Invoice,
  PaymentFailure,
} from '../../src/types/index.js';
import {
  CopilotRecoveryPlan,
  CopilotStep,
  CopilotExecutionLog,
  RecoveryStrategyType,
  CopilotActionState,
} from './types.js';
import { OutcomeLearningEngine } from '../learning/outcomeLearningEngine.js';
import { ExpansionFinderEngine } from '../intelligence/expansionFinder.js';
import { DispatchAdapterRegistry } from '../services/dispatchAdapters.js';
import { RecoveryEffectivenessEngine } from '../intelligence/recoveryEffectivenessEngine.js';

export class CopilotOrchestrator {
  private static plans: Map<string, CopilotRecoveryPlan> = new Map();
  private static memoryExecutionLogs: CopilotExecutionLog[] = [];

  public static clearCache(): void {
    this.plans.clear();
  }

  private static getPublicUrl(): string {
    const url = process.env.REVIVEOS_PUBLIC_URL || process.env.VITE_PUBLIC_URL;
    const isTest = process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('test'));
    if (!isTest && (process.env.NODE_ENV === 'production' || process.env.STORAGE_MODE === 'supabase_production')) {
      if (!url || url.includes('placeholder') || !url.startsWith('https://')) {
        throw new Error('CRITICAL CONFIGURATION ERROR: REVIVEOS_PUBLIC_URL environment variable is required in production and must start with https://');
      }
    }
    return url || 'https://reviveos.app';
  }

  /**
   * Generates or retrieves an explainable recovery plan for a given opportunity
   */
  public static async getOrGeneratePlan(
    workspaceId: string,
    opportunityId: string
  ): Promise<CopilotRecoveryPlan> {
    const cacheKey = `${workspaceId}_${opportunityId}`;
    if (this.plans.has(cacheKey)) {
      return this.plans.get(cacheKey)!;
    }

    let opportunity: RecoveryOpportunity | undefined;
    let customer: Customer | undefined;
    let subscription: Subscription | undefined;
    let invoice: Invoice | undefined;
    let paymentFailure: PaymentFailure | undefined;

    if (isSupabaseAuthoritative()) {
      const opps = await supabaseService.getRecoveryOpportunities(workspaceId);
      opportunity = opps.find((o) => o.id === opportunityId);
      const customers = await supabaseService.getCustomers(workspaceId);
      const subscriptions = await supabaseService.getSubscriptions(workspaceId);
      const invoices = await supabaseService.getInvoices(workspaceId);
      const failures = await supabaseService.getPaymentFailures(workspaceId);

      customer = customers.find((c) => c.id === opportunity?.customer_id);
      subscription = subscriptions.find((s) => s.customer_id === customer?.id);
      invoice = invoices.find((i) => i.id === opportunity?.invoice?.id);
      paymentFailure = failures.find((f) => f.id === opportunity?.payment_failure_id);
    } else {
      const opps = db.getOpportunities(workspaceId);
      opportunity = opps.find((o) => o.id === opportunityId);
      const customers = db.getCustomers(workspaceId);
      const subscriptions = db.getSubscriptions(workspaceId);
      const invoices = db.getInvoices(workspaceId);
      const failures = db.getPaymentFailures(workspaceId);

      customer = customers.find((c) => c.id === opportunity?.customer_id) || opportunity?.customer;
      subscription = subscriptions.find((s) => s.customer_id === customer?.id);
      invoice = invoices.find((i) => i.id === opportunity?.invoice?.id);
      paymentFailure = failures.find((f) => f.id === opportunity?.payment_failure_id);
    }

    if (!opportunity) {
      const err: any = new Error(`Opportunity ${opportunityId} not found in workspace ${workspaceId}`);
      err.status = 404;
      throw err;
    }

    if (opportunity.workspace_id && opportunity.workspace_id !== workspaceId) {
      const err: any = new Error(`Unauthorized access to opportunity ${opportunityId}`);
      err.status = 403;
      throw err;
    }

    let previousActions: any[] = [];
    let previousOutcomes: any[] = [];
    if (isSupabaseAuthoritative()) {
      try {
        previousActions = await supabaseService.getOpportunityActions(workspaceId, opportunityId);
        previousOutcomes = await supabaseService.getOpportunityOutcomes(workspaceId, opportunityId);
      } catch (e) {
        previousActions = [];
        previousOutcomes = [];
      }
    } else {
      previousActions = db.getOpportunityActions(workspaceId, opportunityId);
      previousOutcomes = db.getOpportunityOutcomes(workspaceId, opportunityId);
    }

    const custName = customer?.name || opportunity.customer?.name;
    if (!custName) {
      throw new Error(`Opportunity ${opportunityId} missing required customer identity`);
    }
    const amountCents = opportunity.amount_at_risk_cents;
    if (typeof amountCents !== 'number') {
      throw new Error(`Opportunity ${opportunityId} missing required authoritative amount_at_risk_cents`);
    }
    const currency = opportunity.currency || customer?.currency || 'USD';
    const amountFormatted = `${currency} ${(amountCents / 100).toLocaleString()}`;

    const healthScore = customer?.health_score || (opportunity as any).health_score || 65;
    const recoveryLikelihood = (opportunity as any).recoveryLikelihoodScore || (opportunity as any).recovery_likelihood || 60;

    let strategyType: RecoveryStrategyType = 'failed_payment';
    const cat = (opportunity.failure_category as string) || '';
    if (cat === 'unpaid_invoice' || cat === 'overdue_invoice') {
      strategyType = 'overdue_invoice';
    } else if (cat === 'renewal_risk') {
      strategyType = 'renewal';
    } else if (cat === 'churn_risk') {
      strategyType = 'churn_intervention';
    } else if (cat === 'expansion_candidate') {
      strategyType = 'expansion';
    }

    const whyReasons: string[] = [];
    whyReasons.push(`Outstanding amount of ${amountFormatted} at risk.`);
    if (paymentFailure) {
      whyReasons.push(`Payment failed due to ${paymentFailure.provider_failure_code || 'gateway decline'}.`);
      whyReasons.push(`Failure occurred on ${new Date(paymentFailure.created_at).toLocaleDateString()}.`);
    } else if (invoice) {
      whyReasons.push(`Invoice status is ${invoice.status}, overdue since ${invoice.due_date || 'recent cycle'}.`);
    } else {
      whyReasons.push(`Customer subscription status is ${subscription?.status || 'active'}.`);
    }

    if (customer) {
      whyReasons.push(`Customer has completed ${customer.total_recovered_cents > 0 ? 'prior successful billing cycles' : 'initial onboarding'}.`);
      try {
        const expansionQueue = await ExpansionFinderEngine.evaluateWorkspace(workspaceId, { limit: 50 });
        const expansionRec = expansionQueue.queue.find(r => r.customerId === customer.id);
        if (expansionRec && (expansionRec.expansionTier === 'EXPANSION_READY' || expansionRec.expansionTier === 'GROWTH_SIGNAL')) {
          whyReasons.push(`Expansion Intelligence Signal (${expansionRec.expansionTier}): ${expansionRec.expansionSignal}`);
          if (expansionRec.explainableDrivers.length > 0) {
            whyReasons.push(`Expansion Drivers: ${expansionRec.explainableDrivers.join(' • ')}`);
          }
        }
      } catch (e) {}
    }

    if (previousActions.length > 0) {
      const failedCount = previousActions.filter(a => a.result_status === 'failed').length;
      whyReasons.push(`Action history indicates ${previousActions.length} recorded prior attempt(s) (${failedCount} failed). Previous outreach and recovery attempts informed this plan.`);
    }

    const historicalEvidence = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(workspaceId, cat);
    if (historicalEvidence.hasSufficientSample && historicalEvidence.evidenceStatements.length > 0) {
      whyReasons.push(...historicalEvidence.evidenceStatements);
    }

    const optimalChannel = await OutcomeLearningEngine.getOptimalChannel(workspaceId);
    const optimalSequence = await OutcomeLearningEngine.getOptimalSequence(workspaceId);

    if (optimalChannel.isOptimized) {
      whyReasons.push(`Outcome Optimization: ${optimalChannel.whatChanged}. Why: ${optimalChannel.reason} (Evidence: ${optimalChannel.evidence}, Sample size: ${optimalChannel.sampleSize}, Confidence: ${optimalChannel.confidenceScore}%).`);
    }
    if (optimalSequence.isOptimized) {
      whyReasons.push(`Sequence Optimization: ${optimalSequence.whatChanged}. Why: ${optimalSequence.reason} (Evidence: ${optimalSequence.evidence}, Sample size: ${optimalSequence.sampleSize}, Confidence: ${optimalSequence.confidenceScore}%).`);
    }

    const steps: CopilotStep[] = [];
    const isHardDecline = paymentFailure?.provider_failure_code === 'card_declined' || paymentFailure?.provider_failure_code === 'expired_card';

    if (strategyType === 'failed_payment') {
      if (optimalSequence.isOptimized && optimalSequence.sequence.length > 0) {
        // Build sequence from statistically winning sequence
        optimalSequence.sequence.forEach((actType) => {
          if (actType === 'payment_retry' && isHardDecline) {
            return; // Skip payment retry on hard decline
          }
          const label = actType === 'payment_retry'
            ? 'Execute Automated Payment Retry'
            : actType === 'send_sms'
            ? 'Send Instant SMS Recovery Notification'
            : actType === 'send_hosted_link'
            ? 'Send Secure Hosted Recovery Link'
            : actType === 'operator_escalation'
            ? 'Escalate to Customer Success / VIP Concierge'
            : `Execute ${actType.replace(/_/g, ' ')}`;

          const reason = actType === 'payment_retry'
            ? 'Automated retry mapped from historically winning recovery sequence.'
            : actType === 'send_sms'
            ? `High-conversion SMS outreach prioritized from sequence performance data (${optimalSequence.evidence}).`
            : actType === 'send_hosted_link'
            ? 'Provides secure PCI-compliant 1-click update portal for card renewal or alternative payment.'
            : actType === 'operator_escalation'
            ? 'Ensures high-value account does not churn due to prolonged dunning grace expiry.'
            : `Step dynamically generated from top performing sequence (${optimalSequence.evidence}).`;

          steps.push({
            id: `step_${opportunityId}_${steps.length + 1}`,
            planId: `plan_${opportunityId}`,
            stepNumber: steps.length + 1,
            actionType: actType,
            actionLabel: label,
            reason,
            timing: steps.length === 0 ? 'Immediate' : 'Next sequence step',
            expectedPurpose: 'Sequence progression driven by historical recovery outcome data.',
            state: 'recommended',
            isRetryable: actType !== 'operator_escalation',
            requiresHumanApproval: actType === 'send_hosted_link' || actType === 'operator_escalation',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
      } else {
        // If SMS outperforms Email with statistically valid evidence, prioritize SMS first!
        if (optimalChannel.isOptimized && optimalChannel.channel === 'sms') {
          steps.push({
            id: `step_${opportunityId}_sms_1`,
            planId: `plan_${opportunityId}`,
            stepNumber: 1,
            actionType: 'send_sms',
            actionLabel: 'Send Prioritized SMS Recovery Notification',
            reason: `SMS outreach prioritized first over Email based on historical outcome data: ${optimalChannel.evidence} (Sample size: ${optimalChannel.sampleSize}, Confidence: ${optimalChannel.confidenceScore}%).`,
            timing: 'Immediate',
            expectedPurpose: 'Reach customer immediately via top-performing SMS recovery channel.',
            state: 'recommended',
            isRetryable: true,
            requiresHumanApproval: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        if (!isHardDecline) {
          const retryEnhanced = RecoveryEffectivenessEngine.enhanceRecommendation(
            workspaceId,
            'retry_payment',
            'Execute Automated Payment Retry',
            cat
          );

          steps.push({
            id: `step_${opportunityId}_${steps.length + 1}`,
            planId: `plan_${opportunityId}`,
            stepNumber: steps.length + 1,
            actionType: 'payment_retry',
            actionLabel: retryEnhanced.enhancedLabel,
            reason: retryEnhanced.hasEvidence
              ? `Recommended based on real outcomes: ${retryEnhanced.evidence}.`
              : 'Failure is soft/temporary decline; automated retry has high probability of settlement.',
            timing: steps.length === 0 ? 'Immediate' : 'If unrecovered / parallel execution',
            expectedPurpose: 'Recover funds without customer friction.',
            state: 'recommended',
            isRetryable: true,
            requiresHumanApproval: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        const linkEnhanced = RecoveryEffectivenessEngine.enhanceRecommendation(
          workspaceId,
          'payment_link',
          'Send Secure Hosted Recovery Link',
          cat
        );

        steps.push({
          id: `step_${opportunityId}_${steps.length + 1}`,
          planId: `plan_${opportunityId}`,
          stepNumber: steps.length + 1,
          actionType: 'send_hosted_link',
          actionLabel: linkEnhanced.enhancedLabel,
          reason: linkEnhanced.hasEvidence
            ? `Recommended based on real outcomes: ${linkEnhanced.evidence}.`
            : 'Provides secure PCI-compliant 1-click update portal for card renewal or alternative payment.',
          timing: isHardDecline ? 'Immediate' : 'If retry unsuccessful (24h)',
          expectedPurpose: 'Allow customer to update payment instrument securely.',
          state: 'recommended',
          isRetryable: true,
          requiresHumanApproval: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        steps.push({
          id: `step_${opportunityId}_${steps.length + 1}`,
          planId: `plan_${opportunityId}`,
          stepNumber: steps.length + 1,
          actionType: 'operator_escalation',
          actionLabel: 'Escalate to Customer Success / VIP Concierge',
          reason: 'Ensures high-value account does not churn due to prolonged dunning grace expiry.',
          timing: 'After 7 days unresolved',
          expectedPurpose: 'Direct human intervention and account retention outreach.',
          state: 'recommended',
          isRetryable: false,
          requiresHumanApproval: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      steps.push({
        id: `step_${opportunityId}_1`,
        planId: `plan_${opportunityId}`,
        stepNumber: 1,
        actionType: 'send_invoice_reminder',
        actionLabel: 'Dispatch Overdue Invoice Reminder Email',
        reason: 'Formal notification with secure payment link for pending invoice.',
        timing: 'Immediate',
        expectedPurpose: 'Prompt accounts payable review.',
        state: 'recommended',
        isRetryable: true,
        requiresHumanApproval: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const riskLevel: 'Low' | 'Medium' | 'High' = healthScore < 40 || previousActions.filter(a => a.result_status === 'failed').length >= 2 ? 'High' : healthScore < 70 ? 'Medium' : 'Low';
    const confidenceLevel: 'Low' | 'Medium' | 'High' = recoveryLikelihood >= 70 && healthScore >= 70 ? 'High' : recoveryLikelihood >= 40 ? 'Medium' : 'Low';

    let recommendedActionSummary = `Prioritizing ${steps[0]?.actionLabel || 'recommended action'} based on customer health score (${healthScore}), failure category (${cat || 'payment_failure'}), and action history.`;
    if (optimalChannel.isOptimized) {
      recommendedActionSummary += ` Channel optimization active: ${optimalChannel.whatChanged} (${optimalChannel.reason}).`;
    }
    if (optimalSequence.isOptimized) {
      recommendedActionSummary += ` Sequence optimization active: ${optimalSequence.whatChanged} (${optimalSequence.reason}).`;
    }

    const plan: CopilotRecoveryPlan = {
      id: `plan_${opportunityId}`,
      workspaceId,
      opportunityId,
      strategyType,
      goal: `Recover ${amountFormatted} and preserve ${custName} subscription`,
      why: whyReasons,
      recommendedSteps: steps,
      expectedResult: `Increase probability of recovery while avoiding unnecessary repeated retries and maintaining strong customer relationship.`,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recoverySummary: `Explainable evidence-based recovery plan for ${custName} targeting ${amountFormatted} under ${strategyType} strategy.`,
      whyThisMatters: whyReasons,
      recommendedActionSummary,
      alternativeActionsConsidered: [
        {
          actionType: 'send_email',
          actionLabel: 'Direct Email Outreach Only',
          reasonNotSelected: previousActions.some(a => a.action_type === 'send_email') ? 'Previous email outreach attempts were unsuccessful; secure hosted link or automated retry produces higher conversion.' : 'Direct email alone lacks interactive 1-click payment update instrument.',
        },
        {
          actionType: 'operator_escalation',
          actionLabel: 'Immediate VIP Escalation',
          reasonNotSelected: 'Reserved for final retry exhaustion or high-value accounts past dunning grace period.',
        }
      ],
      timingRecommendation: {
        timing: isHardDecline ? 'Immediate execution required' : 'Retry within 24 hours / upon current workflow completion',
        explanation: isHardDecline ? 'Card expired or hard decline requires immediate customer instrument update.' : 'Timing optimized for banking business hours and customer engagement window.',
      },
      riskAssessment: {
        level: riskLevel,
        explanation: riskLevel === 'High' ? 'Repeated failed retries, customer inactivity, or poor health score elevate recovery risk.' : riskLevel === 'Medium' ? 'Moderate risk due to pending billing failure and dunning grace period.' : 'Customer health is stable with low risk of immediate churn.',
      },
      confidenceExplanation: {
        level: confidenceLevel,
        explanation: `Confidence level is ${confidenceLevel} based on customer health score (${healthScore}), recovery likelihood score (${recoveryLikelihood}%), and subscription status.`,
      },
      relevantHistoricalOutcomes: {
        successPatterns: previousOutcomes.filter(o => o.outcome === 'recovered').length > 0
          ? ['Previous successful recovery patterns recorded for similar accounts using secure hosted portal and smart retry.']
          : ['No prior recovery outcomes recorded yet for this opportunity; leveraging global benchmark success patterns.'],
        failurePatterns: previousActions.filter(a => a.result_status === 'failed').map(a => `Previous ${a.action_type} attempt resulted in failure.`),
        nextBestAction: steps[0]?.actionLabel || 'Execute recommended action sequence',
      },
      expectedRecoveryValueExplanation: `Expected recovery value of ${amountFormatted} based on authoritative invoice amount at risk.`,
      approvalStatus: 'pending_approval',
      planVersion: 1.0,
      historicalEvidence,
    };

    this.plans.set(cacheKey, plan);
    return plan;
  }

  public static async approvePlan(
    workspaceId: string,
    opportunityId: string,
    approverId: string
  ): Promise<CopilotRecoveryPlan> {
    const plan = await this.getOrGeneratePlan(workspaceId, opportunityId);

    if (plan.approvalStatus === 'approved') {
      const err: any = new Error('Plan is already approved. Duplicate approval is prevented.');
      err.status = 400;
      throw err;
    }

    if (plan.approvalStatus === 'rejected' || plan.approvalStatus === 'completed') {
      const err: any = new Error(`Cannot approve plan in ${plan.approvalStatus} state`);
      err.status = 400;
      throw err;
    }

    plan.approvalStatus = 'approved';
    plan.approvedBy = approverId;
    plan.approvedAt = new Date().toISOString();
    plan.planVersion = (typeof plan.planVersion === 'number' ? plan.planVersion : 1.0);
    plan.updatedAt = new Date().toISOString();

    const cacheKey = `${workspaceId}_${opportunityId}`;
    this.plans.set(cacheKey, plan);

    const log: CopilotExecutionLog = {
      id: `log_appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspaceId,
      opportunityId,
      stepId: 'plan_approval',
      actionType: 'approve_plan',
      stateBefore: 'pending_approval' as any,
      stateAfter: 'approved' as any,
      executedBy: approverId,
      resultStatus: 'success',
      executedAt: new Date().toISOString(),
    };
    this.memoryExecutionLogs.push(log);
    if (isSupabaseAuthoritative()) {
      try {
        await supabaseService.recordCopilotExecutionLog({
          id: log.id,
          workspace_id: log.workspaceId,
          opportunity_id: log.opportunityId,
          step_id: log.stepId,
          action_type: log.actionType,
          state_before: log.stateBefore,
          state_after: log.stateAfter,
          executed_by: log.executedBy,
          result_status: log.resultStatus,
          executed_at: log.executedAt,
        });
      } catch (e) {}
    }

    return plan;
  }

  public static async rejectPlan(
    workspaceId: string,
    opportunityId: string,
    rejecterId: string,
    reason?: string
  ): Promise<CopilotRecoveryPlan> {
    const plan = await this.getOrGeneratePlan(workspaceId, opportunityId);

    plan.approvalStatus = 'rejected';
    plan.rejectedReason = reason || 'Rejected by operator';
    plan.updatedAt = new Date().toISOString();

    const cacheKey = `${workspaceId}_${opportunityId}`;
    this.plans.set(cacheKey, plan);

    const log: CopilotExecutionLog = {
      id: `log_rej_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspaceId,
      opportunityId,
      stepId: 'plan_rejection',
      actionType: 'reject_plan',
      stateBefore: 'pending_approval' as any,
      stateAfter: 'rejected' as any,
      executedBy: rejecterId,
      failureReason: reason,
      resultStatus: 'success',
      executedAt: new Date().toISOString(),
    };
    this.memoryExecutionLogs.push(log);
    if (isSupabaseAuthoritative()) {
      try {
        await supabaseService.recordCopilotExecutionLog({
          id: log.id,
          workspace_id: log.workspaceId,
          opportunity_id: log.opportunityId,
          step_id: log.stepId,
          action_type: log.actionType,
          state_before: log.stateBefore,
          state_after: log.stateAfter,
          executed_by: log.executedBy,
          failure_reason: log.failureReason,
          result_status: log.resultStatus,
          executed_at: log.executedAt,
        });
      } catch (e) {}
    }

    return plan;
  }

  private static async logEvent(
    workspaceId: string,
    opportunityId: string,
    stepId: string,
    actionType: string,
    operatorId: string,
    message?: string,
    resultStatus: 'success' | 'failed' = 'success'
  ): Promise<void> {
    const log: CopilotExecutionLog = {
      id: `log_wf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspaceId,
      opportunityId,
      stepId,
      actionType,
      stateBefore: 'pending' as any,
      stateAfter: 'completed' as any,
      executedBy: operatorId,
      resultStatus,
      failureReason: resultStatus === 'failed' ? message : undefined,
      executedAt: new Date().toISOString(),
    };
    this.memoryExecutionLogs.push(log);
    if (isSupabaseAuthoritative()) {
      try {
        await supabaseService.recordCopilotExecutionLog({
          id: log.id,
          workspace_id: log.workspaceId,
          opportunity_id: log.opportunityId,
          step_id: log.stepId,
          action_type: log.actionType,
          state_before: log.stateBefore,
          state_after: log.stateAfter,
          executed_by: log.executedBy,
          result_status: log.resultStatus,
          failure_reason: log.failureReason,
          executed_at: log.executedAt,
        });
      } catch (e) {}
    }
  }

  private static async executeSingleStepInternal(
    workspaceId: string,
    opportunityId: string,
    step: CopilotStep,
    operatorId: string
  ): Promise<{ success: boolean; message: string; providerReference?: string }> {
    const previousState = step.state;
    step.state = 'executing';
    step.updatedAt = new Date().toISOString();

    let success = true;
    let message = `Successfully executed step: ${step.actionLabel}`;
    let providerReference: string | undefined;

    try {
      if (step.actionType === 'payment_retry') {
        let res: { success: boolean; message: string; paymentId?: string };
        if (isSupabaseAuthoritative()) {
          const opp = await supabaseService.getRecoveryOpportunityById(workspaceId, opportunityId);
          if (!opp) {
            throw new Error('Opportunity not found');
          }
          const providerType = (opp as any).provider_type || 'stripe';
          const decrypted = (await supabaseService.getDecryptedProviderCredentials(workspaceId, providerType)) as any;
          const credentials = decrypted
            ? {
                apiKey: decrypted.apiKey || decrypted.key_id || decrypted.publishable_key,
                apiSecret: decrypted.apiSecret || decrypted.key_secret || decrypted.secret_key,
                webhookSecret: decrypted.webhookSecret || decrypted.webhook_secret,
              }
            : undefined;

          const adapter = PaymentProviderFactory.getAdapter(providerType);
          const invoiceId = (opp.invoice as any)?.provider_invoice_id || (opp as any).invoice_id || opp.id;
          const retryResult = await adapter.retryPayment(workspaceId, invoiceId, undefined, credentials);

          if (retryResult.success && retryResult.isRecovered) {
            if (!retryResult.paymentId || typeof retryResult.paymentId !== 'string' || !retryResult.paymentId.trim()) {
              throw new Error('Payment retry succeeded according to provider, but no authentic provider payment ID was returned.');
            }
            await supabaseService.settleRecoveryPayment(workspaceId, opp.id, {
              amountCents: opp.amount_at_risk_cents,
              providerPaymentId: retryResult.paymentId,
              method: 'smart_retry_automated',
            });
            res = { success: true, message: 'Authoritative payment retry succeeded and settled.', paymentId: retryResult.paymentId };
          } else {
            res = { success: false, message: retryResult.failureMessage || 'Payment retry declined by gateway' };
          }
        } else {
          res = await db.triggerSmartRetry(opportunityId, workspaceId);
        }

        if (res.success) {
          step.state = 'completed';
          message = res.message || 'Payment retry succeeded';
          providerReference = res.paymentId || `retry_success_${Date.now()}`;
        } else {
          step.state = 'failed';
          success = false;
          message = res.message || 'Payment retry declined by gateway';
        }
      } else if (step.actionType === 'send_hosted_link' || step.actionType === 'send_invoice_reminder') {
        const opp = isSupabaseAuthoritative()
          ? await supabaseService.getRecoveryOpportunityById(workspaceId, opportunityId)
          : db.getOpportunityById(opportunityId, workspaceId);

        if (!opp) {
          throw new Error('Opportunity not found for dispatch');
        }

        const customerEmail = opp.customer?.email;
        if (!customerEmail || !customerEmail.includes('@') || customerEmail.includes('local')) {
          step.state = 'failed';
          success = false;
          message = 'Customer email missing or invalid. Cannot dispatch recovery notification to local/unroutable address.';
          throw new Error(message);
        }

        const token = opp.recovery_token;
        if (!token) {
          throw new Error(`Opportunity ${opportunityId} missing required recovery token; cannot generate secure recovery link`);
        }
        const customerName = opp.customer?.name;
        if (!customerName) {
          throw new Error(`Opportunity ${opportunityId} missing required customer identity`);
        }
        const invoiceId = opp.invoice?.provider_invoice_id;
        if (!invoiceId) {
          throw new Error(`Opportunity ${opportunityId} missing required invoice ID`);
        }

        const publicUrl = this.getPublicUrl();
        const recoveryUrl = `${publicUrl}/pay/${token}`;
        const emailResult = await EmailService.sendRecoveryEmail({
          workspaceId,
          opportunityId,
          toEmail: customerEmail,
          subjectTemplate: 'Action Required: Secure Recovery Link for {{customer_name}}',
          bodyTemplate: 'Hello {{customer_name}},\n\nPlease complete secure recovery for {{amount_due}} {{currency}} via:\n{{payment_link}}\n\nThank you,\n{{business_name}}',
          variables: {
            customer_name: customerName,
            business_name: 'ReviveOS',
            amount_due: (opp.amount_at_risk_cents / 100).toFixed(2),
            currency: opp.currency || 'USD',
            invoice_id: invoiceId,
            payment_date: new Date().toLocaleDateString(),
            payment_link: recoveryUrl,
            subscription_name: opp.subscription?.plan_name || 'Subscription',
          },
        });

        if (emailResult.status === 'sent') {
          step.state = 'completed';
          message = `Secure recovery link successfully dispatched to ${customerEmail}.`;
          providerReference = emailResult.id;
        } else {
          step.state = 'failed';
          success = false;
          message = 'Failed to dispatch email via configured provider';
        }
      } else if (step.actionType === 'send_sms') {
        const opp = isSupabaseAuthoritative()
          ? await supabaseService.getRecoveryOpportunityById(workspaceId, opportunityId)
          : db.getOpportunityById(opportunityId, workspaceId);

        if (!opp) {
          throw new Error('Opportunity not found for SMS dispatch');
        }

        const customerPhone = opp.customer?.phone || '+15550192834';
        const token = opp.recovery_token;
        const publicUrl = this.getPublicUrl();
        const recoveryUrl = token ? `${publicUrl}/pay/${token}` : publicUrl;
        const adapter = DispatchAdapterRegistry.get('sms');

        const result = await adapter.send({
          workspaceId,
          workflowId: `copilot_${opportunityId}`,
          opportunityId,
          customerId: opp.customer_id,
          customerName: opp.customer?.name || 'Customer',
          recipient: customerPhone,
          recoveryLinkUrl: recoveryUrl,
          amountCents: opp.amount_at_risk_cents || 0,
          currency: opp.currency || 'USD',
          messageText: `ReviveOS Billing Alert: Please update your payment instrument safely via: ${recoveryUrl}`,
        });

        if (result.success) {
          step.state = 'completed';
          message = `SMS recovery notification successfully dispatched to ${customerPhone}.`;
          providerReference = result.externalMessageId;
        } else {
          step.state = 'failed';
          success = false;
          message = result.error || 'Failed to dispatch SMS';
        }
      } else if (step.actionType === 'operator_escalation') {
        if (isSupabaseAuthoritative()) {
          await supabaseService.escalateRecoveryOpportunity(workspaceId, opportunityId, 'Copilot executive concierge escalation');
        } else {
          db.escalateRecovery(opportunityId, 'Copilot executive concierge escalation', workspaceId);
        }
        step.state = 'completed';
        message = 'Case successfully escalated to executive concierge and audit log recorded.';
        providerReference = `esc_${Date.now()}`;
      } else {
        step.state = 'completed';
        message = `Action sequence recorded successfully.`;
      }
    } catch (err: any) {
      step.state = 'failed';
      success = false;
      message = err.message || 'Execution failed';
    }

    step.resultReference = providerReference;
    step.updatedAt = new Date().toISOString();

    const log: CopilotExecutionLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspaceId,
      opportunityId,
      stepId: step.id,
      actionType: step.actionType,
      stateBefore: previousState,
      stateAfter: step.state,
      executedBy: operatorId,
      providerReference,
      resultStatus: success ? 'success' : 'failed',
      failureReason: success ? undefined : message,
      executedAt: new Date().toISOString(),
    };

    this.memoryExecutionLogs.push(log);
    if (isSupabaseAuthoritative()) {
      await supabaseService.recordCopilotExecutionLog({
        id: log.id,
        workspace_id: log.workspaceId,
        opportunity_id: log.opportunityId,
        step_id: log.stepId,
        action_type: log.actionType,
        state_before: log.stateBefore,
        state_after: log.stateAfter,
        executed_by: log.executedBy,
        provider_reference: log.providerReference,
        result_status: log.resultStatus,
        failure_reason: log.failureReason,
        executed_at: log.executedAt,
      });
    }

    return { success, message, providerReference };
  }

  /**
   * Executes a specific step in the recovery plan with real authoritative operations
   */
  public static async executeStep(
    workspaceId: string,
    opportunityId: string,
    stepId: string,
    operatorId: string = 'system_copilot'
  ): Promise<{ success: boolean; message: string; step: CopilotStep; plan: CopilotRecoveryPlan }> {
    const cacheKey = `${workspaceId}_${opportunityId}`;
    const plan = await this.getOrGeneratePlan(workspaceId, opportunityId);

    if (plan.approvalStatus !== 'approved') {
      const err: any = new Error('Execution safety error: Plan must be explicitly approved by an authorized operator before execution.');
      err.status = 400;
      throw err;
    }

    const step = plan.recommendedSteps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in plan for opportunity ${opportunityId}`);
    }

    const res = await this.executeSingleStepInternal(workspaceId, opportunityId, step, operatorId);
    plan.approvalStatus = res.success ? 'completed' : 'failed';
    plan.status = res.success ? 'completed' : 'failed';
    plan.updatedAt = new Date().toISOString();
    this.plans.set(cacheKey, plan);

    return { success: res.success, message: res.message, step, plan };
  }

  /**
   * Executes the sequential recovery workflow for an approved plan
   */
  public static async executeWorkflow(
    workspaceId: string,
    opportunityId: string,
    operatorId: string = 'system_copilot'
  ): Promise<{ success: boolean; outcome: string; message: string; plan: CopilotRecoveryPlan }> {
    const cacheKey = `${workspaceId}_${opportunityId}`;
    const plan = await this.getOrGeneratePlan(workspaceId, opportunityId);

    if (plan.approvalStatus !== 'approved') {
      const err: any = new Error('Execution safety error: Workflow cannot start without explicit operator approval.');
      err.status = 400;
      throw err;
    }

    if (plan.workflowStatus === 'executing') {
      const err: any = new Error('Duplicate execution prevention: Workflow is already executing.');
      err.status = 400;
      throw err;
    }

    if (plan.workflowStatus === 'success') {
      const err: any = new Error('Duplicate execution prevention: Workflow has already successfully completed.');
      err.status = 400;
      throw err;
    }

    plan.workflowStatus = 'executing';
    plan.approvalStatus = 'executing';
    plan.updatedAt = new Date().toISOString();
    this.plans.set(cacheKey, plan);

    await this.logEvent(workspaceId, opportunityId, 'workflow_started', 'workflow_started', operatorId, 'Workflow execution initiated');

    let completedCount = 0;
    let failedCount = 0;
    const steps = plan.recommendedSteps || [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      plan.currentStepIndex = i;

      if (step.state === 'completed' || step.state === 'succeeded' || step.state === 'skipped') {
        completedCount++;
        continue;
      }

      await this.logEvent(workspaceId, opportunityId, step.id, 'step_executed', operatorId, `Executing step ${step.stepNumber}: ${step.actionLabel}`);

      const stepRes = await this.executeSingleStepInternal(workspaceId, opportunityId, step, operatorId);
      if (stepRes.success) {
        completedCount++;
        await this.logEvent(workspaceId, opportunityId, step.id, 'step_completed', operatorId, `Step ${step.stepNumber} succeeded`);
      } else {
        failedCount++;
        await this.logEvent(workspaceId, opportunityId, step.id, 'step_failed', operatorId, stepRes.message || 'Step execution failed', 'failed');
        if (!step.isRetryable) {
          break;
        }
      }
    }

    let outcome: 'success' | 'partial_success' | 'failed' = 'success';
    if (failedCount > 0 && completedCount > 0) {
      outcome = 'partial_success';
    } else if (failedCount > 0 && completedCount === 0) {
      outcome = 'failed';
    } else if (completedCount === 0 && steps.length === 0) {
      outcome = 'failed';
    }

    plan.workflowStatus = outcome === 'failed' ? 'failed' : outcome;
    plan.workflowOutcome = outcome;
    plan.approvalStatus = outcome === 'failed' ? 'failed' : 'completed';
    plan.status = outcome === 'failed' ? 'failed' : 'completed';
    plan.updatedAt = new Date().toISOString();
    this.plans.set(cacheKey, plan);

    // Record automatic outcome
    const opp = isSupabaseAuthoritative()
      ? await supabaseService.getRecoveryOpportunityById(workspaceId, opportunityId)
      : db.getOpportunityById(opportunityId, workspaceId);

    if (opp) {
      const recoveredAmount = outcome === 'success' ? opp.amount_at_risk_cents : outcome === 'partial_success' ? Math.round(opp.amount_at_risk_cents / 2) : 0;
      const outcomeRecord = {
        id: `out_wf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        workspace_id: workspaceId,
        opportunity_id: opportunityId,
        outcome: outcome === 'failed' ? 'unrecoverable' : outcome === 'partial_success' ? 'partial_recovery' : 'recovered',
        recovered_amount_cents: recoveredAmount,
        resolved_at: new Date().toISOString(),
        feedback_notes: `Workflow finished with outcome: ${outcome} (${completedCount} completed, ${failedCount} failed)`,
      };

      if (isSupabaseAuthoritative()) {
        try {
          await supabaseService.recordOpportunityOutcome(outcomeRecord);
        } catch (e) {}
      } else {
        db.recordOpportunityOutcome({
          id: outcomeRecord.id,
          workspaceId: outcomeRecord.workspace_id,
          opportunityId: outcomeRecord.opportunity_id,
          outcome: outcomeRecord.outcome as any,
          recoveredAmountCents: outcomeRecord.recovered_amount_cents,
          resolvedAt: outcomeRecord.resolved_at,
          feedbackNotes: outcomeRecord.feedback_notes,
        });
      }
    }

    await this.logEvent(workspaceId, opportunityId, 'workflow_completed', 'workflow_completed', operatorId, `Workflow completed with outcome: ${outcome}`, outcome === 'failed' ? 'failed' : 'success');

    return {
      success: outcome !== 'failed',
      outcome,
      message: `Workflow finished with outcome ${outcome}. Completed: ${completedCount}, Failed: ${failedCount}`,
      plan,
    };
  }

  public static getExecutionLogsInMemory(workspaceId: string): CopilotExecutionLog[] {
    return this.memoryExecutionLogs.filter((l) => l.workspaceId === workspaceId);
  }

  public static async getExecutionLogs(workspaceId: string, opportunityId: string): Promise<CopilotExecutionLog[]> {
    if (isSupabaseAuthoritative()) {
      try {
        return await supabaseService.getCopilotExecutionLogs(workspaceId, opportunityId);
      } catch (err: any) {
        throw new Error(`Authoritative Copilot log read failed: ${err?.message || err}`);
      }
    }
    return this.memoryExecutionLogs.filter(
      (l) => l.workspaceId === workspaceId && l.opportunityId === opportunityId
    );
  }
}
