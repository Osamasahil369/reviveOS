import { GoogleGenAI } from '@google/genai';
import { Customer, RecoveryOpportunity, Subscription } from '../../src/types/index.js';
import { AiEnrichmentResult, AiStatus, OpportunityType, PriorityTier, RecommendedActionType } from './types.js';
import { OPPORTUNITY_SCORING_VERSION } from './scoringEngine.js';

export class AiOpportunityEnricher {
  private static geminiClient: GoogleGenAI | null = null;
  private static enrichmentCache = new Map<string, AiEnrichmentResult>();

  private static getClient(): GoogleGenAI | null {
    if (this.geminiClient) return this.geminiClient;
    // Rule: Server-side Gemini API key must use process.env.GEMINI_API_KEY only. Never VITE_GEMINI_API_KEY.
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim() !== '' && !apiKey.includes('placeholder')) {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey });
        return this.geminiClient;
      } catch (err) {
        console.warn('[AI Opportunity Enricher] Failed to initialize GoogleGenAI client:', err);
      }
    }
    return null;
  }

  private static validateAiResponse(raw: any): boolean {
    if (!raw || typeof raw !== 'object') return false;
    if (typeof raw.operatorSummary !== 'string' || !raw.operatorSummary.trim() || raw.operatorSummary.length > 500) return false;
    if (typeof raw.contextualReasoning !== 'string' || !raw.contextualReasoning.trim() || raw.contextualReasoning.length > 700) return false;
    
    const cs = raw.communicationStrategy;
    if (!cs || typeof cs !== 'object') return false;

    const validChannels = ['email', 'sms', 'hosted_portal', 'manual_call'];
    if (!validChannels.includes(cs.recommendedChannel)) return false;

    const validTones = ['empathetic_direct', 'courteous_reminder', 'executive_concierge', 'urgent_security'];
    if (!validTones.includes(cs.suggestedTone)) return false;

    if (cs.suggestedSubject !== undefined && (typeof cs.suggestedSubject !== 'string' || cs.suggestedSubject.length > 180)) {
      return false;
    }

    if (!Array.isArray(cs.keyTalkingPoints) || cs.keyTalkingPoints.length > 5) return false;
    for (const point of cs.keyTalkingPoints) {
      if (typeof point !== 'string' || point.length > 200) return false;
    }

    // Prohibited fields check: AI cannot override financial/deterministic values
    if ('amount' in raw || 'currency' in raw || 'priority' in raw || 'expectedValue' in raw || 'likelihoodScore' in raw || 'recommendedAction' in raw) {
      return false;
    }

    return true;
  }

  public static async enrich(
    workspaceId: string,
    opp: RecoveryOpportunity,
    customer: Customer,
    details: {
      opportunityType: OpportunityType;
      priority: PriorityTier;
      priorityScore: number;
      amountCents: number;
      currency: string;
      reason: string;
      recommendedAction: RecommendedActionType;
      daysOverdue: number | null;
      subscription?: Subscription;
    }
  ): Promise<AiEnrichmentResult> {
    const updatedAt = opp.updated_at || opp.created_at || 'current';
    const cacheKey = `${workspaceId}_${opp.id}_${updatedAt}_${OPPORTUNITY_SCORING_VERSION}_${details.priorityScore}`;
    if (this.enrichmentCache.has(cacheKey)) {
      return this.enrichmentCache.get(cacheKey)!;
    }

    const deterministicFallback = this.buildDeterministicEnrichment(opp, customer, details);

    const client = this.getClient();
    if (!client) {
      return {
        ...deterministicFallback,
        aiStatus: 'unavailable',
        failureReason: 'Missing or unconfigured GEMINI_API_KEY environment variable',
      };
    }

    try {
      // Strict AI Data Boundary: Exclude customer email, phone, credentials, webhooks, private notes.
      const prompt = `You are the executive AI Opportunity Intelligence Engine for ReviveOS, an enterprise revenue recovery operating system.
Analyze the following authentic financial opportunity data and provide a concise JSON object.
CRITICAL: Do NOT invent facts or hallucinate any numbers or history not provided below.

DATA:
- Customer Display Name: "${customer.name}"
- Opportunity Type: "${details.opportunityType}"
- Amount: "${(details.amountCents / 100).toFixed(2)} ${details.currency}"
- Priority: "${details.priority}" (Score: ${details.priorityScore}/100)
- Failure Category: "${opp.failure_category}"
- Days Overdue: ${details.daysOverdue !== null ? details.daysOverdue : 'Unknown'}
- Recommended Action: "${details.recommendedAction}"
- Subscription Plan: "${details.subscription?.plan_name || 'Not available'}"

OUTPUT JSON SCHEMA:
{
  "operatorSummary": "1-2 sentence executive summary for the financial operations team",
  "communicationStrategy": {
    "recommendedChannel": "email" | "sms" | "hosted_portal" | "manual_call",
    "suggestedSubject": "Subject line for customer message",
    "suggestedTone": "empathetic_direct" | "courteous_reminder" | "executive_concierge" | "urgent_security",
    "keyTalkingPoints": ["Point 1", "Point 2", "Point 3"]
  },
  "contextualReasoning": "1-2 sentence explanation of why this specific action and timing are effective"
}`;

      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const text = response.text?.trim();
      if (text) {
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          return {
            ...deterministicFallback,
            aiStatus: 'fallback',
            failureReason: 'Malformed JSON output from AI model',
          };
        }

        if (!this.validateAiResponse(parsed)) {
          return {
            ...deterministicFallback,
            aiStatus: 'fallback',
            failureReason: 'AI response failed runtime schema or constraint validation',
          };
        }

        const result: AiEnrichmentResult = {
          operatorSummary: parsed.operatorSummary,
          communicationStrategy: {
            recommendedChannel: parsed.communicationStrategy.recommendedChannel,
            suggestedSubject: parsed.communicationStrategy.suggestedSubject,
            suggestedTone: parsed.communicationStrategy.suggestedTone,
            keyTalkingPoints: parsed.communicationStrategy.keyTalkingPoints,
          },
          contextualReasoning: parsed.contextualReasoning,
          isAiGenerated: true,
          aiStatus: 'generated',
          generatedAt: new Date().toISOString(),
          modelUsed: 'gemini-2.5-flash',
        };

        this.enrichmentCache.set(cacheKey, result);
        return result;
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota exceeded');
      const aiStatus: AiStatus = isRateLimit ? 'unavailable' : 'failed';
      console.warn(`[AI Opportunity Enricher] AI generation ${aiStatus}:`, errMsg);

      return {
        ...deterministicFallback,
        aiStatus,
        failureReason: errMsg,
      };
    }

    return {
      ...deterministicFallback,
      aiStatus: 'fallback',
      failureReason: 'Empty response received from AI model',
    };
  }

  private static buildDeterministicEnrichment(
    opp: RecoveryOpportunity,
    customer: Customer,
    details: {
      opportunityType: OpportunityType;
      priority: PriorityTier;
      amountCents: number;
      currency: string;
      reason: string;
      recommendedAction: RecommendedActionType;
      daysOverdue: number | null;
    }
  ): AiEnrichmentResult {
    const formattedAmount = `${(details.amountCents / 100).toFixed(2)} ${details.currency}`;

    if (details.opportunityType === 'renewal_risk') {
      return {
        operatorSummary: `Proactive renewal verification for ${customer.name} to preserve ${formattedAmount} recurring ARR.`,
        communicationStrategy: {
          recommendedChannel: 'email',
          suggestedSubject: `Upcoming Subscription Renewal - ${customer.name}`,
          suggestedTone: 'courteous_reminder',
          keyTalkingPoints: [
            `Verify active billing credentials prior to next cycle renewal`,
            `Confirm uninterrupted access to core subscription benefits`,
            `Provide self-serve portal link for instantaneous payment method updates`,
          ],
        },
        contextualReasoning: `Prioritize the configured recovery action based on current billing evidence to ensure subscription continuity.`,
        isAiGenerated: false,
        aiStatus: 'unavailable',
        generatedAt: new Date().toISOString(),
      };
    }

    if (details.opportunityType === 'churn_risk') {
      return {
        operatorSummary: `Account health drop detected on ${customer.name}. High-priority concierge intervention recommended.`,
        communicationStrategy: {
          recommendedChannel: 'email',
          suggestedSubject: `Important update regarding your account access`,
          suggestedTone: 'executive_concierge',
          keyTalkingPoints: [
            `Acknowledge subscriber relationship and tenure status`,
            `Offer direct operator support to resolve outstanding billing friction`,
            `Ensure continuity of critical workspace workflows`,
          ],
        },
        contextualReasoning: `High customer lifetime value warrants direct human engagement according to configured risk rules.`,
        isAiGenerated: false,
        aiStatus: 'unavailable',
        generatedAt: new Date().toISOString(),
      };
    }

    if (opp.failure_category === 'insufficient_funds') {
      return {
        operatorSummary: `Soft card decline of ${formattedAmount} on ${customer.name}. Recommended recovery action is scheduled automated retry.`,
        communicationStrategy: {
          recommendedChannel: 'hosted_portal',
          suggestedSubject: `Payment update for your subscription`,
          suggestedTone: 'empathetic_direct',
          keyTalkingPoints: [
            `Automated retry scheduled according to gateway policy`,
            `No immediate customer action required unless second attempt declines`,
            `Direct link provided to update primary card if preferred`,
          ],
        },
        contextualReasoning: `Insufficient funds declines perform best when re-attempted during morning banking hours or supported by self-serve update.`,
        isAiGenerated: false,
        aiStatus: 'unavailable',
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      operatorSummary: `Uncollected balance of ${formattedAmount} for ${customer.name}. Dynamic hosted link recommended.`,
      communicationStrategy: {
        recommendedChannel: 'email',
        suggestedSubject: `Action Required: Update payment method for ${customer.name}`,
        suggestedTone: 'empathetic_direct',
        keyTalkingPoints: [
          `Payment decline notice with zero-friction update link`,
          `1-click secure token replacement via hosted recovery portal`,
          `Grace period active to ensure uninterrupted platform service`,
        ],
      },
      contextualReasoning: `Direct 1-click token update link provides reliable time-to-recovery for expired or declined credit cards.`,
      isAiGenerated: false,
      aiStatus: 'unavailable',
      generatedAt: new Date().toISOString(),
    };
  }
}
