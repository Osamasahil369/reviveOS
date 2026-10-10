import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { ChurnPredictorEngine } from '../server/intelligence/churnPredictor.js';

async function runChurnPredictionTests() {
  console.log('======================================================');
  console.log('REVENUE RECOVERY OS: CHURN PREDICTION ENGINE TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const workspaces = db.getWorkspaces();
  assert.ok(workspaces.length >= 2, 'At least 2 workspaces exist for multi-tenant tests');
  const wsA = workspaces[0].id;
  const wsB = workspaces[1].id;

  console.log('1. Testing Churn Evaluation for Workspace A...');
  const queueA = await ChurnPredictorEngine.evaluateWorkspace(wsA);
  assert.ok(queueA.queue.length > 0, 'Churn queue returns evaluated customers');
  assert.strictEqual(queueA.workspaceId, wsA, 'Queue workspace ID matches');

  console.log(`- Total Customers Evaluated: ${queueA.totalCustomersEvaluated}`);
  console.log(`- Critical Risk Count: ${queueA.criticalCount}`);
  console.log(`- At Risk Count: ${queueA.atRiskCount}`);
  console.log(`- Watch Count: ${queueA.watchCount}`);
  console.log(`- Low Risk Count: ${queueA.lowRiskCount}`);

  // Verify explainability and evidence
  const topRisk = queueA.queue[0];
  assert.ok(topRisk.customerId, 'Record has customerId');
  assert.ok(topRisk.riskCategory, 'Record has riskCategory');
  assert.ok(typeof topRisk.riskScore === 'number', 'Record has numeric riskScore');
  assert.ok(topRisk.mainDrivers.length > 0, 'Record has explainable mainDrivers');
  assert.ok(topRisk.evidence.length > 0, 'Record has evidence array');
  assert.ok(topRisk.recommendedIntervention, 'Record has recommended intervention');

  console.log('  ✓ PASS: Churn scoring, categorization, and explainable evidence verified.');

  console.log('2. Testing Idempotency (Repeated Scans)...');
  const queueA2 = await ChurnPredictorEngine.evaluateWorkspace(wsA);
  assert.strictEqual(queueA2.totalCustomersEvaluated, queueA.totalCustomersEvaluated, 'Repeated scan count matches');
  assert.strictEqual(queueA2.queue[0].riskScore, topRisk.riskScore, 'Repeated scan produces identical risk score');

  console.log('  ✓ PASS: Repeated scans are idempotent.');

  console.log('3. Testing Multi-Tenant Isolation...');
  const queueB = await ChurnPredictorEngine.evaluateWorkspace(wsB);
  for (const record of queueB.queue) {
    assert.strictEqual(record.workspaceId, wsB, 'Workspace B records strictly belong to Workspace B');
  }

  console.log('  ✓ PASS: Multi-tenant isolation strictly enforced.');

  console.log('======================================================');
  console.log('CHURN PREDICTION TESTS: ALL PASSED (100%)');
  console.log('======================================================');
}

runChurnPredictionTests().catch((err) => {
  console.error('❌ Churn Prediction Test Failed:', err);
  process.exit(1);
});
