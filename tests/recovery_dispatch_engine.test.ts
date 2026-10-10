import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { AutonomousRecoveryEngine } from '../server/services/autonomousRecoveryEngine.js';
import { RecoveryDispatchEngine } from '../server/services/recoveryDispatchEngine.js';
import { AutopilotService } from '../server/services/autopilotService.js';
import {
  Customer,
  RecoveryOpportunity,
  Workspace,
  AutonomousRecoveryWorkflow,
} from '../src/types/index.js';

async function runRecoveryDispatchEngineTests() {
  console.log('======================================================');
  console.log('REVIVEOS: AUTONOMOUS RECOVERY DISPATCH ENGINE TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  const timestamp = Date.now();

  // Create two distinct workspaces for multi-tenant verification
  const ws1 = db.createWorkspace(`Tenant Delta Recovery ${timestamp}`, 'saas', 'USD');
  const wsId1 = ws1.id;

  const ws2 = db.createWorkspace(`Tenant Epsilon Recovery ${timestamp}`, 'saas', 'USD');
  const wsId2 = ws2.id;

  // Helper fixture creator
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
      rawErrorMessage: failureData.rawErrorMessage || 'Insufficient balance',
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
  // Test 1: Dispatch created only for AUTONOMOUS workflows
  // -------------------------------------------------------------
  console.log('1. Testing Dispatch only for AUTONOMOUS Workflows...');
  {
    const { customer, opportunity } = createTestFixture(
      wsId1,
      { name: 'Standard SaaS user', email: `user_${timestamp}@acme.com` },
      { amountCents: 12000, providerFailureCode: 'insufficient_funds' }
    );

    // Initial state: Workflow gets processed autonomously
    const run = await AutonomousRecoveryEngine.processOpportunity(wsId1, opportunity.id);
    assert.strictEqual(run.executed, true, 'Opportunity should be processed autonomously');
    assert.ok(run.workflow, 'Workflow should be created');

    const wfId = run.workflow.id;

    // Trigger dispatch
    const dispRes = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, wfId, { channel: 'email' });
    console.log('DISPATCH REASON:', dispRes.reason);
    assert.strictEqual(dispRes.executed, true, 'Dispatch should execute successfully');
    assert.ok(dispRes.dispatch, 'Dispatch record should be created');
    assert.strictEqual(dispRes.dispatch.status, 'sent', 'Status should be sent');
    assert.strictEqual(dispRes.dispatch.channel, 'email');

    // Verify workflow state updated to 'running'
    const wf = db.getAutonomousWorkflowById(wsId1, wfId);
    assert.strictEqual(wf?.state, 'running', 'Workflow state should be running');
    assert.ok(
      wf.timeline.some((t) => t.action.includes('Dispatched')),
      'Timeline should have a dispatched entry'
    );

    console.log('✓ Dispatch execution verified for AUTONOMOUS workflow.');
  }

  // -------------------------------------------------------------
  // Test 2: Manual Review opportunities never dispatch
  // -------------------------------------------------------------
  console.log('2. Testing Manual Review cases NEVER Dispatch...');
  {
    // High amount failure ($600 > $500 default auto recover limit) => MANUAL_REVIEW
    const { customer, opportunity } = createTestFixture(
      wsId1,
      { name: 'Big Spender Inc', email: `corp_${timestamp}@bigspender.com` },
      { amountCents: 60000, providerFailureCode: 'insufficient_funds' }
    );

    const run = await AutonomousRecoveryEngine.processOpportunity(wsId1, opportunity.id);
    assert.strictEqual(run.executed, false, 'Manual Review case must bypass autonomous processing');
    assert.strictEqual(opportunity.policy_decision?.decision, 'MANUAL_REVIEW');

    // Attempt to manually trigger dispatch for an opportunity that is not autonomous
    // Create a mock manual review workflow to verify the engine blocks it
    const wfManual = db.createAutonomousWorkflow({
      id: `wf_manual_${Date.now()}`,
      workspace_id: wsId1,
      opportunity_id: opportunity.id,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_email: customer.email,
      amount_at_risk_cents: opportunity.amount_at_risk_cents,
      currency: opportunity.currency,
      state: 'queued',
      outcome: 'pending',
      policy_decision: 'MANUAL_REVIEW' as any,
      retry_schedules: [],
      timeline: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const dispRes = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, wfManual.id);
    assert.strictEqual(dispRes.executed, false, 'Should fail to dispatch non-autonomous cases');
    assert.ok(dispRes.reason.includes('not AUTONOMOUS'), `Expected reason to include 'not AUTONOMOUS', got: ${dispRes.reason}`);

    console.log('✓ Manual Review dispatch blocking verified.');
  }

  // -------------------------------------------------------------
  // Test 3: Blocked opportunities never execute
  // -------------------------------------------------------------
  console.log('3. Testing Blocked cases NEVER Dispatch...');
  {
    // Unrecoverable decline => BLOCKED
    const { customer, opportunity } = createTestFixture(
      wsId1,
      { name: 'Fraud Risk Account', email: `shady_${timestamp}@risky.com` },
      { amountCents: 5000, providerFailureCode: 'lost_or_stolen_card' }
    );

    const run = await AutonomousRecoveryEngine.processOpportunity(wsId1, opportunity.id);
    assert.strictEqual(run.executed, false, 'Blocked opportunity must bypass autonomous processing');
    assert.strictEqual(opportunity.policy_decision?.decision, 'BLOCKED');

    // Attempt dispatch with a created BLOCKED workflow
    const wfBlocked = db.createAutonomousWorkflow({
      id: `wf_blocked_${Date.now()}`,
      workspace_id: wsId1,
      opportunity_id: opportunity.id,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_email: customer.email,
      amount_at_risk_cents: opportunity.amount_at_risk_cents,
      currency: opportunity.currency,
      state: 'queued',
      outcome: 'pending',
      policy_decision: 'BLOCKED' as any,
      retry_schedules: [],
      timeline: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const dispRes = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, wfBlocked.id);
    assert.strictEqual(dispRes.executed, false, 'Should fail to dispatch blocked cases');
    assert.ok(dispRes.reason.includes('not AUTONOMOUS'), `Expected reason to include 'not AUTONOMOUS', got: ${dispRes.reason}`);

    console.log('✓ Blocked dispatch blocking verified.');
  }

  // -------------------------------------------------------------
  // Test 4: Duplicate sends prevented
  // -------------------------------------------------------------
  console.log('4. Testing Duplicate Send Prevention...');
  {
    const { customer, opportunity } = createTestFixture(
      wsId1,
      { name: 'Deduplicated Account', email: `dup_${timestamp}@acme.com` },
      { amountCents: 15000, providerFailureCode: 'insufficient_funds' }
    );

    const run = await AutonomousRecoveryEngine.processOpportunity(wsId1, opportunity.id);
    const wfId = run.workflow!.id;

    // Dispatch 1
    const firstDisp = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, wfId, { channel: 'email' });
    assert.strictEqual(firstDisp.executed, true, 'First dispatch should succeed');

    // Dispatch 2 (Immediate duplicate)
    const secondDisp = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, wfId, { channel: 'email' });
    assert.strictEqual(secondDisp.executed, false, 'Duplicate dispatch must be blocked');
    assert.ok(secondDisp.reason.includes('Duplicate dispatch prevented'));

    console.log('✓ Duplicate sends prevented.');
  }

  // -------------------------------------------------------------
  // Test 5: Safety Checks (Pause Automation, VIP, Enterprise, Fraud, Disputes)
  // -------------------------------------------------------------
  console.log('5. Testing Safety Guardrails (Pause All, VIP, Enterprise, Dispute, Fraud)...');
  {
    // A. Pause All Automation
    AutopilotService.updateSettings(wsId1, { pause_all_automation: true });

    const { opportunity: oppPause } = createTestFixture(
      wsId1,
      { name: 'Safe User', email: `paused_${timestamp}@acme.com` },
      { amountCents: 5000, providerFailureCode: 'insufficient_funds' }
    );
    // Process on paused settings
    const runPause = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppPause.id);
    assert.strictEqual(runPause.executed, false, 'Should not process on paused settings');

    AutopilotService.updateSettings(wsId1, { pause_all_automation: false }); // Reset

    // B. VIP Customer Protection
    AutopilotService.updateSettings(wsId1, { vip_customer_protection: false });

    const { customer: vipCustomer, opportunity: oppVip } = createTestFixture(
      wsId1,
      { name: 'VIP Client', email: `vip_${timestamp}@vip.com`, is_vip: true },
      { amountCents: 4000, providerFailureCode: 'insufficient_funds' }
    );
    const runVip = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppVip.id);
    assert.strictEqual(runVip.executed, true);
    const vipWfId = runVip.workflow!.id;

    // Turn protection back ON so dispatch gets blocked
    AutopilotService.updateSettings(wsId1, { vip_customer_protection: true });

    const vipDispatch = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, vipWfId, { channel: 'email' });
    assert.strictEqual(vipDispatch.executed, false, 'VIP dispatch must be blocked');
    assert.ok(vipDispatch.reason.includes('VIP Customer Protection') || vipDispatch.reason.includes('dynamic re-evaluation'), `Expected reason to mention VIP or dynamic re-evaluation, got: ${vipDispatch.reason}`);

    // C. Enterprise Customer Protection
    AutopilotService.updateSettings(wsId1, { enterprise_account_protection: false });

    const { customer: entCustomer, opportunity: oppEnt } = createTestFixture(
      wsId1,
      { name: 'Enterprise Client', email: `ent_${timestamp}@enterprise.com`, is_enterprise: true },
      { amountCents: 8000, providerFailureCode: 'insufficient_funds' }
    );
    const runEnt = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppEnt.id);
    assert.strictEqual(runEnt.executed, true);
    const entWfId = runEnt.workflow!.id;

    // Turn protection back ON so dispatch gets blocked
    AutopilotService.updateSettings(wsId1, { enterprise_account_protection: true });

    const entDispatch = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, entWfId, { channel: 'email' });
    assert.strictEqual(entDispatch.executed, false, 'Enterprise dispatch must be blocked');
    assert.ok(entDispatch.reason.includes('Enterprise Account Protection') || entDispatch.reason.includes('dynamic re-evaluation'), `Expected reason to mention Enterprise or dynamic re-evaluation, got: ${entDispatch.reason}`);

    // D. Fraud Block
    const { customer: fraudCust, opportunity: oppFraud } = createTestFixture(
      wsId1,
      { name: 'Fraud Cust', email: `fraud_${timestamp}@acme.com` },
      { amountCents: 3000, providerFailureCode: 'insufficient_funds', is_fraud: false }
    );
    const runFraud = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppFraud.id);
    assert.strictEqual(runFraud.executed, true);
    const fraudWfId = runFraud.workflow!.id;

    oppFraud.is_fraud = true; // Activate fraud before dispatch

    const fraudDispatch = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, fraudWfId, { channel: 'email' });
    assert.strictEqual(fraudDispatch.executed, false, 'Fraud dispatch must be blocked');
    assert.ok(fraudDispatch.reason.includes('fraud or chargeback'));

    // E. Dispute Block
    const { customer: dispCust, opportunity: oppDispute } = createTestFixture(
      wsId1,
      { name: 'Disputed Cust', email: `dispute_${timestamp}@acme.com` },
      { amountCents: 4500, providerFailureCode: 'insufficient_funds', has_active_dispute: false }
    );
    const runDispute = await AutonomousRecoveryEngine.processOpportunity(wsId1, oppDispute.id);
    assert.strictEqual(runDispute.executed, true);
    const disputeWfId = runDispute.workflow!.id;

    oppDispute.has_active_dispute = true; // Activate dispute before dispatch
    oppDispute.dispute_status = 'active';

    const disputeDispatch = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, disputeWfId, { channel: 'email' });
    assert.strictEqual(disputeDispatch.executed, false, 'Dispute dispatch must be blocked');
    assert.ok(disputeDispatch.reason.includes('Active dispute'));

    console.log('✓ All 5 major safety gates verified successfully.');
  }

  // -------------------------------------------------------------
  // Test 6: Complete dispatch life-cycle and Outcome Attribution
  // -------------------------------------------------------------
  console.log('6. Testing Dispatch Lifecycle and Attribution Accuracy...');
  {
    const { customer, opportunity } = createTestFixture(
      wsId1,
      { name: 'Conversion Tracked Cust', email: `track_${timestamp}@acme.com` },
      { amountCents: 20000, providerFailureCode: 'insufficient_funds' }
    );

    const run = await AutonomousRecoveryEngine.processOpportunity(wsId1, opportunity.id);
    const wfId = run.workflow!.id;

    // Send dispatch
    const dispRes = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, wfId, { channel: 'email' });
    const dispId = dispRes.dispatch!.id;

    // Track response events: opened and clicked
    await RecoveryDispatchEngine.recordCustomerResponse(wsId1, dispId, 'opened');
    let disp = db.getRecoveryDispatchById(wsId1, dispId);
    assert.strictEqual(disp?.status, 'opened', 'Status should be opened');

    await RecoveryDispatchEngine.recordCustomerResponse(wsId1, dispId, 'clicked');
    disp = db.getRecoveryDispatchById(wsId1, dispId);
    assert.strictEqual(disp?.status, 'clicked', 'Status should be clicked');

    // Track payment settlement
    const outcome = await RecoveryDispatchEngine.recordPaymentOutcome(wsId1, {
      dispatchId: dispId,
      amountCents: 20000,
      channel: 'email',
    });

    assert.strictEqual(outcome.success, true);
    assert.ok(outcome.attribution, 'Attribution should be logged');

    const attr = outcome.attribution;
    assert.strictEqual(attr.recovered_amount_cents, 20000);
    assert.strictEqual(attr.recovered_amount, 200.0);
    assert.strictEqual(attr.recovery_channel, 'email');
    assert.strictEqual(attr.workflow_id, wfId);
    assert.strictEqual(attr.customer_id, customer.id);
    assert.strictEqual(attr.opportunity_id, opportunity.id);
    assert.ok(attr.recovery_time);
    assert.ok(attr.time_to_recovery_seconds > 0);

    // Verify retry schedules are skipped
    const schedules = db.getAutonomousRetrySchedules(wsId1, wfId);
    assert.ok(
      schedules.every((s) => s.status === 'skipped'),
      'All retry attempts must be skipped since customer paid'
    );

    console.log('✓ Dispatch lifecycle, response tracking, and outcome attribution verified.');
  }

  // -------------------------------------------------------------
  // Test 7: Metrics aggregation accuracy
  // -------------------------------------------------------------
  console.log('7. Testing Metrics Accuracy...');
  {
    const metrics = RecoveryDispatchEngine.getMetrics(wsId1);
    assert.ok(metrics.recovered_revenue_cents >= 20000);
    assert.ok(metrics.total_dispatches > 0);
    assert.ok(metrics.overall_open_rate >= 0);
    assert.ok(metrics.overall_click_rate >= 0);
    assert.ok(metrics.overall_paid_conversion_rate >= 0);
    assert.ok(metrics.channel_performance);
    assert.ok(metrics.funnel);
    assert.ok(metrics.revenue_trend);

    console.log(`✓ Metrics validated: Recovered $${(metrics.recovered_revenue_cents / 100).toFixed(2)} across ${metrics.total_dispatches} total dispatches.`);
  }

  // -------------------------------------------------------------
  // Test 8: Multi-tenant isolation verification
  // -------------------------------------------------------------
  console.log('8. Testing Multi-Tenant Isolation...');
  {
    const { customer, opportunity } = createTestFixture(
      wsId2,
      { name: 'Beta Tenant Cust', email: `beta_${timestamp}@acme.com` },
      { amountCents: 10000, providerFailureCode: 'insufficient_funds' }
    );

    const run = await AutonomousRecoveryEngine.processOpportunity(wsId2, opportunity.id);
    const wfId = run.workflow!.id;

    // Attempt to access/dispatch workspace 2 workflow using workspace 1 context
    const dispRes1 = await RecoveryDispatchEngine.dispatchWorkflow(wsId1, wfId, { channel: 'email' });
    assert.strictEqual(dispRes1.executed, false, 'Dispatch must fail across workspaces');
    assert.ok(dispRes1.reason.includes('not found'));

    // Dispatch using correct workspace context 2
    const dispRes2 = await RecoveryDispatchEngine.dispatchWorkflow(wsId2, wfId, { channel: 'email' });
    assert.strictEqual(dispRes2.executed, true, 'Dispatch must succeed in correct tenant workspace');

    console.log('✓ Multi-tenant isolation strictly verified.');
  }

  console.log('======================================================');
  console.log('ALL RECOVERY DISPATCH ENGINE TESTS PASSED (100%)');
  console.log('======================================================');
}

runRecoveryDispatchEngineTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
