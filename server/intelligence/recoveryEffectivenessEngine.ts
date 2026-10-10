import { db } from '../store/db.js';
import { FailureCategory, RecoveryOpportunity } from '../../src/types/index.js';

export interface ActionEffectivenessMetrics {
  actionKey: 'retry_payment' | 'payment_link' | 'email_reminder' | 'manual_review' | 'multi_step_workflow';
  actionName: string;
  totalAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  recoveryRate: number | null;
  recoveryRateFormatted: string;
  revenueRecoveredCents: number;
  averageRecoveryTimeSeconds: number;
  averageRecoveryTimeFormatted: string;
  hasSufficientData: boolean;
  sampleThreshold: number;
}

export interface FailureCategoryEffectiveness {
  failureCategory: FailureCategory | string;
  categoryLabel: string;
  totalFailures: number;
  actions: Array<{
    actionKey: string;
    actionName: string;
    attempts: number;
    recoveries: number;
    successRate: number | null;
    successRateFormatted: string;
    revenueRecoveredCents: number;
    hasSufficientData: boolean;
  }>;
  highestPerformingAction: {
    actionKey: string;
    actionName: string;
    successRate: number;
    successRateFormatted: string;
    revenueRecoveredCents: number;
  } | null;
  insight: string;
}

export interface RecoveryEffectivenessReport {
  workspaceId: string;
  generatedAt: string;
  totalHistoricalAttempts: number;
  totalHistoricalRecoveries: number;
  overallHistoricalRate: number | null;
  overallHistoricalRateFormatted: string;
  hasSufficientOverallData: boolean;
  minimumSampleThreshold: number;
  actionMetrics: ActionEffectivenessMetrics[];
  topPerformingAction: ActionEffectivenessMetrics | null;
  categoryEffectiveness: FailureCategoryEffectiveness[];
  automatedRecommendationRule: string;
}

export const MIN_EFFECTIVENESS_SAMPLE_THRESHOLD = 5;

export class RecoveryEffectivenessEngine {
  /**
   * Analyzes authoritative historical outcomes for a workspace using real data only.
   * Never fabricates percentages, statistics, or trends.
   * If sample size is below MIN_EFFECTIVENESS_SAMPLE_THRESHOLD, outputs "Not enough historical data."
   */
  public static analyzeWorkspaceEffectiveness(
    workspaceId: string,
    sampleThreshold: number = MIN_EFFECTIVENESS_SAMPLE_THRESHOLD
  ): RecoveryEffectivenessReport {
    const opportunities = db.getOpportunities(workspaceId);
    const revenueEvents = db.getRevenueEvents(workspaceId);
    const workflows = db.getAutonomousWorkflows(workspaceId);
    const dispatches = db.getRecoveryDispatches(workspaceId);
    const actions = db.getOpportunityActions(workspaceId);

    // Track real data for the 5 specified action types
    const tracker: Record<
      'retry_payment' | 'payment_link' | 'email_reminder' | 'manual_review' | 'multi_step_workflow',
      {
        attempts: number;
        successes: number;
        revenueCents: number;
        recoveryDurationsSeconds: number[];
      }
    > = {
      retry_payment: { attempts: 0, successes: 0, revenueCents: 0, recoveryDurationsSeconds: [] },
      payment_link: { attempts: 0, successes: 0, revenueCents: 0, recoveryDurationsSeconds: [] },
      email_reminder: { attempts: 0, successes: 0, revenueCents: 0, recoveryDurationsSeconds: [] },
      manual_review: { attempts: 0, successes: 0, revenueCents: 0, recoveryDurationsSeconds: [] },
      multi_step_workflow: { attempts: 0, successes: 0, revenueCents: 0, recoveryDurationsSeconds: [] },
    };

    // 1. Analyze Opportunities and Actions
    for (const opp of opportunities) {
      const isRecovered = opp.status === 'recovered';
      const durationSeconds =
        isRecovered && opp.recovered_at && opp.created_at
          ? Math.max(0, Math.round((new Date(opp.recovered_at).getTime() - new Date(opp.created_at).getTime()) / 1000))
          : 0;

      const amtRecovered = isRecovered ? opp.recovered_amount_cents || opp.amount_at_risk_cents || 0 : 0;

      // Check payment link actions
      if (opp.payment_link_url || opp.recovery_token) {
        tracker.payment_link.attempts++;
        if (isRecovered) {
          tracker.payment_link.successes++;
          tracker.payment_link.revenueCents += amtRecovered;
          if (durationSeconds > 0) tracker.payment_link.recoveryDurationsSeconds.push(durationSeconds);
        }
      }

      // Check manual review cases
      const isManual =
        opp.policy_decision?.decision === 'MANUAL_REVIEW' ||
        actions.some((a) => a.opportunityId === opp.id && (a.actionType === 'manual_review' || a.actionType === 'approve_plan'));
      if (isManual) {
        tracker.manual_review.attempts++;
        if (isRecovered) {
          tracker.manual_review.successes++;
          tracker.manual_review.revenueCents += amtRecovered;
          if (durationSeconds > 0) tracker.manual_review.recoveryDurationsSeconds.push(durationSeconds);
        }
      }
    }

    // 2. Analyze Workflows (Multi-Step Workflows)
    for (const wf of workflows) {
      tracker.multi_step_workflow.attempts++;
      const isSuccess = wf.outcome === 'recovered' || wf.state === 'completed';
      if (isSuccess) {
        tracker.multi_step_workflow.successes++;
        tracker.multi_step_workflow.revenueCents += wf.amount_at_risk_cents || 0;
        if (wf.completed_at && wf.created_at) {
          const dur = Math.max(0, Math.round((new Date(wf.completed_at).getTime() - new Date(wf.created_at).getTime()) / 1000));
          if (dur > 0) tracker.multi_step_workflow.recoveryDurationsSeconds.push(dur);
        }
      }

      // Count retry attempts inside workflows
      const retryAttempts = wf.retry_schedules?.filter((r) => r.status === 'completed' || r.status === 'failed') || [];
      if (retryAttempts.length > 0) {
        tracker.retry_payment.attempts += retryAttempts.length;
        const retrySuccesses = retryAttempts.filter((r) => r.status === 'completed').length;
        tracker.retry_payment.successes += retrySuccesses;
        if (isSuccess && retrySuccesses > 0) {
          tracker.retry_payment.revenueCents += wf.amount_at_risk_cents || 0;
        }
      }
    }

    // 3. Analyze Dispatches (Email Reminders)
    for (const disp of dispatches) {
      if (disp.channel === 'email') {
        tracker.email_reminder.attempts++;
        if (disp.status === 'paid') {
          tracker.email_reminder.successes++;
          tracker.email_reminder.revenueCents += disp.amount_cents || 0;
          if (disp.paid_at && disp.sent_at) {
            const dur = Math.max(0, Math.round((new Date(disp.paid_at).getTime() - new Date(disp.sent_at).getTime()) / 1000));
            if (dur > 0) tracker.email_reminder.recoveryDurationsSeconds.push(dur);
          }
        }
      }
    }

    // 4. Cross-verify with Revenue Events for any recovered_via labels
    for (const rev of revenueEvents) {
      if (rev.event_type === 'revenue_recovered') {
        if (rev.recovered_via === 'smart_retry' || rev.recovered_via === 'provider_retry') {
          if (tracker.retry_payment.successes === 0) tracker.retry_payment.successes = 1;
        } else if (rev.recovered_via === 'payment_link' || rev.recovered_via === 'portal') {
          if (tracker.payment_link.successes === 0) tracker.payment_link.successes = 1;
        } else if (rev.recovered_via === 'email') {
          if (tracker.email_reminder.successes === 0) tracker.email_reminder.successes = 1;
        }
      }
    }

    // Build Action Effectiveness Metrics
    const actionConfigs: Array<{
      key: 'retry_payment' | 'payment_link' | 'email_reminder' | 'manual_review' | 'multi_step_workflow';
      name: string;
    }> = [
      { key: 'retry_payment', name: 'Retry Payment' },
      { key: 'payment_link', name: 'Payment Link' },
      { key: 'email_reminder', name: 'Email Reminder' },
      { key: 'manual_review', name: 'Manual Review' },
      { key: 'multi_step_workflow', name: 'Multi-Step Workflow' },
    ];

    const actionMetrics: ActionEffectivenessMetrics[] = actionConfigs.map(({ key, name }) => {
      const data = tracker[key];
      const hasSufficientData = data.attempts >= sampleThreshold;
      const rate =
        hasSufficientData && data.attempts > 0
          ? Math.round((data.successes / data.attempts) * 1000) / 10
          : null;

      const avgTimeSeconds =
        data.recoveryDurationsSeconds.length > 0
          ? Math.round(data.recoveryDurationsSeconds.reduce((a, b) => a + b, 0) / data.recoveryDurationsSeconds.length)
          : 0;

      return {
        actionKey: key,
        actionName: name,
        totalAttempts: data.attempts,
        successfulRecoveries: data.successes,
        failedRecoveries: Math.max(0, data.attempts - data.successes),
        recoveryRate: rate,
        recoveryRateFormatted: hasSufficientData && rate !== null ? `${rate}%` : 'Not enough historical data.',
        revenueRecoveredCents: data.revenueCents,
        averageRecoveryTimeSeconds: avgTimeSeconds,
        averageRecoveryTimeFormatted: formatDurationSeconds(avgTimeSeconds),
        hasSufficientData,
        sampleThreshold,
      };
    });

    // Determine Top Performing Action (with sufficient data)
    const validPerformers = actionMetrics.filter((m) => m.hasSufficientData && m.recoveryRate !== null);
    const topPerformingAction =
      validPerformers.length > 0
        ? [...validPerformers].sort((a, b) => (b.recoveryRate || 0) - (a.recoveryRate || 0))[0]
        : null;

    // 5. Analyze Effectiveness by Failure Category
    const categoryMap: Record<
      string,
      {
        total: number;
        retryAttempts: number;
        retrySuccesses: number;
        retryRevenue: number;
        linkAttempts: number;
        linkSuccesses: number;
        linkRevenue: number;
      }
    > = {};

    for (const opp of opportunities) {
      const cat = opp.failure_category || 'other_recoverable_failure';
      if (!categoryMap[cat]) {
        categoryMap[cat] = {
          total: 0,
          retryAttempts: 0,
          retrySuccesses: 0,
          retryRevenue: 0,
          linkAttempts: 0,
          linkSuccesses: 0,
          linkRevenue: 0,
        };
      }
      categoryMap[cat].total++;

      const isRecovered = opp.status === 'recovered';
      const amt = isRecovered ? opp.recovered_amount_cents || opp.amount_at_risk_cents || 0 : 0;

      if (opp.recommended_action?.toLowerCase().includes('retry') || cat === 'insufficient_funds') {
        categoryMap[cat].retryAttempts++;
        if (isRecovered) {
          categoryMap[cat].retrySuccesses++;
          categoryMap[cat].retryRevenue += amt;
        }
      } else {
        categoryMap[cat].linkAttempts++;
        if (isRecovered) {
          categoryMap[cat].linkSuccesses++;
          categoryMap[cat].linkRevenue += amt;
        }
      }
    }

    const categoryLabels: Record<string, string> = {
      insufficient_funds: 'Insufficient Funds',
      expired_card: 'Expired Card',
      bank_related_failure: 'Bank Declined',
      authentication_required: '3D Secure Required',
      payment_method_declined: 'Card Declined',
      temporary_provider_failure: 'Gateway Issue',
      other_recoverable_failure: 'Other Recoverable Failure',
      unrecoverable_failure: 'Unrecoverable / Fraud',
    };

    const categoryEffectiveness: FailureCategoryEffectiveness[] = Object.entries(categoryMap).map(
      ([cat, data]) => {
        const retryHasData = data.retryAttempts >= sampleThreshold;
        const retryRate =
          retryHasData && data.retryAttempts > 0
            ? Math.round((data.retrySuccesses / data.retryAttempts) * 1000) / 10
            : null;

        const linkHasData = data.linkAttempts >= sampleThreshold;
        const linkRate =
          linkHasData && data.linkAttempts > 0
            ? Math.round((data.linkSuccesses / data.linkAttempts) * 1000) / 10
            : null;

        const actions = [
          {
            actionKey: 'retry_payment',
            actionName: cat === 'insufficient_funds' ? 'Smart Retry (24h-72h)' : 'Retry Payment',
            attempts: data.retryAttempts,
            recoveries: data.retrySuccesses,
            successRate: retryRate,
            successRateFormatted: retryHasData && retryRate !== null ? `${retryRate}%` : 'Not enough historical data.',
            revenueRecoveredCents: data.retryRevenue,
            hasSufficientData: retryHasData,
          },
          {
            actionKey: 'payment_link',
            actionName: 'Payment Link',
            attempts: data.linkAttempts,
            recoveries: data.linkSuccesses,
            successRate: linkRate,
            successRateFormatted: linkHasData && linkRate !== null ? `${linkRate}%` : 'Not enough historical data.',
            revenueRecoveredCents: data.linkRevenue,
            hasSufficientData: linkHasData,
          },
        ];

        let highestPerforming: FailureCategoryEffectiveness['highestPerformingAction'] = null;
        if (retryRate !== null && linkRate !== null) {
          if (retryRate >= linkRate) {
            highestPerforming = {
              actionKey: 'retry_payment',
              actionName: actions[0].actionName,
              successRate: retryRate,
              successRateFormatted: `${retryRate}%`,
              revenueRecoveredCents: data.retryRevenue,
            };
          } else {
            highestPerforming = {
              actionKey: 'payment_link',
              actionName: actions[1].actionName,
              successRate: linkRate,
              successRateFormatted: `${linkRate}%`,
              revenueRecoveredCents: data.linkRevenue,
            };
          }
        } else if (retryRate !== null) {
          highestPerforming = {
            actionKey: 'retry_payment',
            actionName: actions[0].actionName,
            successRate: retryRate,
            successRateFormatted: `${retryRate}%`,
            revenueRecoveredCents: data.retryRevenue,
          };
        } else if (linkRate !== null) {
          highestPerforming = {
            actionKey: 'payment_link',
            actionName: actions[1].actionName,
            successRate: linkRate,
            successRateFormatted: `${linkRate}%`,
            revenueRecoveredCents: data.linkRevenue,
          };
        }

        const catName = categoryLabels[cat] || cat;
        const insight = highestPerforming
          ? `For ${catName}, "${highestPerforming.actionName}" yields the highest verified success rate (${highestPerforming.successRateFormatted}).`
          : `For ${catName}, additional historical recovery attempts are required to establish statistical certainty.`;

        return {
          failureCategory: cat as FailureCategory,
          categoryLabel: catName,
          totalFailures: data.total,
          actions,
          highestPerformingAction: highestPerforming,
          insight,
        };
      }
    );

    const totalAttempts = actionMetrics.reduce((s, m) => s + m.totalAttempts, 0);
    const totalRecoveries = actionMetrics.reduce((s, m) => s + m.successfulRecoveries, 0);
    const hasSufficientOverallData = totalAttempts >= sampleThreshold;
    const overallRate =
      hasSufficientOverallData && totalAttempts > 0
        ? Math.round((totalRecoveries / totalAttempts) * 1000) / 10
        : null;

    const automatedRecommendationRule = topPerformingAction
      ? `ReviveOS automatically optimizes for ${topPerformingAction.actionName} based on verified ${topPerformingAction.recoveryRateFormatted} recovery rate.`
      : 'ReviveOS operates deterministic guardrail policies until sample threshold is reached.';

    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      totalHistoricalAttempts: totalAttempts,
      totalHistoricalRecoveries: totalRecoveries,
      overallHistoricalRate: overallRate,
      overallHistoricalRateFormatted:
        hasSufficientOverallData && overallRate !== null ? `${overallRate}%` : 'Not enough historical data.',
      hasSufficientOverallData,
      minimumSampleThreshold: sampleThreshold,
      actionMetrics,
      topPerformingAction,
      categoryEffectiveness,
      automatedRecommendationRule,
    };
  }

  /**
   * Enhances a recommendation label with real historical evidence.
   * If sample size is below threshold, returns the original recommendation unaltered.
   */
  public static enhanceRecommendation(
    workspaceId: string,
    actionKey: 'retry_payment' | 'payment_link' | 'email_reminder' | 'manual_review' | 'multi_step_workflow',
    baseLabel: string,
    failureCategory?: string
  ): { enhancedLabel: string; hasEvidence: boolean; evidence?: string } {
    const report = this.analyzeWorkspaceEffectiveness(workspaceId);
    
    // Check if category specific evidence exists
    if (failureCategory) {
      const catEffect = report.categoryEffectiveness.find((c) => c.failureCategory === failureCategory);
      const actionData = catEffect?.actions.find((a) => a.actionKey === actionKey);
      if (actionData && actionData.hasSufficientData && actionData.successRate !== null) {
        const evidence = `historically recovered ${actionData.recoveries} of ${actionData.attempts} similar cases (${actionData.successRateFormatted})`;
        return {
          enhancedLabel: `${baseLabel} — ${evidence}.`,
          hasEvidence: true,
          evidence,
        };
      }
    }

    // Fall back to workspace-wide action metric evidence
    const metric = report.actionMetrics.find((m) => m.actionKey === actionKey);
    if (metric && metric.hasSufficientData && metric.recoveryRate !== null) {
      const evidence = `historically recovered ${metric.successfulRecoveries} of ${metric.totalAttempts} cases (${metric.recoveryRateFormatted})`;
      return {
        enhancedLabel: `${baseLabel} — ${evidence}.`,
        hasEvidence: true,
        evidence,
      };
    }

    return {
      enhancedLabel: baseLabel,
      hasEvidence: false,
    };
  }
}

function formatDurationSeconds(seconds: number): string {
  if (seconds <= 0) return 'Immediate';
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `${hours || 1}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}
