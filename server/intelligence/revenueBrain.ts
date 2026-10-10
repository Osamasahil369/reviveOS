import { db } from '../store/db.js';
import { supabaseService } from '../db/supabaseService.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { AiOpportunityEngine } from './opportunityEngine.js';
import { ChurnPredictorEngine } from './churnPredictor.js';
import { ExpansionFinderEngine } from './expansionFinder.js';
import { calculateAnnualEquivalent } from '../../src/utils/subscription.js';
import { OutcomeLearningEngine } from '../learning/outcomeLearningEngine.js';
import {
  RevenueBrainCategory,
  UnifiedRevenueOpportunity,
  RevenueBrainResponse,
  PriorityTier,
} from './types.js';

const P_TIER_RANK: Record<PriorityTier, number> = {
  P1_CRITICAL: 4,
  P2_HIGH: 3,
  P3_MEDIUM: 2,
  P4_LOW: 1,
};

const CONFIDENCE_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export class RevenueBrainEngine {
  /**
   * Generates a unified, prioritized revenue intelligence command layer.
   * Aggregates Recovery opportunities, Churn risks, and Expansion candidates
   * with 100% deterministic impact scoring and ranking.
   */
  public static async evaluateWorkspace(
    workspaceId: string,
    options: { limit?: number; category?: RevenueBrainCategory } = {}
  ): Promise<RevenueBrainResponse> {
    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new Error('Valid workspaceId is required for Revenue Brain Engine.');
    }

    // Concurrently fetch underlying intelligence engine queues and historical learning outcomes
    const [recoveryQueue, churnQueue, expansionQueue, learningSummary] = await Promise.all([
      AiOpportunityEngine.generatePrioritizedQueue(workspaceId, { enrichWithAi: false }),
      ChurnPredictorEngine.evaluateWorkspace(workspaceId),
      ExpansionFinderEngine.evaluateWorkspace(workspaceId),
      OutcomeLearningEngine.analyzeWorkspaceOutcomes(workspaceId),
    ]);

    const unifiedList: UnifiedRevenueOpportunity[] = [];

    // 1. Map RECOVERY Opportunities
    for (const rec of recoveryQueue.queue) {
      const evidenceList = rec.evidence ? rec.evidence.map((e) => `${e.label}: ${e.value}`) : [];
      
      let expectedValueCents = rec.expectedValueCents;
      let impactScore = rec.priorityScore;
      let evidenceQuality = rec.evidence && rec.evidence.length >= 3 ? 'high' : rec.evidence && rec.evidence.length >= 1 ? 'medium' : 'low';
      
      // Dynamic Outcome-Driven Optimization
      if (learningSummary.hasSufficientSample) {
        const actionTypeMap: Record<string, string> = {
          'smart_retry': 'payment_retry',
          'magic_link': 'send_hosted_link',
          'customer_outreach': 'send_hosted_link',
          'manual_review': 'operator_escalation'
        };
        const mappedType = actionTypeMap[rec.recommendedAction] || rec.recommendedAction;
        const matchingRate = learningSummary.actionSuccessRates.find(a => a.actionType === mappedType);
        
        if (matchingRate) {
          // Adjust expected recovery value using workspace-specific success rates
          expectedValueCents = Math.round(rec.amountCents * (matchingRate.successRatePercentage / 100));
          
          // Adjust impact score based on historical action performance
          if (matchingRate.successRatePercentage >= 70) {
            impactScore = Math.min(100, impactScore + 10);
            evidenceList.push(`Outcome Optimization: Action matches success pattern (${matchingRate.successRatePercentage}% success in workspace)`);
            evidenceQuality = 'high'; // Elevate evidence quality since we have real outcome backing
          } else if (matchingRate.successRatePercentage <= 20) {
            impactScore = Math.max(0, impactScore - 10);
            evidenceList.push(`Outcome Warning: Action historically has low success (${matchingRate.successRatePercentage}%). CS escalation advised`);
          } else {
            evidenceList.push(`Outcome Insights: Historical success rate for recommended action is ${matchingRate.successRatePercentage}%`);
          }
        }

        const activeChan = learningSummary.activeOptimizations?.find(o => o.type === 'channel_selection' && o.isApplied);
        if (activeChan) {
          evidenceList.push(`Active Channel Optimization: ${activeChan.whatChanged} (${activeChan.whyChosen})`);
        }
        const activeRetry = learningSummary.activeOptimizations?.find(o => o.type === 'retry_timing' && o.isApplied);
        if (activeRetry) {
          evidenceList.push(`Active Retry Timing Optimization: ${activeRetry.whatChanged} (${activeRetry.whyChosen})`);
        }
      }

      unifiedList.push({
        id: `brain_rec_${rec.opportunityId}`,
        workspaceId,
        category: 'RECOVERY',
        title: `Failed Payment Recovery (${rec.opportunityType})`,
        customerId: rec.customer.id,
        customerName: rec.customer.name,
        customerEmail: rec.customer.email,
        financialAmountCents: rec.amountCents,
        expectedValueCents,
        currency: rec.currency,
        impactScore,
        priorityTier: rec.priority,
        confidence: rec.confidence,
        evidenceQuality: evidenceQuality as 'high' | 'medium' | 'low',
        rankingExplanation: '', // Set after global sorting
        evidence: evidenceList,
        recommendedAction: rec.recommendedActionLabel,
        evaluatedAt: rec.evaluatedAt,
        sourceId: rec.opportunityId,
        sourceType: 'recovery_opportunity',
      });
    }

    // 2. Map CHURN_PREVENTION Opportunities
    for (const churn of churnQueue.queue) {
      if (churn.riskCategory === 'LOW_RISK') continue;

      const sub = churn.subscription;
      const annualVal = sub && typeof sub.amount_cents === 'number'
        ? calculateAnnualEquivalent(sub.amount_cents, sub.billing_interval || 'monthly', sub.custom_interval_count, sub.custom_interval_unit)
        : churn.customer?.lifetime_value_cents || 0;

      const expectedVal = Math.round(annualVal * (churn.riskScore / 100));
      const evidenceList = churn.evidence
        ? churn.evidence.map((e) => `${e.label}: ${e.value}`)
        : churn.mainDrivers;

      let tier: PriorityTier = 'P3_MEDIUM';
      if (churn.riskCategory === 'CRITICAL') tier = 'P1_CRITICAL';
      else if (churn.riskCategory === 'AT_RISK') tier = 'P2_HIGH';
      else if (churn.riskCategory === 'WATCH') tier = 'P3_MEDIUM';
      else tier = 'P4_LOW';

      unifiedList.push({
        id: `brain_churn_${churn.customerId}`,
        workspaceId,
        category: 'CHURN_PREVENTION',
        title: `Churn Risk Prevention (${churn.riskCategory})`,
        customerId: churn.customerId,
        customerName: churn.customerName,
        customerEmail: churn.customerEmail,
        financialAmountCents: annualVal,
        expectedValueCents: expectedVal,
        currency: churn.customer?.currency || churnQueue.currency || 'USD',
        impactScore: churn.riskScore,
        priorityTier: tier,
        confidence: churn.confidence,
        evidenceQuality: evidenceList.length >= 3 ? 'high' : evidenceList.length >= 1 ? 'medium' : 'low',
        rankingExplanation: '', // Set after global sorting
        evidence: evidenceList,
        recommendedAction: churn.recommendedIntervention,
        evaluatedAt: churn.evaluatedAt,
        sourceId: churn.customerId,
        sourceType: 'churn_risk',
      });
    }

    // 3. Map EXPANSION Opportunities
    for (const exp of expansionQueue.queue) {
      if (exp.expansionTier === 'NO_SIGNAL') continue;

      const evidenceList = exp.evidenceDetails || [];
      let tier: PriorityTier = 'P3_MEDIUM';
      let impactScore = 40;

      if (exp.expansionTier === 'EXPANSION_READY') {
        tier = 'P1_CRITICAL';
        impactScore = 85;
      } else if (exp.expansionTier === 'GROWTH_SIGNAL') {
        tier = 'P2_HIGH';
        impactScore = 65;
      } else if (exp.expansionTier === 'WATCH') {
        tier = 'P3_MEDIUM';
        impactScore = 40;
      } else {
        tier = 'P4_LOW';
        impactScore = 15;
      }

      unifiedList.push({
        id: `brain_exp_${exp.customerId}`,
        workspaceId,
        category: 'EXPANSION',
        title: `Expansion Opportunity (${exp.expansionTier})`,
        customerId: exp.customerId,
        customerName: exp.customerName,
        customerEmail: exp.customerEmail,
        financialAmountCents: exp.estimatedValueCents || 0,
        expectedValueCents: exp.estimatedValueCents || 0,
        currency: exp.currency,
        impactScore,
        priorityTier: tier,
        confidence: exp.confidence,
        evidenceQuality: exp.evidenceStatus === 'confirmed_evidence' ? 'high' : evidenceList.length >= 2 ? 'medium' : 'low',
        rankingExplanation: '', // Set after global sorting
        evidence: evidenceList,
        recommendedAction: exp.recommendedAction,
        evaluatedAt: exp.evaluatedAt,
        sourceId: exp.customerId,
        sourceType: 'expansion_opportunity',
      });
    }

    // 4. Deterministic Multi-Category Prioritization & Ranking
    unifiedList.sort((a, b) => {
      // Primary: Priority Tier Rank
      const tierDiff = P_TIER_RANK[b.priorityTier] - P_TIER_RANK[a.priorityTier];
      if (tierDiff !== 0) return tierDiff;

      // Secondary: Normalized Impact Score
      const impactDiff = b.impactScore - a.impactScore;
      if (impactDiff !== 0) return impactDiff;

      // Tertiary: Financial Amount (cents)
      const valueDiff = b.financialAmountCents - a.financialAmountCents;
      if (valueDiff !== 0) return valueDiff;

      // Quaternary: Confidence Level Rank
      const confDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      if (confDiff !== 0) return confDiff;

      // Deterministic Tie-Breaker: ID Comparison
      return a.id.localeCompare(b.id);
    });

    // 5. Annotate Deterministic Ranking Explanations
    unifiedList.forEach((item, index) => {
      const rank = index + 1;
      const formattedVal = item.financialAmountCents > 0
        ? `${(item.financialAmountCents / 100).toFixed(2)} ${item.currency}`
        : 'Unquantified';
      item.rankingExplanation = `Ranked #${rank} (${item.priorityTier}) in Revenue Brain command layer. Category: ${item.category}. Impact score: ${item.impactScore}/100. Financial value: ${formattedVal}. Confidence: ${item.confidence}.`;
    });

    // Calculate Global Response Metrics before filtering/limiting
    const totalOpportunities = unifiedList.length;
    const recoveryCount = unifiedList.filter((o) => o.category === 'RECOVERY').length;
    const churnCount = unifiedList.filter((o) => o.category === 'CHURN_PREVENTION').length;
    const expansionCount = unifiedList.filter((o) => o.category === 'EXPANSION').length;

    const p1Count = unifiedList.filter((o) => o.priorityTier === 'P1_CRITICAL').length;
    const p2Count = unifiedList.filter((o) => o.priorityTier === 'P2_HIGH').length;
    const p3Count = unifiedList.filter((o) => o.priorityTier === 'P3_MEDIUM').length;
    const p4Count = unifiedList.filter((o) => o.priorityTier === 'P4_LOW').length;

    const totalAtRiskCents = unifiedList
      .filter((o) => o.category === 'RECOVERY' || o.category === 'CHURN_PREVENTION')
      .reduce((sum, o) => sum + o.financialAmountCents, 0);

    const totalRecoverableCents = unifiedList
      .filter((o) => o.category === 'RECOVERY')
      .reduce((sum, o) => sum + o.expectedValueCents, 0);

    const totalExpansionValueCents = unifiedList
      .filter((o) => o.category === 'EXPANSION')
      .reduce((sum, o) => sum + o.financialAmountCents, 0);

    // Apply category filter if specified
    let filteredList = unifiedList;
    if (options.category) {
      filteredList = filteredList.filter((o) => o.category === options.category);
    }

    // Apply limit if specified
    if (options.limit && options.limit > 0) {
      filteredList = filteredList.slice(0, options.limit);
    }

    const outcomeOptimizationSummary = {
      hasSufficientSample: learningSummary.hasSufficientSample,
      evidenceStatements: learningSummary.evidenceStatements || [],
      recommendations: learningSummary.optimizationRecommendations
        ? learningSummary.optimizationRecommendations.map(r => `${r.recommendation} — ${r.evidence}`)
        : []
    };

    const activeOptimizations = (learningSummary.activeOptimizations || []).map((opt) => ({
      type: opt.type,
      target: opt.target,
      whatChanged: opt.whatChanged,
      whyOptimizationWasChosen: opt.whyChosen,
      historicalEvidence: opt.evidence,
      confidenceLevel: opt.confidenceLevel,
      confidenceScore: opt.confidenceScore,
      sampleSize: opt.sampleSize,
      isApplied: opt.isApplied,
    }));

    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      totalOpportunities,
      totalAtRiskCents,
      totalRecoverableCents,
      totalExpansionValueCents,
      summary: {
        recoveryCount,
        churnCount,
        expansionCount,
        p1Count,
        p2Count,
        p3Count,
        p4Count,
      },
      opportunities: filteredList,
      outcomeOptimizationSummary,
      activeOptimizations,
    };
  }
}
