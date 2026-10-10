import { db } from '../store/db.js';
import { AutopilotPolicyEngine } from './autopilotPolicyEngine.js';
import { AutopilotService } from './autopilotService.js';
import { OutcomeLearningEngine } from '../learning/outcomeLearningEngine.js';
import {
  AutonomousRecoveryMetrics,
  AutonomousRecoveryWorkflow,
  AutonomousRetrySchedule,
  RecoveryOpportunity,
} from '../../src/types/index.js';

export class AutonomousRecoveryEngine {
  /**
   * Evaluates an opportunity and, if classified as AUTONOMOUS, safely launches
   * automated recovery workflows (smart retry schedules & link delivery preparation).
   * Manual Review and Blocked opportunities remain untouched.
   */
  public static async processOpportunity(
    workspaceId: string,
    opportunityId: string
  ): Promise<{
    executed: boolean;
    workflow?: AutonomousRecoveryWorkflow;
    reason: string;
  }> {
    if (!workspaceId) throw new Error('workspaceId is required');
    if (!opportunityId) throw new Error('opportunityId is required');

    const opportunity = db.getOpportunityById(opportunityId, workspaceId);
    if (!opportunity) {
      return { executed: false, reason: `Opportunity ${opportunityId} not found` };
    }

    const customer = db.getCustomerById(opportunity.customer_id, workspaceId) || opportunity.customer;
    const workspace = db.getWorkspace(workspaceId);
    const settings = AutopilotService.getSettings(workspaceId);

    // 1. Safety Guard: Pause All Automation master switch
    if (settings.pause_all_automation) {
      return {
        executed: false,
        reason: 'Autonomous execution halted: Pause All Automation switch is active.',
      };
    }

    // 2. Safety Guard: Policy Arbitration Check
    const policyResult = AutopilotPolicyEngine.evaluate(opportunity, customer, workspace, settings);
    opportunity.policy_decision = policyResult;

    // Only AUTONOMOUS opportunities may enter automated execution!
    if (policyResult.decision !== 'AUTONOMOUS') {
      return {
        executed: false,
        reason: `Automated recovery bypassed: Policy decision is ${policyResult.decision} (${policyResult.reason}).`,
      };
    }

    // 3. Safety Guard: Idempotency & Deduplication
    const existingWorkflow = db.getAutonomousWorkflowByOpportunityId(workspaceId, opportunityId);
    if (existingWorkflow) {
      return {
        executed: false,
        workflow: existingWorkflow,
        reason: 'Recovery workflow already created for this opportunity.',
      };
    }

    // 4. Ensure Secure 1-Click Recovery Payment Link Exists
    const linkInfo = AutopilotService.ensureOpportunityRecoveryLink(workspaceId, opportunity);
    const amountCents = opportunity.amount_at_risk_cents || 0;
    const currency = opportunity.currency || 'USD';
    const customerName = customer?.name || 'Valued Customer';
    const now = new Date();
    const nowIso = now.toISOString();

    const workflowId = `wf_auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 5. Build Retry Schedules with Closed-Loop Timing Optimization
    // Cadence dynamically adapts if empirical outcomes prove superior timing
    const optimalTiming = await OutcomeLearningEngine.getOptimalRetrySchedule(workspaceId);
    let retryIntervalsDays = [1, 3, 5];
    if (optimalTiming.isOptimized && Array.isArray(optimalTiming.intervalsDays) && optimalTiming.intervalsDays.length > 0) {
      // Guardrail: Ensure intervals are positive integers, max 3 attempts
      const valid = optimalTiming.intervalsDays
        .filter(d => typeof d === 'number' && d > 0)
        .slice(0, 3);
      if (valid.length > 0) {
        retryIntervalsDays = valid;
      }
    }

    const retrySchedules: AutonomousRetrySchedule[] = [];

    for (let i = 0; i < retryIntervalsDays.length; i++) {
      const dayOffset = retryIntervalsDays[i];
      const scheduledDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);

      const schedule: AutonomousRetrySchedule = {
        id: `ret_${workflowId}_att_${i + 1}`,
        workspace_id: workspaceId,
        workflow_id: workflowId,
        opportunity_id: opportunity.id,
        customer_id: opportunity.customer_id,
        attempt_number: i + 1,
        scheduled_for: scheduledDate.toISOString(),
        status: 'pending',
        amount_cents: amountCents,
        currency,
        created_at: nowIso,
      };

      db.createAutonomousRetrySchedule(schedule);
      retrySchedules.push(schedule);
    }

    // 6. Recovery Link Delivery Preparation with Closed-Loop Channel Optimization
    const optimalChannel = await OutcomeLearningEngine.getOptimalChannel(workspaceId);
    const deliveryChannel = (optimalChannel.isOptimized ? optimalChannel.channel : 'email') as any;

    const formattedAmount = `$${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
    const deliveryPreparation = {
      status: 'ready' as const,
      recovery_link_url: linkInfo.link,
      message_subject: `Action Required: Update billing details for ${workspace?.name || 'your account'}`,
      message_preview: `Your recent payment of ${formattedAmount} could not be processed. Please use your secure link to keep your service active without interruption.`,
      delivery_channel: deliveryChannel,
      prepared_at: nowIso,
    };

    // 7. Assemble Timeline with Full Explainability
    const cadenceDesc = retryIntervalsDays.join(', ') === '1, 3, 5'
      ? 'Day 1, Day 3, and Day 5'
      : `Days [${retryIntervalsDays.join(', ')}]`;

    const timeline = [
      {
        id: `tl_init_${Date.now()}`,
        action: 'Autonomous Recovery Initialized',
        timestamp: nowIso,
        status: 'scheduled',
        details: `Policy Engine approved AUTONOMOUS recovery. Scheduled ${retrySchedules.length} payment retries for ${cadenceDesc}. Prepared recovery link payload via ${deliveryChannel.toUpperCase()}.`,
      },
    ];

    if (optimalTiming.isOptimized) {
      timeline.push({
        id: `tl_timing_opt_${Date.now()}`,
        action: 'Retry Schedule Cadence Optimized',
        timestamp: nowIso,
        status: 'scheduled',
        details: `Retry schedule adapted from default [1, 3, 5] to Days [${retryIntervalsDays.join(', ')}]. What changed: ${optimalTiming.whatChanged}. Why: ${optimalTiming.reason}. Evidence: ${optimalTiming.evidence} (Sample size: ${optimalTiming.sampleSize}, Confidence: ${optimalTiming.confidenceScore}%).`,
      });
    }

    if (optimalChannel.isOptimized) {
      timeline.push({
        id: `tl_chan_opt_${Date.now()}`,
        action: 'Delivery Channel Optimized',
        timestamp: nowIso,
        status: 'scheduled',
        details: `Delivery channel dynamically adapted from default EMAIL to ${deliveryChannel.toUpperCase()}. What changed: ${optimalChannel.whatChanged}. Why: ${optimalChannel.reason}. Evidence: ${optimalChannel.evidence} (Sample size: ${optimalChannel.sampleSize}, Confidence: ${optimalChannel.confidenceScore}%).`,
      });
    }

    // 8. Assemble Workflow Record
    const workflow: AutonomousRecoveryWorkflow = {
      id: workflowId,
      workspace_id: workspaceId,
      opportunity_id: opportunity.id,
      customer_id: opportunity.customer_id,
      customer_name: customerName,
      customer_email: customer?.email,
      state: 'scheduled',
      outcome: 'pending',
      amount_at_risk_cents: amountCents,
      currency,
      policy_decision: 'AUTONOMOUS',
      delivery_preparation: deliveryPreparation,
      retry_schedules: retrySchedules,
      timeline,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const createdWorkflow = db.createAutonomousWorkflow(workflow);

    // Record high-level Automation Event
    db.recordAutomationEvent(workspaceId, {
      event: 'Autonomous Recovery Scheduled',
      trigger: 'Policy Engine Approval',
      status: 'completed',
      details: {
        workflow_id: createdWorkflow.id,
        opportunity_id: opportunity.id,
        amount_cents: amountCents,
        retries_scheduled: retrySchedules.length,
        retry_cadence: `Days [${retryIntervalsDays.join(', ')}]`,
        delivery_channel: deliveryChannel,
        is_retry_optimized: optimalTiming.isOptimized,
        retry_optimization: optimalTiming.isOptimized ? {
          whatChanged: optimalTiming.whatChanged,
          whyChanged: optimalTiming.reason,
          evidence: optimalTiming.evidence,
          sampleSize: optimalTiming.sampleSize,
          confidenceScore: optimalTiming.confidenceScore,
        } : undefined,
        is_channel_optimized: optimalChannel.isOptimized,
        channel_optimization: optimalChannel.isOptimized ? {
          whatChanged: optimalChannel.whatChanged,
          whyChanged: optimalChannel.reason,
          evidence: optimalChannel.evidence,
          sampleSize: optimalChannel.sampleSize,
          confidenceScore: optimalChannel.confidenceScore,
        } : undefined,
      },
    });

    return {
      executed: true,
      workflow: createdWorkflow,
      reason: 'Autonomous recovery workflow scheduled successfully.',
    };
  }

  public static getWorkflows(workspaceId: string): AutonomousRecoveryWorkflow[] {
    return db.getAutonomousWorkflows(workspaceId);
  }

  public static getWorkflowById(
    workspaceId: string,
    id: string
  ): AutonomousRecoveryWorkflow | undefined {
    return db.getAutonomousWorkflowById(workspaceId, id);
  }

  public static cancelWorkflow(
    workspaceId: string,
    id: string,
    reason?: string
  ): AutonomousRecoveryWorkflow {
    return db.cancelAutonomousWorkflow(workspaceId, id, reason);
  }

  public static getRetrySchedules(
    workspaceId: string,
    workflowId?: string
  ): AutonomousRetrySchedule[] {
    return db.getAutonomousRetrySchedules(workspaceId, workflowId);
  }

  public static getMetrics(workspaceId: string): AutonomousRecoveryMetrics {
    return db.getAutonomousRecoveryMetrics(workspaceId);
  }
}
