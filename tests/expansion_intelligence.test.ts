import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { ExpansionFinderEngine } from '../server/intelligence/expansionFinder.js';

async function runExpansionIntelligenceTests() {
  console.log('======================================================');
  console.log('REVENUE RECOVERY OS: EXPANSION INTELLIGENCE ENGINE TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const wsA = 'ws_expansion_test_A_' + Date.now();
  const wsB = 'ws_expansion_test_B_' + Date.now();

  console.log('1. Testing Scoring Tiers (EXPANSION_READY, GROWTH_SIGNAL, WATCH, NO_SIGNAL)...');

  // Customer 1: EXPANSION_READY via explicit contract metadata
  db.addCustomer({
    id: 'cust_ready_1',
    workspace_id: wsA,
    name: 'Expansion Ready Alpha',
    email: 'ready1@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 300000,
    total_recovered_cents: 50000,
    health_score: 92,
    country: 'US',
    provider_customer_id: 'cus_ready1',
    metadata: { expansion_amount_cents: 120000, expansion_signal: 'Enterprise tier contract expansion pending' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // Customer 2: GROWTH_SIGNAL via explicit growth telemetry
  db.addCustomer({
    id: 'cust_growth_2',
    workspace_id: wsA,
    name: 'Growth Signal Beta',
    email: 'growth2@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 150000,
    total_recovered_cents: 0,
    health_score: 75,
    country: 'US',
    provider_customer_id: 'cus_growth2',
    metadata: { usage_growth_pct: 45, seat_expansion: true },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // Customer 3: WATCH via moderate health/recent friction
  db.addCustomer({
    id: 'cust_watch_3',
    workspace_id: wsA,
    name: 'Watch Candidate Gamma',
    email: 'watch3@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'at_risk',
    lifetime_value_cents: 80000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: 'cus_watch3',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  db.addPaymentFailure({
    id: 'fail_watch_3',
    workspace_id: wsA,
    customer_id: 'cust_watch_3',
    invoice_id: 'inv_watch_3',
    amount_cents: 15000,
    currency: 'USD',
    provider_type: 'stripe',
    provider_failure_code: 'insufficient_funds',
    normalized_category: 'insufficient_funds',
    raw_error_message: 'Insufficient funds',
    occurred_at: new Date().toISOString(),
    is_resolved: true,
    created_at: new Date().toISOString(),
  });

  // Customer 4: NO_SIGNAL via unresolved active failure
  db.addCustomer({
    id: 'cust_nosig_4',
    workspace_id: wsA,
    name: 'No Signal Delta',
    email: 'nosig4@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'at_risk',
    lifetime_value_cents: 20000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: 'cus_nosig4',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  db.addPaymentFailure({
    id: 'fail_nosig_4',
    workspace_id: wsA,
    customer_id: 'cust_nosig_4',
    invoice_id: 'inv_nosig_4',
    amount_cents: 20000,
    currency: 'USD',
    provider_type: 'stripe',
    provider_failure_code: 'card_declined',
    normalized_category: 'payment_method_declined',
    raw_error_message: 'Card declined',
    occurred_at: new Date().toISOString(),
    is_resolved: false,
    created_at: new Date().toISOString(),
  });

  const evalA = await ExpansionFinderEngine.evaluateWorkspace(wsA);
  const recReady = evalA.queue.find((r) => r.customerId === 'cust_ready_1')!;
  const recGrowth = evalA.queue.find((r) => r.customerId === 'cust_growth_2')!;
  const recWatch = evalA.queue.find((r) => r.customerId === 'cust_watch_3')!;
  const recNoSig = evalA.queue.find((r) => r.customerId === 'cust_nosig_4')!;

  assert.strictEqual(recReady.expansionTier, 'EXPANSION_READY', 'Tier mapped to EXPANSION_READY');
  assert.strictEqual(recGrowth.expansionTier, 'GROWTH_SIGNAL', 'Tier mapped to GROWTH_SIGNAL');
  assert.strictEqual(recWatch.expansionTier, 'WATCH', 'Tier mapped to WATCH');
  assert.strictEqual(recNoSig.expansionTier, 'NO_SIGNAL', 'Tier mapped to NO_SIGNAL');

  console.log('  ✓ PASS: Scoring tiers correctly categorized.');

  console.log('2. Testing Explainable Drivers Generation...');
  assert.ok(recReady.explainableDrivers.length > 0, 'EXPANSION_READY has explainable drivers');
  assert.ok(
    recReady.explainableDrivers.some((d) => d.includes('Increasing Spend') || d.includes('Healthy Account')),
    'Drivers include spend and account health'
  );

  console.log('  ✓ PASS: Grounded explainable drivers generated.');

  console.log('3. Testing Deterministic Valuation...');
  assert.strictEqual(recReady.estimatedValueCents, 120000, 'Explicit expansion amount used deterministically');
  assert.ok(recReady.estimatedValueLabel.includes('1200.00'), 'Estimated value label formatted');

  console.log('  ✓ PASS: Deterministic expansion valuation verified.');

  console.log('4. Testing Missing Data Handling...');
  assert.strictEqual(recNoSig.estimatedValueCents, null, 'Missing data produces null estimated value');
  assert.strictEqual(recNoSig.evidenceStatus, 'insufficient_evidence', 'Missing data marked as insufficient evidence');

  console.log('  ✓ PASS: Missing data handled cleanly without hallucinated values.');

  console.log('5. Testing Multi-Tenant Isolation...');
  db.addCustomer({
    id: 'cust_wsB_1',
    workspace_id: wsB,
    name: 'Workspace B Customer',
    email: 'wsb@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 900000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: 'cus_wsb1',
    metadata: { expansion_amount_cents: 500000 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  const evalB = await ExpansionFinderEngine.evaluateWorkspace(wsB);
  assert.strictEqual(evalB.queue.length, 1, 'Workspace B queue isolated');
  assert.strictEqual(evalB.queue[0].workspaceId, wsB, 'Record workspace matches wsB');

  const evalA2 = await ExpansionFinderEngine.evaluateWorkspace(wsA);
  assert.strictEqual(
    evalA2.queue.some((r) => r.customerId === 'cust_wsB_1'),
    false,
    'Workspace A contains ZERO records from Workspace B'
  );

  console.log('  ✓ PASS: Multi-tenant isolation verified.');

  console.log('======================================================');
  console.log('EXPANSION INTELLIGENCE TESTS: ALL PASSED (100%)');
  console.log('======================================================');
}

runExpansionIntelligenceTests().catch((err) => {
  console.error('❌ Expansion Intelligence Test Failed:', err);
  process.exit(1);
});
