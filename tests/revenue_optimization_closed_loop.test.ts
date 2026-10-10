import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { OutcomeLearningEngine } from '../server/learning/outcomeLearningEngine.js';
import { AutonomousRecoveryEngine } from '../server/services/autonomousRecoveryEngine.js';
import { RecoveryDispatchEngine } from '../server/services/recoveryDispatchEngine.js';
import { CopilotOrchestrator } from '../server/copilot/copilotOrchestrator.js';
import { RevenueBrainEngine } from '../server/intelligence/revenueBrain.js';
import { AutopilotService } from '../server/services/autopilotService.js';

async function runClosedLoopTests() {
  console.log('================================================================');
  console.log('REVIVEOS — CLOSED FEEDBACK LOOP OPTIMIZATION ENGINE TESTS');
  console.log('================================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const timestamp = Date.now();
  const wsObjA = db.createWorkspace(`Workspace Alpha ${timestamp}`, 'saas', 'USD');
  const wsObjB = db.createWorkspace(`Workspace Beta ${timestamp}`, 'saas', 'USD');
  const wsA = wsObjA.id;
  const wsB = wsObjB.id;

  // =========================================================================
  // TEST 1: Sample Threshold Enforcement & Default Fallback
  // =========================================================================
  console.log('\n1. Testing Sample Threshold Enforcement & Default Fallback...');
  {
    // Initially Workspace A has 0 events
    const optChan = await OutcomeLearningEngine.getOptimalChannel(wsA);
    assert.strictEqual(optChan.isOptimized, false, 'Insufficient data must NOT apply channel optimization');
    assert.strictEqual(optChan.channel, 'email', 'Default fallback channel must be email');
    assert.strictEqual(optChan.confidenceScore, 0, 'Confidence score must be 0 for insufficient sample');
    assert.strictEqual(optChan.confidence, 'none', 'Confidence level must be none');

    const optTiming = await OutcomeLearningEngine.getOptimalRetrySchedule(wsA);
    assert.strictEqual(optTiming.isOptimized, false, 'Insufficient data must NOT apply retry timing optimization');
    assert.deepStrictEqual(optTiming.intervalsDays, [1, 3, 5], 'Default retry cadence must be [1, 3, 5]');

    const optSeq = await OutcomeLearningEngine.getOptimalSequence(wsA);
    assert.strictEqual(optSeq.isOptimized, false, 'Insufficient data must NOT apply sequence optimization');
    assert.deepStrictEqual(optSeq.sequence, ['payment_retry', 'send_hosted_link', 'operator_escalation'], 'Default sequence applied');

    // Add only 1 dispatch for SMS (sample size = 1 < MIN_OPTIMIZATION_SAMPLE of 3)
    const custA = db.createCustomer(wsA, { name: 'Customer A', email: 'cust_a@alpha.com', phone: '+15551234567' });
    const { opportunity: oppA } = db.createManualFailedInvoice(wsA, { customerId: custA.id, amountCents: 5000 });

    db.createRecoveryDispatch({
      id: `disp_under_${timestamp}`,
      workspace_id: wsA,
      workflow_id: 'wf_under',
      opportunity_id: oppA.id,
      customer_id: custA.id,
      channel: 'sms',
      status: 'paid',
      recipient: '+15551234567',
      recovery_link_url: '/pay/mock',
      amount_cents: 5000,
      currency: 'USD',
      provider: 'mock',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const optUnder = await OutcomeLearningEngine.getOptimalChannel(wsA);
    assert.strictEqual(optUnder.isOptimized, false, 'Sample size of 1 must NOT trigger optimization (requires >= 3)');
    console.log('  ✓ Verified: Never optimize from insufficient data (enforced < 3 sample threshold).');
  }

  // =========================================================================
  // TEST 2: Seed Statistically Valid Outcome Data for Workspace Alpha
  // =========================================================================
  console.log('\n2. Seeding Statistically Valid Data in Workspace Alpha...');
  const custAlpha = db.createCustomer(wsA, { name: 'Alpha Customer', email: 'alpha@enterprise.com', phone: '+15559876543' });
  const { opportunity: oppAlpha } = db.createManualFailedInvoice(wsA, { customerId: custAlpha.id, amountCents: 12000 });

  {
    // A. Channel Performance: SMS 100% win rate (4 of 4 paid), Email 0% win rate (3 of 3 failed)
    for (let i = 1; i <= 4; i++) {
      db.createRecoveryDispatch({
        id: `disp_sms_${timestamp}_${i}`,
        workspace_id: wsA,
        workflow_id: `wf_sms_${i}`,
        opportunity_id: oppAlpha.id,
        customer_id: custAlpha.id,
        channel: 'sms',
        status: 'paid',
        recipient: '+15559876543',
        recovery_link_url: '/pay/mock',
        amount_cents: 12000,
        currency: 'USD',
        provider: 'mock',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    for (let i = 1; i <= 3; i++) {
      db.createRecoveryDispatch({
        id: `disp_email_${timestamp}_${i}`,
        workspace_id: wsA,
        workflow_id: `wf_email_${i}`,
        opportunity_id: oppAlpha.id,
        customer_id: custAlpha.id,
        channel: 'email',
        status: 'failed',
        recipient: 'alpha@enterprise.com',
        recovery_link_url: '/pay/mock',
        amount_cents: 12000,
        currency: 'USD',
        provider: 'mock',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // B. Retry Timing: Day 3 (Attempt 2) has 100% success (3 of 3 completed), Day 5 (Attempt 3) has 0% (3 of 3 failed)
    for (let i = 1; i <= 3; i++) {
      db.createAutonomousRetrySchedule({
        id: `sched_att2_${timestamp}_${i}`,
        workspace_id: wsA,
        workflow_id: `wf_sched_${i}`,
        opportunity_id: oppAlpha.id,
        customer_id: custAlpha.id,
        attempt_number: 2, // Day 3
        scheduled_for: new Date().toISOString(),
        status: 'completed',
        amount_cents: 12000,
        currency: 'USD',
        created_at: new Date().toISOString(),
      });

      db.createAutonomousRetrySchedule({
        id: `sched_att3_${timestamp}_${i}`,
        workspace_id: wsA,
        workflow_id: `wf_sched_${i}`,
        opportunity_id: oppAlpha.id,
        customer_id: custAlpha.id,
        attempt_number: 3, // Day 5
        scheduled_for: new Date().toISOString(),
        status: 'failed',
        amount_cents: 12000,
        currency: 'USD',
        created_at: new Date().toISOString(),
      });
    }

    // C. Sequence Performance: Pattern [send_sms -> payment_retry -> send_hosted_link] has 100% win rate across 3 opportunities
    for (let i = 1; i <= 3; i++) {
      const oppSeq = db.createManualFailedInvoice(wsA, { customerId: custAlpha.id, amountCents: 8000 }).opportunity;
      db.recordOpportunityAction({
        id: `act_seq_sms_${timestamp}_${i}`,
        workspaceId: wsA,
        opportunityId: oppSeq.id,
        actionType: 'send_sms',
        executedBy: 'system',
        executedAt: new Date(Date.now() - 3000).toISOString(),
        resultStatus: 'success',
      });
      db.recordOpportunityAction({
        id: `act_seq_retry_${timestamp}_${i}`,
        workspaceId: wsA,
        opportunityId: oppSeq.id,
        actionType: 'payment_retry',
        executedBy: 'system',
        executedAt: new Date(Date.now() - 2000).toISOString(),
        resultStatus: 'success',
      });
      db.recordOpportunityAction({
        id: `act_seq_hl_${timestamp}_${i}`,
        workspaceId: wsA,
        opportunityId: oppSeq.id,
        actionType: 'send_hosted_link',
        executedBy: 'system',
        executedAt: new Date(Date.now() - 1000).toISOString(),
        resultStatus: 'success',
      });
      db.recordOpportunityOutcome({
        id: `out_seq_${timestamp}_${i}`,
        workspaceId: wsA,
        opportunityId: oppSeq.id,
        outcome: 'recovered',
        recoveredAmountCents: 8000,
        resolvedAt: new Date().toISOString(),
      });
    }

    console.log('  ✓ Seeded statistically valid multi-sample datasets.');
  }

  // =========================================================================
  // TEST 3: Optimization Selection, Confidence Scoring & Explainability
  // =========================================================================
  console.log('\n3. Testing Optimization Selection & Explainability...');
  {
    const summary = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsA);
    assert.strictEqual(summary.hasSufficientSample, true);

    // Channel Optimization Check
    const optChan = await OutcomeLearningEngine.getOptimalChannel(wsA);
    assert.strictEqual(optChan.isOptimized, true, 'Channel optimization must be applied');
    assert.strictEqual(optChan.channel, 'sms', 'Optimal channel must be SMS');
    assert.ok(optChan.confidenceScore >= 60, `Confidence score (${optChan.confidenceScore}) >= 60`);
    assert.strictEqual(optChan.sampleSize, 5, 'Sample size must match actual recorded events (4 + 1 under = 5)');
    assert.ok(optChan.whatChanged.includes('SMS'), 'Explainability: whatChanged mentions SMS');
    assert.ok(optChan.reason.length > 0, 'Explainability: whyChosen is populated');
    assert.ok(optChan.evidence.length > 0, 'Explainability: evidence is populated');

    // Retry Timing Optimization Check (Day 3 significantly outperforms Day 5)
    const optTiming = await OutcomeLearningEngine.getOptimalRetrySchedule(wsA);
    assert.strictEqual(optTiming.isOptimized, true, 'Retry timing optimization must be applied');
    assert.deepStrictEqual(optTiming.intervalsDays, [1, 3], 'Retry intervals adjusted to [1, 3] eliminating Day 5');
    assert.ok(optTiming.confidenceScore >= 60, 'Confidence threshold reached for retry timing');
    assert.ok(optTiming.whatChanged.includes('[1, 3]'), 'Explainability: whatChanged reflects [1, 3]');
    assert.ok(optTiming.reason.includes('Day 3') || optTiming.reason.includes('Attempt 2'), 'Explainability: whyChosen explains Day 3 peak');

    // Sequence Optimization Check
    const optSeq = await OutcomeLearningEngine.getOptimalSequence(wsA);
    assert.strictEqual(optSeq.isOptimized, true, 'Sequence optimization must be applied');
    assert.deepStrictEqual(optSeq.sequence, ['send_sms', 'payment_retry', 'send_hosted_link'], 'Winning sequence matched');
    assert.ok(optSeq.confidenceScore >= 60, 'Sequence confidence threshold reached');

    console.log('  ✓ Channel, retry timing, and sequence optimizations selected with full explainability.');
  }

  // =========================================================================
  // TEST 4: Dispatch Optimization Closed Feedback Loop
  // =========================================================================
  console.log('\n4. Testing Dispatch Optimization Closed Loop...');
  {
    // Create new opportunity and process it into an autonomous workflow
    const custDisp = db.createCustomer(wsA, { name: 'Dispatch Test User', email: 'disp@test.com', phone: '+15554443322' });
    const { opportunity: oppDisp } = db.createManualFailedInvoice(wsA, { customerId: custDisp.id, amountCents: 4500 });

    const procRes = await AutonomousRecoveryEngine.processOpportunity(wsA, oppDisp.id);
    assert.strictEqual(procRes.executed, true, 'Opportunity processed into autonomous workflow');
    const workflow = procRes.workflow!;

    // Dispatch workflow WITHOUT specifying options.channel
    const dispRes = await RecoveryDispatchEngine.dispatchWorkflow(wsA, workflow.id);
    assert.strictEqual(dispRes.executed, true, 'Workflow dispatched successfully');
    assert.ok(dispRes.dispatch, 'Dispatch record returned');

    // Closed Feedback Loop: Because SMS statistically outperforms Email, dispatch engine selects SMS!
    assert.strictEqual(dispRes.dispatch.channel, 'sms', 'Dispatch engine dynamically selected optimized channel (SMS)');
    assert.ok(dispRes.dispatch.metadata?.isOptimized, 'Dispatch record metadata marks isOptimized: true');
    assert.strictEqual(dispRes.dispatch.metadata?.optimization?.whatChanged, 'Outreach channel default dynamically shifted to SMS');
    assert.strictEqual(dispRes.dispatch.metadata?.optimization?.sampleSize, 5);

    // Verify Workflow Timeline records explanation
    const updatedWf = db.getAutonomousWorkflowById(wsA, workflow.id);
    const optTl = updatedWf?.timeline.find(t => t.action === 'Channel Optimization Applied');
    assert.ok(optTl, 'Workflow timeline recorded Channel Optimization Applied event');
    assert.ok(optTl.details.includes('SMS'), 'Timeline details explain SMS selection');

    console.log('  ✓ Dispatch engine dynamically adapted channel to SMS with full metadata and timeline attribution.');
  }

  // =========================================================================
  // TEST 5: Retry Timing Optimization Closed Feedback Loop
  // =========================================================================
  console.log('\n5. Testing Retry Timing Optimization Closed Loop...');
  {
    // Create new opportunity to verify retry schedule cadence adjustment
    const custRetry = db.createCustomer(wsA, { name: 'Retry Cadence User', email: 'retry@cadence.com' });
    const { opportunity: oppRetry } = db.createManualFailedInvoice(wsA, { customerId: custRetry.id, amountCents: 6000 });

    const procRetry = await AutonomousRecoveryEngine.processOpportunity(wsA, oppRetry.id);
    assert.strictEqual(procRetry.executed, true);
    const wfRetry = procRetry.workflow!;

    // Closed Feedback Loop: Because Day 3 outperformed Day 5, schedules must be [1, 3] (2 attempts, no Day 5)
    assert.strictEqual(wfRetry.retry_schedules.length, 2, 'Scheduled exactly 2 retries (Days 1 and 3, Day 5 eliminated)');
    assert.strictEqual(wfRetry.retry_schedules[0].attempt_number, 1);
    assert.strictEqual(wfRetry.retry_schedules[1].attempt_number, 2);

    // Verify timeline records retry timing optimization
    const timingTl = wfRetry.timeline.find(t => t.action === 'Retry Schedule Cadence Optimized');
    assert.ok(timingTl, 'Timeline recorded Retry Schedule Cadence Optimized');
    assert.ok(timingTl.details.includes('[1, 3]'), 'Timeline explains cadence shift to [1, 3]');

    console.log('  ✓ Autonomous recovery engine adjusted retry schedule cadence to [1, 3] based on empirical outcome peak.');
  }

  // =========================================================================
  // TEST 6: Copilot Optimization Closed Feedback Loop
  // =========================================================================
  console.log('\n6. Testing Copilot Optimization Closed Loop...');
  {
    CopilotOrchestrator.clearCache();
    const custCopilot = db.createCustomer(wsA, { name: 'Copilot Opt User', email: 'copilot@opt.com', phone: '+15558889900' });
    const { opportunity: oppCopilot } = db.createManualFailedInvoice(wsA, { customerId: custCopilot.id, amountCents: 7500 });

    const plan = await CopilotOrchestrator.getOrGeneratePlan(wsA, oppCopilot.id);
    assert.ok(plan, 'Copilot plan generated');

    // Sequence Optimization Feedback:
    // Steps generated must match empirical winning sequence: [send_sms, payment_retry, send_hosted_link]
    const stepActionTypes = plan.recommendedSteps.map(s => s.actionType);
    assert.deepStrictEqual(stepActionTypes, ['send_sms', 'payment_retry', 'send_hosted_link'], 'Copilot plan steps ordered according to top empirical sequence');

    // Explainability checks:
    const seqWhy = plan.why.find(w => w.includes('Sequence Optimization'));
    assert.ok(seqWhy, 'Plan why reasons include Sequence Optimization explanation');
    assert.ok(plan.recommendedActionSummary?.includes('Sequence optimization active') || plan.recommendedActionSummary?.includes('Channel optimization active'));

    // Execute SMS step to verify end-to-end execution
    await CopilotOrchestrator.approvePlan(wsA, oppCopilot.id, 'operator_test');
    const smsStep = plan.recommendedSteps[0];
    const execRes = await CopilotOrchestrator.executeStep(wsA, oppCopilot.id, smsStep.id, 'operator_test');
    if (!execRes.success) {
      console.error('executeStep failed:', execRes.message);
    }
    assert.strictEqual(execRes.success, true, `Step execution failed: ${execRes.message}`);
    assert.strictEqual(execRes.step.state, 'completed', 'SMS step executed successfully via dispatch adapter');

    console.log('  ✓ Copilot plan generated and executed with sequence and channel outcome prioritization.');
  }

  // =========================================================================
  // TEST 7: Revenue Brain Active Optimizations Exposure
  // =========================================================================
  console.log('\n7. Testing Revenue Brain Active Optimizations Exposure...');
  {
    const brainRes = await RevenueBrainEngine.evaluateWorkspace(wsA);
    assert.ok(brainRes.activeOptimizations, 'Revenue Brain response includes activeOptimizations array');
    assert.ok(brainRes.activeOptimizations.length >= 2, 'Exposes active channel, retry timing, or sequence optimizations');

    const chanOpt = brainRes.activeOptimizations.find(o => o.type === 'channel_selection');
    assert.ok(chanOpt, 'Exposes channel_selection optimization');
    assert.strictEqual(chanOpt.target, 'recovery_channel');
    assert.ok(chanOpt.whatChanged.length > 0, 'Exposes what changed');
    assert.ok(chanOpt.whyOptimizationWasChosen.length > 0, 'Exposes why chosen');
    assert.ok(chanOpt.historicalEvidence.length > 0, 'Exposes historical evidence');
    assert.ok(chanOpt.confidenceScore >= 60, 'Exposes confidence score');
    assert.strictEqual(chanOpt.isApplied, true);

    const timingOpt = brainRes.activeOptimizations.find(o => o.type === 'retry_timing');
    assert.ok(timingOpt, 'Exposes retry_timing optimization');
    assert.ok(timingOpt.whatChanged.includes('[1, 3]'));
    assert.strictEqual(timingOpt.isApplied, true);

    console.log('  ✓ Revenue Brain accurately exposes active optimizations, reasons, evidence, and confidence scores.');
  }

  // =========================================================================
  // TEST 8: Safety & Guardrails Enforcement
  // =========================================================================
  console.log('\n8. Testing Safety Guardrails (Pause, VIP, Enterprise, Fraud, Dispute)...');
  {
    const custSafe = db.createCustomer(wsA, { name: 'Safety User', email: 'safe@acme.com', phone: '+15550001111' });

    // A. Pause All Automation
    AutopilotService.updateSettings(wsA, { pause_all_automation: true });
    const { opportunity: oppPause } = db.createManualFailedInvoice(wsA, { customerId: custSafe.id, amountCents: 5000 });
    const pauseRes = await AutonomousRecoveryEngine.processOpportunity(wsA, oppPause.id);
    assert.strictEqual(pauseRes.executed, false, 'Halted by Pause All Automation');
    AutopilotService.updateSettings(wsA, { pause_all_automation: false });

    // B. VIP Customer Protection
    AutopilotService.updateSettings(wsA, { vip_customer_protection: true });
    const vipCust = db.createCustomer(wsA, { name: 'VIP Client', email: 'vip@corp.com', is_vip: true });
    const { opportunity: oppVip } = db.createManualFailedInvoice(wsA, { customerId: vipCust.id, amountCents: 4000 });
    const vipRes = await AutonomousRecoveryEngine.processOpportunity(wsA, oppVip.id);
    assert.strictEqual(vipRes.executed, false, 'VIP Protection blocked autonomous workflow creation');

    // C. Enterprise Account Protection
    AutopilotService.updateSettings(wsA, { enterprise_account_protection: true });
    const entCust = db.createCustomer(wsA, { name: 'Big Enterprise', email: 'ent@corp.com', is_enterprise: true });
    const { opportunity: oppEnt } = db.createManualFailedInvoice(wsA, { customerId: entCust.id, amountCents: 9000 });
    const entRes = await AutonomousRecoveryEngine.processOpportunity(wsA, oppEnt.id);
    assert.strictEqual(entRes.executed, false, 'Enterprise Protection blocked autonomous workflow creation');

    // D. Fraud Block
    const fraudCust = db.createCustomer(wsA, { name: 'Fraudster', email: 'fraud@bad.com' });
    const { opportunity: oppFraud } = db.createManualFailedInvoice(wsA, { customerId: fraudCust.id, amountCents: 3000 });
    oppFraud.is_fraud = true;
    const fraudRes = await AutonomousRecoveryEngine.processOpportunity(wsA, oppFraud.id);
    assert.strictEqual(fraudRes.executed, false, 'Fraud detection blocked recovery execution');

    // E. Dispute Block
    const dispCust = db.createCustomer(wsA, { name: 'Disputed Client', email: 'disp@dispute.com' });
    const { opportunity: oppDispute } = db.createManualFailedInvoice(wsA, { customerId: dispCust.id, amountCents: 2000 });
    oppDispute.has_active_dispute = true;
    const disputeRes = await AutonomousRecoveryEngine.processOpportunity(wsA, oppDispute.id);
    assert.strictEqual(disputeRes.executed, false, 'Dispute detection blocked recovery execution');

    console.log('  ✓ All safety guardrails strictly honored without compromise.');
  }

  // =========================================================================
  // TEST 9: Multi-Tenant Isolation
  // =========================================================================
  console.log('\n9. Testing Multi-Tenant Isolation (Workspace A vs Workspace B)...');
  {
    // Workspace B has zero data and must NEVER inherit Workspace A optimizations
    const summaryB = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsB);
    assert.strictEqual(summaryB.hasSufficientSample, false, 'Workspace B has no samples');
    assert.strictEqual(summaryB.activeOptimizations?.length || 0, 0, 'Workspace B has 0 active optimizations');

    const optChanB = await OutcomeLearningEngine.getOptimalChannel(wsB);
    assert.strictEqual(optChanB.isOptimized, false, 'Workspace B channel is NOT optimized');
    assert.strictEqual(optChanB.channel, 'email', 'Workspace B falls back to default email');

    const optTimingB = await OutcomeLearningEngine.getOptimalRetrySchedule(wsB);
    assert.strictEqual(optTimingB.isOptimized, false, 'Workspace B timing is NOT optimized');
    assert.deepStrictEqual(optTimingB.intervalsDays, [1, 3, 5], 'Workspace B uses default [1, 3, 5]');

    const brainB = await RevenueBrainEngine.evaluateWorkspace(wsB);
    assert.strictEqual(brainB.activeOptimizations?.length || 0, 0, 'Workspace B Revenue Brain exposes 0 optimizations');

    console.log('  ✓ Complete multi-tenant isolation verified; zero cross-tenant data leakage.');
  }

  // =========================================================================
  // TEST 10: Deterministic Behavior
  // =========================================================================
  console.log('\n10. Testing Deterministic Behavior...');
  {
    const run1 = await OutcomeLearningEngine.getOptimalChannel(wsA);
    const run2 = await OutcomeLearningEngine.getOptimalChannel(wsA);
    assert.deepStrictEqual(run1, run2, 'Channel optimization resolution is 100% deterministic');

    const timing1 = await OutcomeLearningEngine.getOptimalRetrySchedule(wsA);
    const timing2 = await OutcomeLearningEngine.getOptimalRetrySchedule(wsA);
    assert.deepStrictEqual(timing1, timing2, 'Retry timing resolution is 100% deterministic');

    const seq1 = await OutcomeLearningEngine.getOptimalSequence(wsA);
    const seq2 = await OutcomeLearningEngine.getOptimalSequence(wsA);
    assert.deepStrictEqual(seq1, seq2, 'Sequence resolution is 100% deterministic');

    console.log('  ✓ 100% deterministic behavior validated across repeated evaluations.');
  }

  console.log('\n================================================================');
  console.log('CLOSED LOOP OPTIMIZATION ENGINE TESTS: ALL 10 PASSED (100%)');
  console.log('================================================================');
}

runClosedLoopTests().catch(err => {
  console.error('❌ Closed Loop Test Failed:', err);
  process.exit(1);
});
