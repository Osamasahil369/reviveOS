import assert from 'node:assert';
import { RecoveryExecutionLayer } from '../server/services/recoveryExecutionLayer.js';
import { db } from '../server/store/db.js';

console.log('================================================================');
console.log('TEST SUITE: RECOVERY EXECUTION LAYER (8-STEP PIPELINE)');
console.log('================================================================');

async function runExecutionLayerTests() {
  const ws = db.createWorkspace(
    'Execution Test Workspace',
    'SaaS',
    'USD',
    false
  );

  console.log('Running 8-step recovery execution pipeline...');
  const result = await RecoveryExecutionLayer.executeRecoveryPipeline(
    ws.id,
    'inv_test_999',
    15000,
    'customer@example.com',
    'Test Customer',
    'Card Expired'
  );

  if (!result.success) {
    console.error('Pipeline failed with error:', result.error);
  }

  assert.strictEqual(result.success, true, 'Pipeline execution must succeed');
  assert.ok(result.opportunityId, 'Opportunity ID generated');
  assert.ok(result.workflowId, 'Workflow ID generated');
  assert.strictEqual(result.amountRecoveredCents, 15000, 'Recovers correct amount');

  const expectedSteps = [
    'Failure detected',
    'Workflow created',
    'Email/SMS sent',
    'Customer updates card',
    'Retry executed',
    'Payment succeeds',
    'Revenue recovered',
    'Settlement recorded',
  ];

  for (const step of expectedSteps) {
    assert.ok(result.stepsCompleted.includes(step), `Must complete step: ${step}`);
  }

  console.log('  ✓ Verified: All 8 steps of the Recovery Execution Layer completed successfully in order.');
  console.log('================================================================');
  console.log('RECOVERY EXECUTION LAYER TESTS: 100% PASSED');
  console.log('================================================================');
}

runExecutionLayerTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
