import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { ExpansionFinderEngine } from '../server/intelligence/expansionFinder.js';

async function runExpansionFinderTests() {
  console.log('======================================================');
  console.log('REVENUE RECOVERY OS: EXPANSION FINDER ENGINE TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const workspaces = db.getWorkspaces();
  assert.ok(workspaces.length > 0, 'Seed workspace exists');
  const wsId = workspaces[0].id;

  console.log('1. Testing Expansion Revenue Evaluation...');
  const queue = await ExpansionFinderEngine.evaluateWorkspace(wsId);
  assert.ok(queue.queue.length > 0, 'Expansion queue returns evaluated records');
  assert.strictEqual(queue.workspaceId, wsId, 'Queue workspace ID matches');

  console.log(`- Total Evaluated: ${queue.totalEvaluated}`);
  console.log(`- Confirmed Evidence Count: ${queue.confirmedCount}`);
  console.log(`- Insufficient Evidence Count: ${queue.insufficientEvidenceCount}`);

  // Verify that accounts lacking telemetry are correctly marked as insufficient expansion evidence
  const insufficientRecords = queue.queue.filter((r) => r.evidenceStatus === 'insufficient_evidence');
  for (const rec of insufficientRecords) {
    assert.ok(
      rec.expansionSignal.includes('insufficient expansion evidence'),
      'Correctly marks lacking data as insufficient expansion evidence without fabrication'
    );
    assert.strictEqual(rec.estimatedValueCents, null, 'Does not fabricate estimated value when data is insufficient');
    assert.strictEqual(rec.estimatedValueLabel, 'Value requires review', 'Sets label to value requires review');
  }

  console.log('  ✓ PASS: Insufficient expansion data handled honestly without hallucinated signals.');

  console.log('2. Testing Idempotency...');
  const queue2 = await ExpansionFinderEngine.evaluateWorkspace(wsId);
  assert.strictEqual(queue2.totalEvaluated, queue.totalEvaluated, 'Repeated evaluation count matches');
  assert.strictEqual(queue2.confirmedCount, queue.confirmedCount, 'Confirmed count is idempotent');

  console.log('  ✓ PASS: Expansion finder evaluations are fully idempotent.');

  console.log('3. Testing Zero ARR Rule for Customers without Subscription...');
  const wsSubTest = `ws_arr_test_${Date.now()}`;
  db.addCustomer({
    id: `cust_no_sub`,
    workspace_id: wsSubTest,
    name: 'No Subscription Cust',
    email: 'nosub@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 50000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: 'cus_nosub',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const queueNoSub = await ExpansionFinderEngine.evaluateWorkspace(wsSubTest);
  assert.strictEqual(queueNoSub.queue.length, 1);
  assert.strictEqual(queueNoSub.queue[0].currentArrCents, 0, 'Customer without subscription must have currentArrCents = 0');
  assert.strictEqual(queueNoSub.queue[0].currentPlan, 'No Active Plan', 'Plan name should reflect no active plan');
  console.log('  ✓ PASS: Customer with no subscription has currentArrCents = 0 (no fabricated 9900).');

  console.log('4. Testing Expansion Evidence Semantics (Explicit vs Signal vs Health)...');
  const wsSemantics = `ws_sem_${Date.now()}`;
  // Cust A: Explicit verified expansion amount
  db.addCustomer({
    id: `cust_exp_amount`,
    workspace_id: wsSemantics,
    name: 'Verified Amount Cust',
    email: 'amount@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 200000,
    total_recovered_cents: 60000,
    country: 'US',
    provider_customer_id: 'cus_amt',
    metadata: { expansion_amount_cents: 75000, expansion_signal: 'Contract tier increase scheduled' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // Cust B: Explicit growth/seat signal without monetary amount
  db.addCustomer({
    id: `cust_exp_signal`,
    workspace_id: wsSemantics,
    name: 'Signal Only Cust',
    email: 'signal@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 150000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: 'cus_sig',
    metadata: { expansion_signal: 'Approaching team plan user cap' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // Cust C: High health / high LTV / recovered alone (no telemetry)
  db.addCustomer({
    id: `cust_high_health`,
    workspace_id: wsSemantics,
    name: 'High Health Only Cust',
    email: 'health@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 500000,
    total_recovered_cents: 80000,
    health_score: 95,
    country: 'US',
    provider_customer_id: 'cus_health',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const semQueue = await ExpansionFinderEngine.evaluateWorkspace(wsSemantics);
  const recA = semQueue.queue.find((r) => r.customerId === 'cust_exp_amount')!;
  const recB = semQueue.queue.find((r) => r.customerId === 'cust_exp_signal')!;
  const recC = semQueue.queue.find((r) => r.customerId === 'cust_high_health')!;

  // A: Explicit verified expansion amount
  assert.strictEqual(recA.evidenceStatus, 'confirmed_evidence');
  assert.strictEqual(recA.estimatedValueCents, 75000, 'Explicit verified amount is quantified');
  assert(recA.estimatedValueLabel.includes('750.00 confirmed expansion opportunity'));

  // B: Explicit growth/seat signal without monetary amount
  assert.strictEqual(recB.evidenceStatus, 'confirmed_evidence');
  assert.strictEqual(recB.estimatedValueCents, null, 'Signal without amount remains unquantified');
  assert.strictEqual(recB.estimatedValueLabel, 'Signal detected — value not quantified');

  // C: High health / LTV / recovery alone
  assert.strictEqual(recC.evidenceStatus, 'insufficient_evidence');
  assert.strictEqual(recC.estimatedValueCents, null, 'High health alone produces null expansion amount');
  assert.strictEqual(recC.estimatedValueLabel, 'Value requires review');

  console.log('  ✓ PASS: Expansion evidence semantics correctly distinguish verified amount, signal only, and health alone.');

  console.log('5. Testing Missing Health Score Handling (No Implicit 85 Fallback)...');
  const wsMissingHealth = `ws_no_health_${Date.now()}`;
  db.addCustomer({
    id: `cust_no_health`,
    workspace_id: wsMissingHealth,
    name: 'No Health Cust',
    email: 'nohealth@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 600000,
    total_recovered_cents: 90000,
    // health_score explicitly undefined / missing
    country: 'US',
    provider_customer_id: 'cus_no_health',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  const missingHealthQueue = await ExpansionFinderEngine.evaluateWorkspace(wsMissingHealth);
  const recNoHealth = missingHealthQueue.queue.find((r) => r.customerId === 'cust_no_health')!;
  console.log('recNoHealth is:', recNoHealth);
  assert.strictEqual(recNoHealth.evidenceStatus, 'insufficient_evidence', 'Missing health must be insufficient evidence');
  assert.strictEqual(recNoHealth.estimatedValueCents, null, 'Missing health must not fabricate an expansion amount');
  assert.ok(
    recNoHealth.evidenceDetails.length > 0,
    'Evidence details should be present'
  );
  console.log('  ✓ PASS: Missing health score defaults to null/unknown without fabricated 85 fallback.');

  console.log('======================================================');
  console.log('EXPANSION FINDER TESTS: ALL PASSED (100%)');
  console.log('======================================================');
}

runExpansionFinderTests().catch((err) => {
  console.error('❌ Expansion Finder Test Failed:', err);
  process.exit(1);
});
