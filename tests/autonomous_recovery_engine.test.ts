import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { AutonomousRecoveryEngine } from '../server/services/autonomousRecoveryEngine.js';
import { AutopilotService, DEFAULT_AUTOPILOT_SETTINGS } from '../server/services/autopilotService.js';
import { AutopilotPolicyEngine } from '../server/services/autopilotPolicyEngine.js';
import {
  Customer,
  RecoveryOpportunity,
  Workspace,
  AutonomousWorkflowState,
  AutonomousRecoveryOutcome,
} from '../src/types/index.js';

async function runAutonomousRecoveryEngineTests() {
  console.log('======================================================');
  console.log('REVIVEOS: AUTONOMOUS RECOVERY ENGINE PHASE 1 TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  const timestamp = Date.now();

  // Setup test workspaces for multi-tenant verification
  const ws1 = db.createWorkspace(`Tenant Alpha Recovery ${timestamp}`, 'saas', 'USD');
  const wsId1 = ws1.id;

  const ws2 = db.createWorkspace(`Tenant Beta Recovery ${timestamp}`, 'saas', 'USD');
  const wsId2 = ws2.id;

  // Helper to create customer and invoice failure with opportunity
  function createTestFixture(
    wsId: string,
    customerData: {
      name: string;
      email: string;
      is_vip?: boolean;
      is_enterprise?: boolean;
      is_high_risk?: boolean;
    },
    failureData: {
      amountCents: number;
      providerFailureCode?: string;
      rawErrorMessage?: string;
      is_fraud?: boolean;
      is_chargeback?: boolean;
      has_active_dispute?: boolean;
    }
  ) {
    const customer = db.createCustomer(wsId, {
      name: customerData.name,
      email: customerData.email,
      country: 'US',
      currency: 'USD',
      provider_type: 'stripe',
      is_vip: customerData.is_vip,
      is_enterprise: customerData.is_enterprise,
      is_high_risk: customerData.is_high_risk,
    });

    const { opportunity, failure, invoice } = db.createManualFailedInvoice(wsId, {
      customerId: customer.id,
      amountCents: failureData.amountCents,
      currency: 'USD',
      providerFailureCode: failureData.providerFailureCode || 'insufficient_funds',
      rawErrorMessage: failureData.rawErrorMessage || 'Insufficient funds on card',
    });

    if (failureData.is_fraud !== undefined) opportunity.is_fraud = failureData.is_fraud;
    if (failureData.is_chargeback !== undefined) opportunity.is_chargeback = failureData.is_chargeback;
    if (failureData.has_active_dispute !== undefined) {
      opportunity.has_active_dispute = failureData.has_active_dispute;
      opportunity.dispute_status = failureData.has_active_dispute ? 'active' : 'none';
    }

    return { customer, opportunity, failure, invoice };
  }

  // -------------------------------------------------------------
  // Test 1: Autonomous opportunities create workflows
  // -------------------------------------------------------------
  console.log('1. Testing Autonomous Opportunities Create Workflows...');
  {
    // Standard soft decline under limit ($120 < $500 default)
    const { customer, opportunity } = createTestFixture(
      wsId1,
      {
        name: 'Acme SaaS Client',
        email: `billing_${timestamp}@acmesaas.com`,
        is_vip: false,
        is_enterprise: false,
      },
      {
        amountCents: 12000,
        providerFailureCode: 'insufficient_funds',
        rawErrorMessage: 'Insufficient balance on card',
      }
    );

    const result = await AutonomousRecoveryEngine.processOpportunity(wsId1, opportunity.id);
    assert.strictEqual(result.executed, true, 'Autonomous opportunity must execute workflow');
    assert.ok(result.workflow, 'Result must contain created workflow');
    assert.strictEqual(result.workflow.workspace_id, wsId1);
    assert.strictEqual(result.workflow.opportunity_id, opportunity.id);
    assert.strictEqual(result.workflow.customer_id, customer.id);
    assert.strictEqual(result.workflow.state, 'scheduled');
    assert.strictEqual(result.workflow.outcome, 'pending');
    assert.strictEqual(result.workflow.amount_at_risk_cents, 12000);
    assert.strictEqual(result.workflow.policy_decision, 'AUTONOMOUS');

    // Verify recovery link delivery preparation (does NOT send emails yet)
    assert.ok(result.workflow.delivery_preparation, 'Delivery preparation must exist');
    assert.strictEqual(result.workflow.delivery_preparation.status, 'ready');
    assert.strictEqual(result.workflow.delivery_preparation.delivery_channel, 'email');
    assert.ok(
      result.workflow.delivery_preparation.recovery_link_url.includes('recover') ||
        result.workflow.delivery_preparation.recovery_link_url.includes('pay') ||
        result.workflow.delivery_preparation.recovery_link_url.includes('portal'),
      'Must generate a secure recovery link'
    );
    assert.ok(result.workflow.delivery_preparation.message_subject.length > 0, 'Must generate message subject');
    assert.ok(result.workflow.delivery_preparation.message_preview.length > 0, 'Must generate message preview');

    // Verify Retry Cadence: Day 1, Day 3, Day 5 (Max 3 Retries)
    const schedules = result.workflow.retry_schedules;
    assert.strictEqual(schedules.length, 3, 'Must schedule exactly 3 retry attempts');
    assert.strictEqual(schedules[0].attempt_number, 1);
    assert.strictEqual(schedules[1].attempt_number, 2);
    assert.strictEqual(schedules[2].attempt_number, 3);

    const now = Date.now();
    const day1Diff = (new Date(schedules[0].scheduled_for).getTime() - now) / (1000 * 60 * 60 * 24);
    const day3Diff = (new Date(schedules[1].scheduled_for).getTime() - now) / (1000 * 60 * 60 * 24);
    const day5Diff = (new Date(schedules[2].scheduled_for).getTime() - now) / (1000 * 60 * 60 * 24);

    assert.ok(Math.abs(day1Diff - 1) < 0.1, `Retry 1 must be scheduled ~1 day out, got ${day1Diff.toFixed(2)}`);
    assert.ok(Math.abs(day3Diff - 3) < 0.1, `Retry 2 must be scheduled ~3 days out, got ${day3Diff.toFixed(2)}`);
    assert.ok(Math.abs(day5Diff - 5) < 0.1, `Retry 3 must be scheduled ~5 days out, got ${day5Diff.toFixed(2)}`);

    // Verify initial timeline entry
    assert.ok(result.workflow.timeline.length >= 1, 'Timeline must record initialization');
    assert.ok(result.workflow.timeline[0].details?.includes('Day 1, Day 3, and Day 5'));

    console.log('✓ Autonomous opportunity successfully created workflow with 3 scheduled retries and link delivery preparation.');
  }

  // -------------------------------------------------------------
  // Test 2: Manual Review opportunities never execute
  // -------------------------------------------------------------
  console.log('2. Testing Manual Review Opportunities Never Execute...');
  {
    // A. VIP customer
    const { customer: vipCustomer, opportunity: oppVip } = createTestFixture(
      wsId1,
      {
        name: 'VIP Executive Account',
        email: `vip_${timestamp}@exec.org`,
        is_vip: true,
      },
      {
        amountCents: 10000,
        providerFailureCode: 'insufficient_funds',
        rawErrorMessage: 'Insufficient balance',
      }
    );

    const vipResult = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppVip.id);
    assert.strictEqual(vipResult.executed, false, 'VIP customer opportunity must NOT execute automatically');
    assert.ok(vipResult.reason.includes('MANUAL_REVIEW'), 'Must cite MANUAL_REVIEW policy decision');
    const existingWf = db.getAutonomousWorkflowByOpportunityId(wsId1, oppVip.id);
    assert.strictEqual(existingWf, undefined, 'No workflow record should exist for manual review case');

    // B. Exceeds workspace limit ($750 > $500 default)
    const { customer: custStd, opportunity: oppHighAmount } = createTestFixture(
      wsId1,
      {
        name: 'Big Ticket Customer',
        email: `big_${timestamp}@ticket.com`,
        is_vip: false,
        is_enterprise: false,
      },
      {
        amountCents: 75000, // $750 > $500 threshold
        providerFailureCode: 'insufficient_funds',
        rawErrorMessage: 'Insufficient balance',
      }
    );

    const highAmtResult = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppHighAmount.id);
    assert.strictEqual(highAmtResult.executed, false, 'Above threshold opportunity must NOT execute automatically');
    assert.ok(highAmtResult.reason.includes('MANUAL_REVIEW'));

    // C. Enterprise customer protection
    const { customer: enterpriseCustomer, opportunity: oppEnterprise } = createTestFixture(
      wsId1,
      {
        name: 'Global Enterprise Corp',
        email: `procurement_${timestamp}@corp.org`,
        is_enterprise: true,
      },
      {
        amountCents: 5000,
        providerFailureCode: 'insufficient_funds',
        rawErrorMessage: 'Temporary bank issue',
      }
    );

    const entResult = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppEnterprise.id);
    assert.strictEqual(entResult.executed, false, 'Enterprise customer opportunity must NOT execute automatically');
    assert.ok(entResult.reason.includes('MANUAL_REVIEW'));

    console.log('✓ Verified: VIP, enterprise, and threshold exceeded opportunities remain untouched.');
  }

  // -------------------------------------------------------------
  // Test 3: Blocked opportunities never execute
  // -------------------------------------------------------------
  console.log('3. Testing Blocked Opportunities Never Execute...');
  {
    // A. Fraud
    const { opportunity: oppFraud } = createTestFixture(
      wsId1,
      {
        name: 'Fraud Suspect',
        email: `fraud_${timestamp}@bad.com`,
      },
      {
        amountCents: 2500,
        providerFailureCode: 'fraudulent',
        rawErrorMessage: 'Stripe flagged transaction as high risk fraud',
        is_fraud: true,
      }
    );

    const fraudResult = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppFraud.id);
    assert.strictEqual(fraudResult.executed, false, 'Fraud opportunities must be BLOCKED');
    assert.ok(fraudResult.reason.includes('BLOCKED'));
    assert.strictEqual(db.getAutonomousWorkflowByOpportunityId(wsId1, oppFraud.id), undefined);

    // B. Active dispute / chargeback
    const { opportunity: oppDispute } = createTestFixture(
      wsId1,
      {
        name: 'Disputed Buyer',
        email: `dispute_${timestamp}@chargeback.com`,
      },
      {
        amountCents: 5000,
        providerFailureCode: 'chargeback',
        rawErrorMessage: 'Customer initiated chargeback',
        has_active_dispute: true,
      }
    );

    const disputeResult = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppDispute.id);
    assert.strictEqual(disputeResult.executed, false, 'Disputed opportunities must be BLOCKED');
    assert.ok(disputeResult.reason.includes('BLOCKED'));

    // C. Stolen card
    const { opportunity: oppStolen } = createTestFixture(
      wsId1,
      {
        name: 'Stolen Cardholder',
        email: `stolen_${timestamp}@victim.com`,
      },
      {
        amountCents: 3000,
        providerFailureCode: 'stolen_card',
        rawErrorMessage: 'Do not honor - stolen card',
      }
    );

    const stolenResult = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppStolen.id);
    assert.strictEqual(stolenResult.executed, false, 'Stolen card opportunities must be BLOCKED');
    assert.ok(stolenResult.reason.includes('BLOCKED'));

    console.log('✓ Verified: Fraud, stolen cards, and disputes are strictly blocked and never execute.');
  }

  // -------------------------------------------------------------
  // Test 4: Retry schedules are unique and deduplicated
  // -------------------------------------------------------------
  console.log('4. Testing Retry Schedules are Unique and Deduplicated...');
  {
    const { opportunity: oppDedup } = createTestFixture(
      wsId1,
      {
        name: 'Dedup Tester Customer',
        email: `dedup_${timestamp}@testing.com`,
      },
      {
        amountCents: 8000,
        providerFailureCode: 'insufficient_funds',
        rawErrorMessage: 'Temporary insufficient funds',
      }
    );

    // Initial run creates workflow + 3 retry schedules
    const firstRun = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppDedup.id);
    assert.strictEqual(firstRun.executed, true);
    const initialWorkflowId = firstRun.workflow!.id;

    const initialRetries = db.getAutonomousRetrySchedules(wsId1, initialWorkflowId);
    assert.strictEqual(initialRetries.length, 3);

    // Ensure all retry schedule IDs are unique
    const idSet = new Set(initialRetries.map((r) => r.id));
    assert.strictEqual(idSet.size, 3, 'All scheduled retries must have unique IDs');

    // Second run with the same opportunity must NOT duplicate workflow or retries
    const secondRun = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppDedup.id);
    assert.strictEqual(secondRun.executed, false, 'Second run must not re-execute');
    assert.ok(secondRun.reason.includes('already created'));
    assert.strictEqual(secondRun.workflow?.id, initialWorkflowId);

    const retriesAfterDuplicateCall = db.getAutonomousRetrySchedules(wsId1, initialWorkflowId);
    assert.strictEqual(retriesAfterDuplicateCall.length, 3, 'Retry schedules must not be duplicated');

    console.log('✓ Verified: Workflow deduplication and retry schedule uniqueness.');
  }

  // -------------------------------------------------------------
  // Test 5: Pause Automation halts execution
  // -------------------------------------------------------------
  console.log('5. Testing Pause Automation Halts Execution...');
  {
    const { opportunity: oppPause } = createTestFixture(
      wsId1,
      {
        name: 'Pause Customer',
        email: `pause_${timestamp}@test.com`,
      },
      {
        amountCents: 9900,
        providerFailureCode: 'insufficient_funds',
        rawErrorMessage: 'Insufficient balance',
      }
    );

    // Turn ON Pause All Automation
    db.updateAutopilotSettings(wsId1, { pause_all_automation: true });
    const settings = AutopilotService.getSettings(wsId1);
    assert.strictEqual(settings.pause_all_automation, true);

    const resultPaused = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppPause.id);
    assert.strictEqual(resultPaused.executed, false, 'Must halt execution when Pause All Automation is enabled');
    assert.ok(resultPaused.reason.includes('Pause All Automation'), 'Reason must mention pause switch');
    assert.strictEqual(db.getAutonomousWorkflowByOpportunityId(wsId1, oppPause.id), undefined);

    // Unpause and verify it can now execute
    db.updateAutopilotSettings(wsId1, { pause_all_automation: false });
    const resultUnpaused = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppPause.id);
    assert.strictEqual(resultUnpaused.executed, true, 'Execution proceeds when automation is unpaused');
    assert.ok(resultUnpaused.workflow);

    console.log('✓ Verified: Master Pause switch instantly halts automated workflow creation.');
  }

  // -------------------------------------------------------------
  // Test 6: Multi-Tenant Isolation
  // -------------------------------------------------------------
  console.log('6. Testing Multi-Tenant Isolation...');
  {
    // Opportunity in Tenant Beta (wsId2)
    const { opportunity: oppBeta } = createTestFixture(
      wsId2,
      {
        name: 'Tenant Beta Client',
        email: `client_${timestamp}@beta.com`,
      },
      {
        amountCents: 15000,
        providerFailureCode: 'insufficient_funds',
        rawErrorMessage: 'Insufficient funds',
      }
    );

    const betaRun = await AutonomousRecoveryEngine.processOpportunity(wsId2, oppBeta.id);
    assert.strictEqual(betaRun.executed, true);
    const betaWfId = betaRun.workflow!.id;

    // Tenant Alpha (wsId1) MUST NOT see Tenant Beta's workflow or retries
    const alphaWorkflows = AutonomousRecoveryEngine.getWorkflows(wsId1);
    assert.strictEqual(
      alphaWorkflows.some((w) => w.id === betaWfId),
      false,
      'Tenant Alpha must not see Tenant Beta workflows'
    );

    const alphaBetaLookup = AutonomousRecoveryEngine.getWorkflowById(wsId1, betaWfId);
    assert.strictEqual(alphaBetaLookup, undefined, 'Cannot fetch other tenants workflow by ID');

    const alphaRetries = AutonomousRecoveryEngine.getRetrySchedules(wsId1);
    assert.strictEqual(
      alphaRetries.some((r) => r.workflow_id === betaWfId),
      false,
      'Tenant Alpha must not see Tenant Beta retry schedules'
    );

    // Cross-tenant cancellation attempt must fail
    assert.throws(
      () => {
        AutonomousRecoveryEngine.cancelWorkflow(wsId1, betaWfId, 'Unauthorized attempt');
      },
      /not found/i,
      'Cross-tenant cancellation must fail with not found error'
    );

    console.log('✓ Multi-tenant data and workflow isolation strictly verified.');
  }

  // -------------------------------------------------------------
  // Test 7: Deterministic Behavior Remains 100%
  // -------------------------------------------------------------
  console.log('7. Testing Deterministic Behavior Consistency...');
  {
    const customer = {
      id: `cust_det_${timestamp}`,
      is_vip: false,
      is_enterprise: false,
    };

    const opp = {
      id: `opp_det_${timestamp}`,
      amount_at_risk_cents: 25000,
      currency: 'USD',
      failure_category: 'insufficient_funds' as any,
      payment_failure: {
        provider_failure_code: 'insufficient_funds',
        raw_error_message: 'Temporary insufficient funds',
      } as any,
    };

    // Run 100 iterations of policy evaluation on identical inputs
    for (let i = 0; i < 100; i++) {
      const policyRes = AutopilotPolicyEngine.evaluate(
        opp as any,
        customer as any,
        ws1,
        DEFAULT_AUTOPILOT_SETTINGS
      );
      assert.strictEqual(policyRes.decision, 'AUTONOMOUS');
      assert.strictEqual(policyRes.rule_evaluated, 'AUTONOMOUS_INSUFFICIENT_FUNDS');
    }

    console.log('✓ Deterministic arbitration verified across 100 repeated cycles.');
  }

  // -------------------------------------------------------------
  // Test 8: Workflow Cancellation and State Updates
  // -------------------------------------------------------------
  console.log('8. Testing Workflow Cancellation & State Updates...');
  {
    const { opportunity: oppCancel } = createTestFixture(
      wsId1,
      {
        name: 'Cancel Me Account',
        email: `cancel_${timestamp}@me.com`,
      },
      {
        amountCents: 5000,
        providerFailureCode: 'insufficient_funds',
        rawErrorMessage: 'Insufficient balance',
      }
    );

    const run = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppCancel.id);
    const wfId = run.workflow!.id;

    // Cancel workflow
    const cancelled = AutonomousRecoveryEngine.cancelWorkflow(wsId1, wfId, 'Customer contacted support directly');
    assert.strictEqual(cancelled.state, 'cancelled');
    assert.ok(cancelled.timeline.some((t) => t.action.includes('Cancel')), 'Timeline must include cancellation event');

    // Check that pending retry schedules were cancelled
    const retries = AutonomousRecoveryEngine.getRetrySchedules(wsId1, wfId);
    assert.ok(retries.every((r) => r.status === 'cancelled'), 'All pending retries must be marked cancelled');

    console.log('✓ Workflow cancellation and cascade to retry schedules verified.');
  }

  // -------------------------------------------------------------
  // Test 9: Autonomous Recovery Metrics
  // -------------------------------------------------------------
  console.log('9. Testing Autonomous Recovery Metrics Aggregation...');
  {
    const metrics = AutonomousRecoveryEngine.getMetrics(wsId1);
    assert.ok(typeof metrics.queued_recoveries_count === 'number');
    assert.ok(typeof metrics.scheduled_retries_count === 'number');
    assert.ok(typeof metrics.recovered_revenue_cents === 'number');
    assert.ok(typeof metrics.pending_revenue_cents === 'number');
    assert.ok(typeof metrics.failed_recoveries_count === 'number');
    assert.ok(typeof metrics.total_workflows_count === 'number');

    console.log(`✓ Metrics verified: ${metrics.total_workflows_count} total workflows, ${metrics.scheduled_retries_count} scheduled retries.`);
  }

  console.log('======================================================');
  console.log('ALL AUTONOMOUS RECOVERY ENGINE TESTS PASSED (100%)');
  console.log('======================================================');
}

runAutonomousRecoveryEngineTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
