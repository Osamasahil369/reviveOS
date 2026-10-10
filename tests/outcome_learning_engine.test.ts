import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { OutcomeLearningEngine, MIN_SAMPLE_THRESHOLD } from '../server/learning/outcomeLearningEngine.js';
import { CopilotOrchestrator } from '../server/copilot/copilotOrchestrator.js';

async function runOutcomeLearningEngineTests() {
  console.log('======================================================');
  console.log('REVENUE RECOVERY OS: OUTCOME LEARNING ENGINE VALIDATION');
  console.log('======================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const wsA = 'ws_learning_test_A_' + Date.now();
  const wsB = 'ws_learning_test_B_' + Date.now();

  console.log('1. Testing Missing History (Empty Workspace)...');
  const emptySummary = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsA);
  assert.strictEqual(emptySummary.hasSufficientSample, false, 'Empty workspace has insufficient sample');
  assert.strictEqual(emptySummary.actionSuccessRates.length, 0, 'No action success rates when history is missing');
  assert.ok(
    emptySummary.evidenceStatements[0].includes('Limited historical sample'),
    'Empty workspace returns limited sample statement'
  );
  console.log('  ✓ PASS: Missing history handled honestly without hallucinated statistics.');

  console.log('2. Testing Minimum Sample Threshold Enforcement (< 3 vs >= 3)...');
  // Record 2 events (under threshold of 3)
  db.recordOpportunityAction({
    id: `act_thresh_1`,
    workspaceId: wsA,
    opportunityId: 'opp_thresh_1',
    actionType: 'send_hosted_link',
    executedBy: 'operator',
    executedAt: new Date().toISOString(),
    resultStatus: 'success'
  });
  db.recordOpportunityOutcome({
    id: `out_thresh_1`,
    workspaceId: wsA,
    opportunityId: 'opp_thresh_1',
    outcome: 'recovered',
    recoveredAmountCents: 5000,
    resolvedAt: new Date().toISOString()
  });

  const underThreshSummary = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsA);
  assert.strictEqual(underThreshSummary.hasSufficientSample, false, 'Sample count 2 < threshold 3 must return hasSufficientSample = false');

  // Add 3rd event to reach threshold of 3
  db.recordOpportunityAction({
    id: `act_thresh_2`,
    workspaceId: wsA,
    opportunityId: 'opp_thresh_1',
    actionType: 'send_hosted_link',
    executedBy: 'operator',
    executedAt: new Date().toISOString(),
    resultStatus: 'success'
  });

  const meetsThreshSummary = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsA);
  assert.strictEqual(meetsThreshSummary.hasSufficientSample, true, 'Sample count 3 >= threshold 3 must return hasSufficientSample = true');
  assert.ok(meetsThreshSummary.actionSuccessRates.length > 0, 'Success rates generated once sample threshold is met');
  console.log('  ✓ PASS: Minimum sample threshold strictly enforced (>= 3 required for statistical rates).');

  console.log('3. Testing Exact Success Rate Calculation & Outcome Aggregation...');
  const hostedLinkRate = meetsThreshSummary.actionSuccessRates.find(a => a.actionType === 'send_hosted_link');
  assert.ok(hostedLinkRate, 'Hosted link action rate aggregated');
  assert.strictEqual(hostedLinkRate.totalAttempts, 2, 'Exact total attempts count matches');
  assert.strictEqual(hostedLinkRate.successfulAttempts, 2, 'Exact successful attempts count matches');
  assert.strictEqual(hostedLinkRate.successRatePercentage, 100, 'Exact 100% success rate calculated');
  console.log('  ✓ PASS: Exact success rate math verified with zero fabricated figures.');

  console.log('4. Testing Multi-Tenant Isolation...');
  // Record outcomes for Workspace B
  db.recordOpportunityAction({
    id: `act_wsB_1`,
    workspaceId: wsB,
    opportunityId: 'opp_wsB_1',
    actionType: 'payment_retry',
    executedBy: 'operator',
    executedAt: new Date().toISOString(),
    resultStatus: 'failed'
  });
  db.recordOpportunityAction({
    id: `act_wsB_2`,
    workspaceId: wsB,
    opportunityId: 'opp_wsB_1',
    actionType: 'payment_retry',
    executedBy: 'operator',
    executedAt: new Date().toISOString(),
    resultStatus: 'failed'
  });
  db.recordOpportunityOutcome({
    id: `out_wsB_1`,
    workspaceId: wsB,
    opportunityId: 'opp_wsB_1',
    outcome: 'unrecoverable',
    recoveredAmountCents: 0,
    resolvedAt: new Date().toISOString()
  });

  const summaryWsB = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsB);
  assert.strictEqual(summaryWsB.workspaceId, wsB, 'Summary linked to correct workspace B');
  const retryRateB = summaryWsB.actionSuccessRates.find(a => a.actionType === 'payment_retry');
  assert.ok(retryRateB, 'Retry rate aggregated for Workspace B');
  assert.strictEqual(retryRateB.successRatePercentage, 0, 'Workspace B retry success rate is 0%');

  // Verify Workspace A statistics were NOT contaminated by Workspace B
  const reSummaryWsA = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsA);
  assert.strictEqual(
    reSummaryWsA.actionSuccessRates.some(a => a.actionType === 'payment_retry'),
    false,
    'Workspace A must NOT contain payment_retry action rate from Workspace B'
  );
  console.log('  ✓ PASS: Multi-tenant isolation verified; zero cross-tenant contamination.');

  console.log('5. Testing Recommendation Enhancement in Recovery Copilot...');
  const defaultWsOpps = db.getOpportunities('ws_acme_saas_01');
  if (defaultWsOpps.length > 0) {
    const oppId = defaultWsOpps[0].id;
    CopilotOrchestrator.clearCache();
    const plan = await CopilotOrchestrator.getOrGeneratePlan('ws_acme_saas_01', oppId);
    assert.ok(plan.historicalEvidence, 'Plan includes historical evidence summary');
    assert.ok(plan.why.length > 0, 'Plan includes evidence-informed why reasons');
  }
  console.log('  ✓ PASS: Copilot recommendations enhanced with empirical outcome learning.');

  console.log('======================================================');
  console.log('OUTCOME LEARNING ENGINE TESTS: ALL PASSED (100%)');
  console.log('======================================================');
}

runOutcomeLearningEngineTests().catch(err => {
  console.error('❌ Outcome Learning Engine Test Failed:', err);
  process.exit(1);
});
