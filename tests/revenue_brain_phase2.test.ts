import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { OutcomeLearningEngine } from '../server/learning/outcomeLearningEngine.js';
import { RevenueBrainEngine } from '../server/intelligence/revenueBrain.js';

async function runRevenueBrainPhase2Tests() {
  console.log('======================================================');
  console.log('REVENUE BRAIN PHASE 2: OUTCOME OPTIMIZATION ENGINE TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const timestamp = Date.now();

  // Create workspace 1 and workspace 2
  const ws1 = db.createWorkspace(`Workspace 1 Phase 2 ${timestamp}`, 'saas', 'USD');
  const ws2 = db.createWorkspace(`Workspace 2 Phase 2 ${timestamp}`, 'saas', 'USD');
  const wsId1 = ws1.id;
  const wsId2 = ws2.id;

  console.log('1. Testing Minimum Sample Threshold Enforcement (Under vs Over)...');
  {
    const summaryUnder = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsId1);
    assert.strictEqual(summaryUnder.hasSufficientSample, false, 'Empty workspace has insufficient sample');
    assert.strictEqual(summaryUnder.optimizationRecommendations?.length, 0, 'No recommendations generated with insufficient sample');
  }

  console.log('2. Seed Data & Test Channel, Retry Timing, and Sequence Analytics...');
  {
    // Seed Customer and Opportunity
    const customer = db.createCustomer(wsId1, {
      name: 'Outcome Tracked Customer Inc',
      email: 'outcome@tracked.com',
      country: 'US',
      currency: 'USD',
      provider_type: 'stripe',
    });

    const { opportunity } = db.createManualFailedInvoice(wsId1, {
      customerId: customer.id,
      amountCents: 10000,
    });

    // 1. Record Dispatches to test Channel Performance (Hosted Link Paid, SMS Failed) - 3 samples each for MIN_OPTIMIZATION_SAMPLE
    for (let i = 1; i <= 3; i++) {
      db.createRecoveryDispatch({
        id: `disp_hl_${i}`,
        workspace_id: wsId1,
        workflow_id: `wf_hl_${i}`,
        opportunity_id: opportunity.id,
        customer_id: customer.id,
        channel: 'hosted_link',
        status: 'paid',
        recipient: 'outcome@tracked.com',
        recovery_link_url: '/pay/token1',
        subject: 'Failed Payment',
        message_body: 'Please pay',
        amount_cents: 10000,
        currency: 'USD',
        provider: 'stripe',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      db.createRecoveryDispatch({
        id: `disp_sms_${i}`,
        workspace_id: wsId1,
        workflow_id: `wf_sms_${i}`,
        opportunity_id: opportunity.id,
        customer_id: customer.id,
        channel: 'sms',
        status: 'failed',
        recipient: '+15550192834',
        recovery_link_url: '/pay/token1',
        subject: 'Failed Payment SMS',
        message_body: 'Please pay SMS',
        amount_cents: 10000,
        currency: 'USD',
        provider: 'stripe',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // 2. Record Retry Schedules to test Retry Timing Performance (3 samples each)
    for (let i = 1; i <= 3; i++) {
      db.createAutonomousRetrySchedule({
        id: `sched_ret_1_${i}`,
        workspace_id: wsId1,
        workflow_id: `wf_ret_${i}`,
        opportunity_id: opportunity.id,
        customer_id: customer.id,
        attempt_number: 1, // Day 1
        scheduled_for: new Date().toISOString(),
        status: 'completed', // Successful retry Timing!
        amount_cents: 10000,
        currency: 'USD',
        created_at: new Date().toISOString(),
      });

      db.createAutonomousRetrySchedule({
        id: `sched_ret_2_${i}`,
        workspace_id: wsId1,
        workflow_id: `wf_ret_${i}`,
        opportunity_id: opportunity.id,
        customer_id: customer.id,
        attempt_number: 2, // Day 3
        scheduled_for: new Date().toISOString(),
        status: 'failed', // Failed retry Timing!
        amount_cents: 10000,
        currency: 'USD',
        created_at: new Date().toISOString(),
      });
    }

    // 3. Record Actions & Outcomes to test Sequence Performance and basic Action Success rates
    for (let i = 1; i <= 3; i++) {
      let oppId = opportunity.id;
      if (i > 1) {
        const created = db.createManualFailedInvoice(wsId1, {
          customerId: customer.id,
          amountCents: 10000,
        });
        oppId = created.opportunity.id;
      }
      db.recordOpportunityAction({
        id: `act_seq_1_${i}`,
        workspaceId: wsId1,
        opportunityId: oppId,
        actionType: 'payment_retry',
        executedBy: 'system',
        executedAt: new Date().toISOString(),
        resultStatus: 'success',
      });

      db.recordOpportunityAction({
        id: `act_seq_2_${i}`,
        workspaceId: wsId1,
        opportunityId: oppId,
        actionType: 'send_hosted_link',
        executedBy: 'operator',
        executedAt: new Date().toISOString(),
        resultStatus: 'success',
      });

      db.recordOpportunityOutcome({
        id: `out_seq_${i}`,
        workspaceId: wsId1,
        opportunityId: oppId,
        outcome: 'recovered',
        recoveredAmountCents: 10000,
        resolvedAt: new Date().toISOString(),
      });
    }

    // Analyze outcomes
    const summaryOver = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsId1);
    assert.strictEqual(summaryOver.hasSufficientSample, true, 'Workspace 1 now has sufficient samples');

    console.log('  ✓ Channel Performance Validation...');
    const hlPerf = summaryOver.channelPerformance?.find(c => c.channel === 'hosted_link');
    assert.ok(hlPerf, 'Hosted Link performance measured');
    assert.strictEqual(hlPerf.successRatePercentage, 100, 'Hosted Link has 100% success rate');

    const smsPerf = summaryOver.channelPerformance?.find(c => c.channel === 'sms');
    assert.ok(smsPerf, 'SMS performance measured');
    assert.strictEqual(smsPerf.successRatePercentage, 0, 'SMS has 0% success rate');

    console.log('  ✓ Retry Timing Performance Validation...');
    const ret1Timing = summaryOver.retryTimingPerformance?.find(r => r.attemptNumber === 1);
    assert.ok(ret1Timing, 'Attempt 1 retry timing performance measured');
    assert.strictEqual(ret1Timing.successRatePercentage, 100, 'Day 1 Retry (Attempt 1) has 100% success rate');

    const ret2Timing = summaryOver.retryTimingPerformance?.find(r => r.attemptNumber === 2);
    assert.ok(ret2Timing, 'Attempt 2 retry timing performance measured');
    assert.strictEqual(ret2Timing.successRatePercentage, 0, 'Day 3 Retry (Attempt 2) has 0% success rate');

    console.log('  ✓ Sequence Performance Validation...');
    const seqPerf = summaryOver.sequencePerformance?.find(s => s.sequencePattern.includes('payment_retry -> send_hosted_link'));
    assert.ok(seqPerf, 'Recovery sequence performance measured');
    assert.strictEqual(seqPerf.successRatePercentage, 100, 'The retry -> hosted_link sequence achieved 100% success');

    console.log('  ✓ Evidence-Backed Recommendations Validation...');
    assert.ok(summaryOver.optimizationRecommendations!.length > 0, 'Generates optimization recommendations');
    const chanRec = summaryOver.optimizationRecommendations?.find(r => r.type === 'channel_selection');
    assert.ok(chanRec, 'Generates channel selection recommendation');
    assert.ok(chanRec.recommendation.includes('Hosted Secure Link'), 'Recommends Hosted Link');
    assert.ok(chanRec.evidence.includes('100%'), 'Evidence cites the exact success rate');

    console.log('✓ Section 2: Metrics, Timing, Channel, Sequences, and Recommendations validated perfectly.');
  }

  console.log('3. Testing Multi-Tenant Isolation (WS1 should not leak to WS2)...');
  {
    const summary2 = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsId2);
    assert.strictEqual(summary2.hasSufficientSample, false, 'Workspace 2 has insufficient sample');
    assert.strictEqual(summary2.channelPerformance?.length, 0, 'Workspace 2 has empty channel metrics');
    assert.strictEqual(summary2.retryTimingPerformance?.length, 0, 'Workspace 2 has empty timing metrics');
    console.log('✓ Multi-tenant isolation verified with zero cross-tenant contamination.');
  }

  console.log('4. Testing Dynamic Optimization & Explanation Feedback in Revenue Brain...');
  {
    // Evaluate workspace using Revenue Brain
    const response = await RevenueBrainEngine.evaluateWorkspace(wsId1);
    assert.ok(response.outcomeOptimizationSummary, 'Revenue Brain response includes outcomeOptimizationSummary block');
    assert.strictEqual(response.outcomeOptimizationSummary.hasSufficientSample, true, 'Maintains hasSufficientSample: true');

    const recItem = response.opportunities.find(o => o.category === 'RECOVERY');
    if (recItem) {
      // Check if evidence contains outcome-driven explanations
      const outcomeEvidence = recItem.evidence.some(e => e.includes('Outcome Optimization') || e.includes('Outcome Insights'));
      assert.ok(outcomeEvidence, 'Recovery opportunity is enriched with empirical outcomes evidence');
      console.log('✓ Revenue Brain feedback and outcome-driven enrichment verified.');
    } else {
      console.log('No RECOVERY item found in sandbox.');
    }
  }

  console.log('======================================================');
  console.log('REVENUE BRAIN PHASE 2 TESTS: ALL PASSED (100%)');
  console.log('======================================================');
}

runRevenueBrainPhase2Tests().catch(err => {
  console.error('❌ Revenue Brain Phase 2 Test Failed:', err);
  process.exit(1);
});
