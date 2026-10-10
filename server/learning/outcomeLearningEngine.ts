import { db } from '../store/db.js';
import { supabaseService } from '../db/supabaseService.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { CopilotOrchestrator } from '../copilot/copilotOrchestrator.js';

export interface ActionSuccessRate {
  actionType: string;
  actionLabel: string;
  totalAttempts: number;
  successfulAttempts: number;
  successRatePercentage: number;
  evidenceStatement: string;
}

export interface ChannelPerformance {
  channel: string;
  totalSent: number;
  totalPaid: number;
  successRatePercentage: number;
  evidenceStatement: string;
}

export interface RetryTimingPerformance {
  attemptNumber: number;
  totalAttempts: number;
  successfulAttempts: number;
  successRatePercentage: number;
  evidenceStatement: string;
}

export interface SequencePerformance {
  sequencePattern: string;
  totalRuns: number;
  successfulRuns: number;
  successRatePercentage: number;
  evidenceStatement: string;
}

export interface OptimizationRecommendation {
  type: 'channel_selection' | 'retry_timing' | 'recovery_sequence' | 'general';
  recommendation: string;
  evidence: string;
  expectedImpactScoreImprovement: number;
}

export type OptimizationConfidenceLevel = 'high' | 'medium' | 'low' | 'none';
export type RecommendationStrength = 'strong' | 'moderate' | 'tentative' | 'none';

export interface ActiveOptimizationDecision {
  type: 'channel_selection' | 'retry_timing' | 'recovery_sequence';
  target: string;
  currentValue: any;
  recommendedValue: any;
  previousDefaultValue: any;
  confidenceLevel: OptimizationConfidenceLevel;
  confidenceScore: number; // 0 - 100
  recommendationStrength: RecommendationStrength;
  sampleSize: number;
  evidence: string;
  whyChosen: string;
  whatChanged: string;
  isApplied: boolean;
}

export interface HistoricalEvidenceSummary {
  workspaceId: string;
  failureCategory?: string;
  totalOutcomesAnalyzed: number;
  totalActionsAnalyzed: number;
  totalLogsAnalyzed: number;
  hasSufficientSample: boolean;
  actionSuccessRates: ActionSuccessRate[];
  workflowSuccessRate?: {
    totalWorkflows: number;
    successfulWorkflows: number;
    successRatePercentage: number;
  };
  evidenceStatements: string[];
  
  // Phase 2 Optimization Metrics
  channelPerformance?: ChannelPerformance[];
  retryTimingPerformance?: RetryTimingPerformance[];
  sequencePerformance?: SequencePerformance[];
  optimizationRecommendations?: OptimizationRecommendation[];
  activeOptimizations?: ActiveOptimizationDecision[];
}

export const MIN_SAMPLE_THRESHOLD = 3;
export const MIN_OPTIMIZATION_SAMPLE = 3;
export const CONFIDENCE_THRESHOLD = 60; // Minimum score required to apply automated optimization

export class OutcomeLearningEngine {
  /**
   * Analyzes historical actions, outcomes, and execution logs for a workspace.
   * Enforces minimum sample threshold (>= 3 recorded events) before producing statistical success rates.
   * Leverages real recovery outcomes, measuring channel, retry timing, and sequence performance.
   */
  public static async analyzeWorkspaceOutcomes(
    workspaceId: string,
    failureCategory?: string
  ): Promise<HistoricalEvidenceSummary> {
    let actions: any[] = [];
    let outcomes: any[] = [];
    let logs: any[] = [];
    let retrySchedules: any[] = [];
    let dispatches: any[] = [];

    if (isSupabaseAuthoritative()) {
      try {
        actions = await supabaseService.getOpportunityActions(workspaceId);
        outcomes = await supabaseService.getOpportunityOutcomes(workspaceId);
        logs = await supabaseService.getCopilotExecutionLogs(workspaceId);
        try {
          retrySchedules = await (supabaseService as any).getAutonomousRetrySchedules(workspaceId);
        } catch {
          retrySchedules = db.getAutonomousRetrySchedules(workspaceId);
        }
        try {
          dispatches = await (supabaseService as any).getRecoveryDispatches(workspaceId);
        } catch {
          dispatches = db.getRecoveryDispatches(workspaceId);
        }
      } catch (e) {
        actions = [];
        outcomes = [];
        logs = [];
        retrySchedules = [];
        dispatches = [];
      }
    } else {
      actions = db.getOpportunityActions(workspaceId);
      outcomes = db.getOpportunityOutcomes(workspaceId);
      logs = CopilotOrchestrator.getExecutionLogsInMemory(workspaceId);
      retrySchedules = db.getAutonomousRetrySchedules(workspaceId);
      dispatches = db.getRecoveryDispatches(workspaceId);
    }

    const totalOutcomesAnalyzed = outcomes.length;
    const totalActionsAnalyzed = actions.length;
    const totalLogsAnalyzed = logs.length;
    const totalDispatches = dispatches.length;
    const totalRetrySchedules = retrySchedules.length;

    const totalSampleCount = totalOutcomesAnalyzed + totalActionsAnalyzed + totalLogsAnalyzed + totalDispatches + totalRetrySchedules;
    const hasSufficientSample = totalSampleCount >= MIN_SAMPLE_THRESHOLD;

    const actionRatesMap: Map<string, { label: string; total: number; success: number }> = new Map();

    const getLabel = (type: string): string => {
      switch (type) {
        case 'payment_retry': return 'Smart Payment Retry';
        case 'send_hosted_link': return 'Hosted Secure Payment Link';
        case 'send_invoice_reminder': return 'Overdue Invoice Email Reminder';
        case 'operator_escalation': return 'VIP Concierge Escalation';
        default: return type.replace(/_/g, ' ');
      }
    };

    const processedIds = new Set<string>();

    // Aggregate actions from execution logs
    for (const log of logs) {
      if (
        log.actionType === 'workflow_started' ||
        log.actionType === 'workflow_completed' ||
        log.actionType === 'approve_plan' ||
        log.actionType === 'reject_plan'
      ) {
        continue;
      }
      if (log.id) processedIds.add(log.id);
      const type = log.actionType || 'unknown';
      const label = getLabel(type);
      const curr = actionRatesMap.get(type) || { label, total: 0, success: 0 };
      curr.total += 1;
      if (log.resultStatus === 'success' || log.stateAfter === 'completed' || log.stateAfter === 'succeeded') {
        curr.success += 1;
      }
      actionRatesMap.set(type, curr);
    }

    // Aggregate actions from opportunity_actions
    for (const act of actions) {
      if (act.id && processedIds.has(act.id)) continue;
      if (act.id) processedIds.add(act.id);
      const type = act.action_type || act.actionType || 'unknown';
      const label = getLabel(type);
      const curr = actionRatesMap.get(type) || { label, total: 0, success: 0 };
      curr.total += 1;
      if (act.result_status === 'success' || act.resultStatus === 'success') {
        curr.success += 1;
      }
      actionRatesMap.set(type, curr);
    }

    const actionSuccessRates: ActionSuccessRate[] = [];
    const evidenceStatements: string[] = [];

    // Initialize Phase 2 performance lists
    const channelPerformance: ChannelPerformance[] = [];
    const retryTimingPerformance: RetryTimingPerformance[] = [];
    const sequencePerformance: SequencePerformance[] = [];
    const optimizationRecommendations: OptimizationRecommendation[] = [];
    const activeOptimizations: ActiveOptimizationDecision[] = [];

    if (!hasSufficientSample) {
      evidenceStatements.push(
        `Limited historical sample (${totalSampleCount} recorded event(s) in workspace; minimum threshold is ${MIN_SAMPLE_THRESHOLD}). Recommendations rely on standard recovery benchmarks.`
      );
    } else {
      actionRatesMap.forEach((data, type) => {
        if (data.total > 0) {
          const rate = Math.round((data.success / data.total) * 100);
          const statement = `${data.label} succeeded in ${data.success} of ${data.total} recorded recovery attempt(s) (${rate}% success rate).`;
          actionSuccessRates.push({
            actionType: type,
            actionLabel: data.label,
            totalAttempts: data.total,
            successfulAttempts: data.success,
            successRatePercentage: rate,
            evidenceStatement: statement,
          });
          evidenceStatements.push(statement);
        }
      });

      if (outcomes.length > 0) {
        const recoveredCount = outcomes.filter(o => o.outcome === 'recovered' || o.outcome === 'partial_recovery').length;
        const outcomeRate = Math.round((recoveredCount / outcomes.length) * 100);
        evidenceStatements.push(
          `Historical resolution rate for recorded opportunities is ${outcomeRate}% (${recoveredCount} of ${outcomes.length} settled).`
        );
      }

      // 1. Measure Channel Performance
      const channelSuccessMap: Map<string, { channel: string; total: number; success: number }> = new Map();
      for (const c of ['email', 'sms', 'hosted_link']) {
        channelSuccessMap.set(c, { channel: c, total: 0, success: 0 });
      }

      for (const disp of dispatches) {
        const channel = disp.channel || 'unknown';
        const curr = channelSuccessMap.get(channel) || { channel, total: 0, success: 0 };
        curr.total += 1;
        if (disp.status === 'paid') {
          curr.success += 1;
        }
        channelSuccessMap.set(channel, curr);
      }

      for (const act of actions) {
        if (act.channel) {
          const channel = act.channel.toLowerCase();
          const normalized = channel === 'portal' || channel === 'hosted_portal' ? 'hosted_link' : channel;
          const curr = channelSuccessMap.get(normalized) || { channel: normalized, total: 0, success: 0 };
          curr.total += 1;
          if (act.resultStatus === 'success' || act.result_status === 'success') {
            curr.success += 1;
          }
          channelSuccessMap.set(normalized, curr);
        }
      }

      channelSuccessMap.forEach((data, channel) => {
        if (data.total > 0) {
          const rate = Math.round((data.success / data.total) * 100);
          const label = channel === 'hosted_link' ? 'Hosted Secure Link' : channel.toUpperCase();
          channelPerformance.push({
            channel,
            totalSent: data.total,
            totalPaid: data.success,
            successRatePercentage: rate,
            evidenceStatement: `${label} conversion rate is ${rate}% (${data.success} of ${data.total} outreach paid).`,
          });
        }
      });

      // 2. Measure Retry Timing Performance
      const timingSuccessMap: Map<number, { attempt: number; total: number; success: number }> = new Map();
      for (const i of [1, 2, 3]) {
        timingSuccessMap.set(i, { attempt: i, total: 0, success: 0 });
      }

      for (const sched of retrySchedules) {
        if (sched.status === 'skipped') continue;
        const attempt = sched.attempt_number || 1;
        const curr = timingSuccessMap.get(attempt) || { attempt, total: 0, success: 0 };
        curr.total += 1;
        if (sched.status === 'completed') {
          curr.success += 1;
        }
        timingSuccessMap.set(attempt, curr);
      }

      timingSuccessMap.forEach((data, attempt) => {
        if (data.total > 0) {
          const rate = Math.round((data.success / data.total) * 100);
          const dayLabel = attempt === 1 ? 'Day 1 Retry' : attempt === 2 ? 'Day 3 Retry' : 'Day 5 Retry';
          retryTimingPerformance.push({
            attemptNumber: attempt,
            totalAttempts: data.total,
            successfulAttempts: data.success,
            successRatePercentage: rate,
            evidenceStatement: `${dayLabel} (Attempt ${attempt}) success rate is ${rate}% (${data.success} of ${data.total} cleared).`,
          });
        }
      });

      // 3. Measure Recovery Sequence Performance
      const oppActionsMap: Map<string, any[]> = new Map();
      for (const act of actions) {
        const oppId = act.opportunityId || act.opportunity_id;
        if (oppId) {
          const list = oppActionsMap.get(oppId) || [];
          list.push(act);
          oppActionsMap.set(oppId, list);
        }
      }

      const oppSequenceMap: Map<string, string> = new Map();
      oppActionsMap.forEach((list, oppId) => {
        list.sort((a, b) => new Date(a.executedAt || a.executed_at).getTime() - new Date(b.executedAt || b.executed_at).getTime());
        const seqPattern = list.map(a => a.actionType || a.action_type || 'outreach').join(' -> ');
        if (seqPattern) {
          oppSequenceMap.set(oppId, seqPattern);
        }
      });

      const sequenceSuccessMap: Map<string, { sequence: string; total: number; success: number }> = new Map();
      oppSequenceMap.forEach((pattern, oppId) => {
        const isRecovered = outcomes.some(o => (o.opportunityId === oppId || o.opportunity_id === oppId) && (o.outcome === 'recovered' || o.outcome === 'partial_recovery'));
        const oppObj = db.getOpportunityById(oppId, workspaceId);
        const isResolved = isRecovered || oppObj?.status === 'recovered';

        const curr = sequenceSuccessMap.get(pattern) || { sequence: pattern, total: 0, success: 0 };
        curr.total += 1;
        if (isResolved) {
          curr.success += 1;
        }
        sequenceSuccessMap.set(pattern, curr);
      });

      sequenceSuccessMap.forEach((data, pattern) => {
        const rate = Math.round((data.success / data.total) * 100);
        const friendlyPattern = pattern.split(' -> ').map(p => getLabel(p)).join(' ➔ ');
        sequencePerformance.push({
          sequencePattern: pattern,
          totalRuns: data.total,
          successfulRuns: data.success,
          successRatePercentage: rate,
          evidenceStatement: `Sequence [${friendlyPattern}] succeeded in ${data.success} of ${data.total} cases (${rate}%).`,
        });
      });

      // 4. Generate Explainable Recommendations & Closed-Loop Decisions
      const sortedChannels = [...channelPerformance].sort((a, b) => b.successRatePercentage - a.successRatePercentage);
      const bestChannel = sortedChannels[0];

      if (bestChannel && bestChannel.totalSent >= MIN_OPTIMIZATION_SAMPLE && bestChannel.totalPaid > 0) {
        const bestLabel = bestChannel.channel === 'hosted_link' ? 'Hosted Secure Link' : bestChannel.channel.toUpperCase();
        const emailPerf = channelPerformance.find(c => c.channel === 'email');
        const defaultRate = emailPerf && emailPerf.totalSent > 0 ? emailPerf.successRatePercentage : 0;
        const worstChannel = sortedChannels[sortedChannels.length - 1];
        const margin = bestChannel.channel === 'email'
          ? (worstChannel ? bestChannel.successRatePercentage - worstChannel.successRatePercentage : 0)
          : (bestChannel.successRatePercentage - defaultRate);

        let confidence: OptimizationConfidenceLevel = 'low';
        let confidenceScore = 50;
        let strength: RecommendationStrength = 'tentative';

        if (bestChannel.totalSent >= 5 && margin >= 30) {
          confidence = 'high';
          confidenceScore = 90;
          strength = 'strong';
        } else if (bestChannel.totalSent >= MIN_OPTIMIZATION_SAMPLE && (margin >= 15 || bestChannel.successRatePercentage >= 60)) {
          confidence = 'medium';
          confidenceScore = 75;
          strength = 'moderate';
        } else if (margin <= 0) {
          confidence = 'none';
          confidenceScore = 30;
          strength = 'none';
        }

        const isApplied = confidenceScore >= CONFIDENCE_THRESHOLD;

        optimizationRecommendations.push({
          type: 'channel_selection',
          recommendation: `Prioritize ${bestLabel} over other outreach channels.`,
          evidence: `Outcome analytics indicate that ${bestLabel} achieves a ${bestChannel.successRatePercentage}% success rate in this workspace (sample size: ${bestChannel.totalSent}), outperforming default channel by ${margin}%.`,
          expectedImpactScoreImprovement: Math.max(5, Math.round(margin / 10)),
        });

        activeOptimizations.push({
          type: 'channel_selection',
          target: 'recovery_channel',
          currentValue: bestChannel.channel,
          recommendedValue: bestChannel.channel,
          previousDefaultValue: 'email',
          confidenceLevel: confidence,
          confidenceScore,
          recommendationStrength: strength,
          sampleSize: bestChannel.totalSent,
          evidence: `${bestLabel} has ${bestChannel.successRatePercentage}% win rate across ${bestChannel.totalSent} dispatches (vs default: ${defaultRate}%)`,
          whyChosen: `Empirical recovery win rate (${bestChannel.successRatePercentage}%) outperforms workspace default channel by ${margin}%`,
          whatChanged: `Outreach channel default dynamically shifted to ${bestLabel}`,
          isApplied,
        });
      }

      // Retry Timing closed loop recommendation
      const validTimingAttempts = retryTimingPerformance.filter(t => t.totalAttempts >= MIN_OPTIMIZATION_SAMPLE && t.successfulAttempts > 0);
      const sortedTiming = [...validTimingAttempts].sort((a, b) => b.successRatePercentage - a.successRatePercentage);
      const bestTiming = sortedTiming[0];

      if (bestTiming && bestTiming.totalAttempts >= MIN_OPTIMIZATION_SAMPLE) {
        const bestLabel = bestTiming.attemptNumber === 1 ? 'Day 1 (Attempt 1)' : bestTiming.attemptNumber === 2 ? 'Day 3 (Attempt 2)' : 'Day 5 (Attempt 3)';
        const attempt3 = retryTimingPerformance.find(t => t.attemptNumber === 3);
        const day5Rate = attempt3 ? attempt3.successRatePercentage : 0;
        const timingMargin = bestTiming.attemptNumber === 2
          ? (bestTiming.successRatePercentage - day5Rate)
          : (bestTiming.successRatePercentage - (sortedTiming[sortedTiming.length - 1]?.successRatePercentage || 0));

        let confidence: OptimizationConfidenceLevel = 'low';
        let confidenceScore = 50;
        let strength: RecommendationStrength = 'tentative';

        if (bestTiming.totalAttempts >= 5 && bestTiming.successRatePercentage >= 60) {
          confidence = 'high';
          confidenceScore = 85;
          strength = 'strong';
        } else if (bestTiming.totalAttempts >= MIN_OPTIMIZATION_SAMPLE && bestTiming.successRatePercentage >= 40) {
          confidence = 'medium';
          confidenceScore = 75;
          strength = 'moderate';
        }

        // Adjust cadence: If Day 3 (Attempt 2) significantly outperforms Day 5, adjust schedule
        let recommendedIntervals = [1, 3, 5];
        let whatChanged = `Retry intervals dynamically adjusted to Days [${recommendedIntervals.join(', ')}]`;
        let whyChosen = `Historical retry conversion peaks at ${bestLabel}; adjusting retry schedule cadence`;

        if (bestTiming.attemptNumber === 2 && (timingMargin >= 15 || bestTiming.successRatePercentage >= 40)) {
          recommendedIntervals = [1, 3];
          whatChanged = `Retry intervals dynamically adjusted from [1, 3, 5] to [1, 3] to concentrate clearance around Day 3 peak and eliminate unproductive Day 5 attempts`;
          whyChosen = `Day 3 (Attempt 2) achieves ${bestTiming.successRatePercentage}% success rate across ${bestTiming.totalAttempts} attempts, significantly outperforming Day 5 (margin: +${timingMargin}%)`;
        } else if (bestTiming.attemptNumber === 1 && bestTiming.successRatePercentage >= 50) {
          recommendedIntervals = [1, 2, 4];
          whatChanged = `Retry intervals tightened to Days [1, 2, 4] due to strong initial Day 1 clearance rate (${bestTiming.successRatePercentage}%)`;
          whyChosen = `Day 1 (Attempt 1) exhibits high early settlement velocity; compressing retry intervals to capture timely clearance`;
        }

        optimizationRecommendations.push({
          type: 'retry_timing',
          recommendation: `Target payment retries during the ${bestLabel} interval.`,
          evidence: `${bestLabel} exhibits the peak historical retry clearance rate of ${bestTiming.successRatePercentage}% in this workspace (sample: ${bestTiming.totalAttempts}).`,
          expectedImpactScoreImprovement: 8,
        });

        activeOptimizations.push({
          type: 'retry_timing',
          target: 'retry_intervals',
          currentValue: recommendedIntervals,
          recommendedValue: recommendedIntervals,
          previousDefaultValue: [1, 3, 5],
          confidenceLevel: confidence,
          confidenceScore,
          recommendationStrength: strength,
          sampleSize: bestTiming.totalAttempts,
          evidence: `${bestLabel} clears ${bestTiming.successRatePercentage}% of retries across ${bestTiming.totalAttempts} attempts`,
          whyChosen,
          whatChanged,
          isApplied: confidenceScore >= CONFIDENCE_THRESHOLD,
        });
      }

      // Sequence closed loop recommendation
      const validSequences = sequencePerformance.filter(s => s.totalRuns >= MIN_OPTIMIZATION_SAMPLE && s.successfulRuns > 0);
      const sortedSeq = [...validSequences].sort((a, b) => b.successRatePercentage - a.successRatePercentage);
      const bestSeq = sortedSeq[0];

      if (bestSeq && bestSeq.totalRuns >= MIN_OPTIMIZATION_SAMPLE) {
        const friendlySeq = bestSeq.sequencePattern.split(' -> ').map(p => getLabel(p)).join(' ➔ ');
        const seqSteps = bestSeq.sequencePattern.split(' -> ');
        let confidence: OptimizationConfidenceLevel = 'low';
        let confidenceScore = 50;
        let strength: RecommendationStrength = 'tentative';

        if (bestSeq.totalRuns >= 5 && bestSeq.successRatePercentage >= 70) {
          confidence = 'high';
          confidenceScore = 90;
          strength = 'strong';
        } else if (bestSeq.totalRuns >= MIN_OPTIMIZATION_SAMPLE && bestSeq.successRatePercentage >= 50) {
          confidence = 'medium';
          confidenceScore = 75;
          strength = 'moderate';
        }

        optimizationRecommendations.push({
          type: 'recovery_sequence',
          recommendation: `Deploy sequence flow: [${friendlySeq}].`,
          evidence: `This multi-step sequence has demonstrated a peak historical recovery rate of ${bestSeq.successRatePercentage}% across ${bestSeq.totalRuns} cases in this workspace.`,
          expectedImpactScoreImprovement: 12,
        });

        activeOptimizations.push({
          type: 'recovery_sequence',
          target: 'recovery_steps',
          currentValue: seqSteps,
          recommendedValue: seqSteps,
          previousDefaultValue: ['payment_retry', 'send_hosted_link', 'operator_escalation'],
          confidenceLevel: confidence,
          confidenceScore,
          recommendationStrength: strength,
          sampleSize: bestSeq.totalRuns,
          evidence: `Sequence [${friendlySeq}] achieved ${bestSeq.successRatePercentage}% recovery win rate across ${bestSeq.totalRuns} executions`,
          whyChosen: `Highest empirical recovery rate for multi-step dunning sequence`,
          whatChanged: `Copilot plan sequence reconfigured to execute [${friendlySeq}] first`,
          isApplied: confidenceScore >= CONFIDENCE_THRESHOLD,
        });
      }
    }

    // Workflow success rate aggregation
    const wfLogs = logs.filter(l => l.actionType === 'workflow_completed');
    const wfSuccess = wfLogs.filter(l => l.resultStatus === 'success' || l.stateAfter === 'completed').length;
    const workflowSuccessRate = wfLogs.length > 0
      ? {
          totalWorkflows: wfLogs.length,
          successfulWorkflows: wfSuccess,
          successRatePercentage: Math.round((wfSuccess / wfLogs.length) * 100),
        }
      : undefined;

    return {
      workspaceId,
      failureCategory,
      totalOutcomesAnalyzed,
      totalActionsAnalyzed,
      totalLogsAnalyzed,
      hasSufficientSample,
      actionSuccessRates,
      workflowSuccessRate,
      evidenceStatements,
      channelPerformance,
      retryTimingPerformance,
      sequencePerformance,
      optimizationRecommendations,
      activeOptimizations,
    };
  }

  /**
   * Helper: Resolves optimal recovery channel based on statistical outcomes
   * Only returns isOptimized: true if sample size >= 3 and confidence score >= 60
   */
  public static async getOptimalChannel(workspaceId: string): Promise<{
    channel: 'email' | 'sms' | 'hosted_link';
    confidence: OptimizationConfidenceLevel;
    confidenceScore: number;
    recommendationStrength: RecommendationStrength;
    sampleSize: number;
    evidence: string;
    reason: string;
    whatChanged: string;
    isOptimized: boolean;
  }> {
    const summary = await this.analyzeWorkspaceOutcomes(workspaceId);
    const channelOpt = summary.activeOptimizations?.find(o => o.type === 'channel_selection');

    if (channelOpt && channelOpt.isApplied) {
      return {
        channel: channelOpt.recommendedValue as 'email' | 'sms' | 'hosted_link',
        confidence: channelOpt.confidenceLevel,
        confidenceScore: channelOpt.confidenceScore,
        recommendationStrength: channelOpt.recommendationStrength,
        sampleSize: channelOpt.sampleSize,
        evidence: channelOpt.evidence,
        reason: channelOpt.whyChosen,
        whatChanged: channelOpt.whatChanged,
        isOptimized: true,
      };
    }

    return {
      channel: 'email',
      confidence: 'none',
      confidenceScore: 0,
      recommendationStrength: 'none',
      sampleSize: 0,
      evidence: 'Insufficient workspace-specific channel data. Standard email fallback utilized.',
      reason: 'Default recovery strategy',
      whatChanged: 'No change; standard default channel used',
      isOptimized: false,
    };
  }

  /**
   * Helper: Resolves optimal retry schedule cadence based on timing performance
   */
  public static async getOptimalRetrySchedule(workspaceId: string): Promise<{
    intervalsDays: number[];
    confidence: OptimizationConfidenceLevel;
    confidenceScore: number;
    recommendationStrength: RecommendationStrength;
    sampleSize: number;
    evidence: string;
    reason: string;
    whatChanged: string;
    isOptimized: boolean;
  }> {
    const summary = await this.analyzeWorkspaceOutcomes(workspaceId);
    const timingOpt = summary.activeOptimizations?.find(o => o.type === 'retry_timing');

    if (timingOpt && timingOpt.isApplied && Array.isArray(timingOpt.recommendedValue)) {
      return {
        intervalsDays: timingOpt.recommendedValue,
        confidence: timingOpt.confidenceLevel,
        confidenceScore: timingOpt.confidenceScore,
        recommendationStrength: timingOpt.recommendationStrength,
        sampleSize: timingOpt.sampleSize,
        evidence: timingOpt.evidence,
        reason: timingOpt.whyChosen,
        whatChanged: timingOpt.whatChanged,
        isOptimized: true,
      };
    }

    return {
      intervalsDays: [1, 3, 5],
      confidence: 'none',
      confidenceScore: 0,
      recommendationStrength: 'none',
      sampleSize: 0,
      evidence: 'Insufficient timing outcome sample. Standard Day 1, 3, 5 cadence preserved.',
      reason: 'Default retry schedule',
      whatChanged: 'No change; standard retry interval preserved',
      isOptimized: false,
    };
  }

  /**
   * Helper: Resolves optimal recovery sequence based on historical multi-step pattern win rates
   */
  public static async getOptimalSequence(workspaceId: string): Promise<{
    sequence: string[];
    confidence: OptimizationConfidenceLevel;
    confidenceScore: number;
    recommendationStrength: RecommendationStrength;
    sampleSize: number;
    evidence: string;
    reason: string;
    whatChanged: string;
    isOptimized: boolean;
  }> {
    const summary = await this.analyzeWorkspaceOutcomes(workspaceId);
    const seqOpt = summary.activeOptimizations?.find(o => o.type === 'recovery_sequence');

    if (seqOpt && seqOpt.isApplied && Array.isArray(seqOpt.recommendedValue)) {
      return {
        sequence: seqOpt.recommendedValue,
        confidence: seqOpt.confidenceLevel,
        confidenceScore: seqOpt.confidenceScore,
        recommendationStrength: seqOpt.recommendationStrength,
        sampleSize: seqOpt.sampleSize,
        evidence: seqOpt.evidence,
        reason: seqOpt.whyChosen,
        whatChanged: seqOpt.whatChanged,
        isOptimized: true,
      };
    }

    return {
      sequence: ['payment_retry', 'send_hosted_link', 'operator_escalation'],
      confidence: 'none',
      confidenceScore: 0,
      recommendationStrength: 'none',
      sampleSize: 0,
      evidence: 'Standard default sequence applied.',
      reason: 'Standard dunning progression',
      whatChanged: 'No change; standard sequence preserved',
      isOptimized: false,
    };
  }

  /**
   * Helper: Retrieves active optimizations for a workspace
   */
  public static async getActiveOptimizations(workspaceId: string): Promise<ActiveOptimizationDecision[]> {
    const summary = await this.analyzeWorkspaceOutcomes(workspaceId);
    return summary.activeOptimizations || [];
  }
}
