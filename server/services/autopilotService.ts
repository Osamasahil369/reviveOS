import crypto from 'crypto';
import { db } from '../store/db.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { supabaseService } from '../db/supabaseService.js';
import { RevenueLeakScanner } from '../scanner/revenueScanner.js';
import { CopilotOrchestrator } from '../copilot/copilotOrchestrator.js';
import { AutopilotSettings, AutomationEventRecord, ProviderType, RecoveryOpportunity, PolicyEvaluationResult } from '../../src/types/index.js';
import { AutopilotPolicyEngine } from './autopilotPolicyEngine.js';
import { AutonomousRecoveryEngine } from './autonomousRecoveryEngine.js';
import { RecoveryDispatchEngine } from './recoveryDispatchEngine.js';

export const DEFAULT_AUTOPILOT_SETTINGS: AutopilotSettings = {
  auto_scans_enabled: true,
  auto_plans_enabled: true,
  auto_retry_scheduling_enabled: false,
  pause_all_automation: false,
  auto_recover_limit_cents: 50000, // $500
  auto_recover_preset: '500',
  vip_customer_protection: true,
  enterprise_account_protection: true,
};

export { AutopilotPolicyEngine };

export class AutopilotService {
  /**
   * Retrieves deterministic autopilot settings for the designated workspace.
   */
  public static getSettings(workspaceId: string): AutopilotSettings {
    if (!workspaceId) return { ...DEFAULT_AUTOPILOT_SETTINGS };

    if (isSupabaseAuthoritative()) {
      return db.getAutopilotSettings(workspaceId);
    }
    return db.getAutopilotSettings(workspaceId);
  }

  /**
   * Updates autopilot configuration for the workspace.
   */
  public static updateSettings(
    workspaceId: string,
    updates: Partial<AutopilotSettings>
  ): AutopilotSettings {
    if (!workspaceId) throw new Error('workspaceId is required to update autopilot settings');
    return db.updateAutopilotSettings(workspaceId, updates);
  }

  /**
   * Records a read-only audit log entry in the automation events ledger.
   */
  public static recordEvent(
    workspaceId: string,
    event: {
      event: string;
      trigger: string;
      status?: 'completed' | 'running' | 'failed' | 'paused' | 'skipped';
      timestamp?: string;
      details?: Record<string, any>;
    }
  ): AutomationEventRecord {
    return db.recordAutomationEvent(workspaceId, event);
  }

  /**
   * Retrieves read-only automation event history for the workspace.
   */
  public static getEvents(workspaceId: string): AutomationEventRecord[] {
    return db.getAutomationEvents(workspaceId);
  }

  /**
   * Triggered immediately when a payment provider connection status becomes 'connected'.
   * 1. Records 'Provider Connected' event.
   * 2. Checks if auto-scans are enabled and automation is not paused.
   * 3. Triggers RevenueLeakScanner in background or synchronously.
   * 4. Ensures no duplicate opportunities (built-in scanner idempotency).
   */
  public static async handleProviderConnected(
    workspaceId: string,
    providerType: ProviderType,
    connectionDetails?: any
  ): Promise<{ scanTriggered: boolean; scanResult?: any }> {
    // 1. Log Provider Connected event
    this.recordEvent(workspaceId, {
      event: 'Provider Connected',
      trigger: `${providerType.toUpperCase()} Gateway Integration`,
      status: 'completed',
      details: {
        provider: providerType,
        account_id: connectionDetails?.config_summary?.account_id || connectionDetails?.id,
        is_live: connectionDetails?.is_live ?? false,
      },
    });

    const settings = this.getSettings(workspaceId);

    // Guard: Check if automation is paused
    if (settings.pause_all_automation) {
      this.recordEvent(workspaceId, {
        event: 'Revenue Scan Skipped',
        trigger: 'Provider Connected',
        status: 'paused',
        details: { reason: 'Pause All Automation master switch is ON' },
      });
      return { scanTriggered: false };
    }

    // Guard: Check if automatic revenue scans are enabled
    if (!settings.auto_scans_enabled) {
      this.recordEvent(workspaceId, {
        event: 'Revenue Scan Skipped',
        trigger: 'Provider Connected',
        status: 'skipped',
        details: { reason: 'Automatic Revenue Scans is configured OFF' },
      });
      return { scanTriggered: false };
    }

    // 2. Trigger Authoritative Revenue Scan
    this.recordEvent(workspaceId, {
      event: 'Revenue Scan Started',
      trigger: `Provider Connected (${providerType.toUpperCase()})`,
      status: 'completed',
      details: { provider: providerType },
    });

    try {
      const scanResult = await RevenueLeakScanner.executeScan(workspaceId, {});

      // For every newly created opportunity, ensure recovery link and plan are generated
      if (scanResult.createdOpportunities && scanResult.createdOpportunities.length > 0) {
        for (const opp of scanResult.createdOpportunities) {
          await this.onOpportunityCreated(workspaceId, opp);
        }
      }

      return {
        scanTriggered: true,
        scanResult,
      };
    } catch (err: any) {
      this.recordEvent(workspaceId, {
        event: 'Revenue Scan Failed',
        trigger: 'Provider Connected',
        status: 'failed',
        details: { error: err.message },
      });
      return { scanTriggered: false };
    }
  }

  /**
   * Generates or retrieves a secure 1-click recovery payment link.
   * Deterministic, reuses existing tokens, enforces no duplicate links.
   */
  public static ensureOpportunityRecoveryLink(
    workspaceId: string,
    opportunity: Partial<RecoveryOpportunity>
  ): { token: string; link: string; isNew: boolean } {
    if (opportunity.recovery_token && opportunity.payment_link_url) {
      return {
        token: opportunity.recovery_token,
        link: opportunity.payment_link_url,
        isNew: false,
      };
    }

    const rawToken = opportunity.recovery_token || crypto.randomBytes(32).toString('hex');
    const tokenHash = (opportunity as any).token_hash || crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = (opportunity as any).token_expires_at || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const link = opportunity.payment_link_url || `/pay/${rawToken}`;

    opportunity.recovery_token = rawToken;
    (opportunity as any).token_hash = tokenHash;
    (opportunity as any).token_expires_at = expiresAt;
    opportunity.payment_link_url = link;

    if (opportunity.id) {
      this.recordEvent(workspaceId, {
        event: 'Recovery Link Created',
        trigger: 'Opportunity Created',
        status: 'completed',
        details: {
          opportunity_id: opportunity.id,
          payment_link_url: link,
          expires_at: expiresAt,
        },
      });
    }

    return { token: rawToken, link, isNew: true };
  }

  /**
   * Automatically generates and stores a Recovery Action Plan for an opportunity.
   * No manual user click required.
   */
  public static async generateOpportunityRecoveryPlan(
    workspaceId: string,
    opportunityId: string
  ): Promise<any> {
    const settings = this.getSettings(workspaceId);

    if (settings.pause_all_automation) {
      this.recordEvent(workspaceId, {
        event: 'Recovery Plan Skipped',
        trigger: 'Payment Failure Ingestion',
        status: 'paused',
        details: { opportunity_id: opportunityId, reason: 'Pause All Automation is ON' },
      });
      return null;
    }

    if (!settings.auto_plans_enabled) {
      this.recordEvent(workspaceId, {
        event: 'Recovery Plan Skipped',
        trigger: 'Payment Failure Ingestion',
        status: 'skipped',
        details: { opportunity_id: opportunityId, reason: 'Automatic Recovery Plans is configured OFF' },
      });
      return null;
    }

    try {
      const plan = await CopilotOrchestrator.getOrGeneratePlan(workspaceId, opportunityId);

      // Attach plan to stored opportunity in database
      const opp = db.getOpportunityById(opportunityId, workspaceId);
      if (opp) {
        opp.recovery_plan = plan;
      }

      this.recordEvent(workspaceId, {
        event: 'Recovery Plan Generated',
        trigger: 'Payment Failure Ingestion',
        status: 'completed',
        details: {
          opportunity_id: opportunityId,
          plan_id: plan.id,
          strategy: plan.strategyType,
          steps_count: plan.recommendedSteps?.length || 0,
        },
      });

      return plan;
    } catch (err: any) {
      this.recordEvent(workspaceId, {
        event: 'Recovery Plan Generation Failed',
        trigger: 'Payment Failure Ingestion',
        status: 'failed',
        details: { opportunity_id: opportunityId, error: err.message },
      });
      return null;
    }
  }

  /**
   * Hook called whenever a failed payment or opportunity enters the system.
   * Automatically provisions secure recovery link, recovery plan, and performs policy arbitration.
   */
  public static async onOpportunityCreated(
    workspaceId: string,
    opportunity: RecoveryOpportunity
  ): Promise<void> {
    // 1. Automatic Recovery Link Generation
    this.ensureOpportunityRecoveryLink(workspaceId, opportunity);

    // 2. Automatic Policy Arbitration
    try {
      const customer = db.getCustomerById(opportunity.customer_id, workspaceId) || opportunity.customer;
      const workspace = db.getWorkspace(workspaceId);
      const settings = this.getSettings(workspaceId);

      const decisionResult = AutopilotPolicyEngine.evaluate(opportunity, customer, workspace, settings);
      opportunity.policy_decision = decisionResult;

      // Persist in policy audit log
      AutopilotPolicyEngine.recordAuditEntry(workspaceId, {
        opportunity_id: opportunity.id,
        customer_id: opportunity.customer_id,
        rule_evaluated: decisionResult.rule_evaluated,
        decision: decisionResult.decision,
        reason: decisionResult.reason,
        timestamp: decisionResult.timestamp,
        metadata: decisionResult.metadata,
      });

      // Record high-level automation event
      this.recordEvent(workspaceId, {
        event: 'Policy Evaluated',
        trigger: 'Opportunity Ingestion',
        status: decisionResult.decision === 'BLOCKED' ? 'failed' : decisionResult.decision === 'MANUAL_REVIEW' ? 'paused' : 'completed',
        details: {
          opportunity_id: opportunity.id,
          decision: decisionResult.decision,
          rule: decisionResult.rule_evaluated,
          reason: decisionResult.reason,
        },
      });
      // 3. Autonomous Execution: Only AUTONOMOUS opportunities enter automated recovery!
      if (decisionResult.decision === 'AUTONOMOUS' && opportunity.id) {
        const autoResult = await AutonomousRecoveryEngine.processOpportunity(workspaceId, opportunity.id);
        if (autoResult && autoResult.executed && autoResult.workflow) {
          await RecoveryDispatchEngine.dispatchWorkflow(workspaceId, autoResult.workflow.id);
        }
      }
    } catch (err: any) {
      console.warn('Policy evaluation failed during opportunity ingestion', err);
    }

    // 4. Automatic Recovery Plan Generation
    if (opportunity.id) {
      await this.generateOpportunityRecoveryPlan(workspaceId, opportunity.id);
    }
  }
}
