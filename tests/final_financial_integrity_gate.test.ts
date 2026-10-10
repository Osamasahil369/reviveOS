import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';

async function runFinalFinancialIntegrityGateTests() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY OS: FINAL FINANCIAL INTEGRITY GATE TESTS');
  console.log('======================================================\n');

  setStorageMode('local_development');
  db.setPersistenceEnabled(false);

  // Test A — recovered revenue source of truth (Opportunity amount 9000 vs Revenue Event amount 5000)
  console.log('Test A — recovered revenue source of truth (opportunity 9000 vs event 5000)...');
  const wsA = `ws_test_a_${Date.now()}`;
  db.createWorkspace('Test Workspace A', 'saas', 'USD', false);
  const dbAny = db as any;
  dbAny.revenueEvents.push({
    id: `rev_${Date.now()}_1`,
    workspace_id: wsA,
    customer_id: 'cust_1',
    customer_name: 'Test Cust',
    customer_email: 'test@test.com',
    provider_type: 'stripe',
    event_type: 'revenue_recovered',
    amount_cents: 5000,
    currency: 'USD',
    recovered_via: 'smart_retry',
    recorded_at: new Date().toISOString(),
  });
  dbAny.recoveryOpportunities.push({
    id: `opp_${Date.now()}_1`,
    workspace_id: wsA,
    customer_id: 'cust_1',
    status: 'recovered',
    recovered_amount_cents: 9000, // Opportunity amount 9000 must NOT be used for realized revenue
    currency: 'USD',
    amount_at_risk_cents: 9000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    customer: { name: 'Test', email: 'test@test.com' },
    payment_failure: {},
  });

  let metricsA = db.getMetrics(wsA);
  assert.strictEqual(
    metricsA.revenue_recovered_cents,
    5000,
    `Test A failed: expected 5000 from revenue event, got ${metricsA.revenue_recovered_cents} (improperly used opportunity 9000)`
  );
  assert.strictEqual(
    metricsA.totalsByCurrency.USD.revenue_recovered_cents,
    5000,
    `Test A failed: expected totalsByCurrency.USD.revenue_recovered_cents to be 5000, got ${metricsA.totalsByCurrency.USD.revenue_recovered_cents}`
  );
  console.log('  ✓ PASS: Test A');

  // Test B — opportunity alone is not realized revenue
  console.log('Test B — opportunity alone is not realized revenue...');
  const wsB = `ws_test_b_${Date.now()}`;
  dbAny.recoveryOpportunities.push({
    id: `opp_${Date.now()}_2`,
    workspace_id: wsB,
    customer_id: 'cust_2',
    status: 'recovered',
    recovered_amount_cents: 9000,
    currency: 'USD',
    amount_at_risk_cents: 9000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    customer: { name: 'Test B', email: 'b@test.com' },
    payment_failure: {},
  });
  let metricsB = db.getMetrics(wsB);
  assert.strictEqual(
    metricsB.revenue_recovered_cents,
    0,
    `Test B failed: expected 0 realized revenue without revenue_recovered event, got ${metricsB.revenue_recovered_cents}`
  );
  console.log('  ✓ PASS: Test B');

  // Test C — revenue event filtering
  console.log('Test C — revenue event filtering...');
  const wsC = `ws_test_c_${Date.now()}`;
  dbAny.revenueEvents.push(
    { id: `rev_c1`, workspace_id: wsC, customer_id: 'c1', event_type: 'revenue_recovered', amount_cents: 5000, currency: 'USD', recorded_at: new Date().toISOString() },
    { id: `rev_c2`, workspace_id: wsC, customer_id: 'c2', event_type: 'revenue_lost', amount_cents: 10000, currency: 'USD', recorded_at: new Date().toISOString() },
    { id: `rev_c3`, workspace_id: wsC, customer_id: 'c3', event_type: 'churn_prevented', amount_cents: 15000, currency: 'USD', recorded_at: new Date().toISOString() }
  );
  let metricsC = db.getMetrics(wsC);
  assert.strictEqual(
    metricsC.revenue_recovered_cents,
    5000,
    `Test C failed: expected 5000, got ${metricsC.revenue_recovered_cents}`
  );
  console.log('  ✓ PASS: Test C');

  // Test D — mixed currency
  console.log('Test D — mixed currency...');
  const wsD = `ws_test_d_${Date.now()}`;
  dbAny.workspaces.push({
    id: wsD,
    name: 'INR Workspace',
    slug: 'inr-ws',
    currency: 'INR',
    business_type: 'saas',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  dbAny.revenueEvents.push(
    { id: `rev_d1`, workspace_id: wsD, customer_id: 'c1', event_type: 'revenue_recovered', amount_cents: 5000, currency: 'INR', recorded_at: new Date().toISOString() },
    { id: `rev_d2`, workspace_id: wsD, customer_id: 'c2', event_type: 'revenue_recovered', amount_cents: 7000, currency: 'USD', recorded_at: new Date().toISOString() }
  );
  let metricsD = db.getMetrics(wsD);
  assert.strictEqual(
    metricsD.currency,
    'INR',
    'Primary currency is INR'
  );
  assert.strictEqual(
    metricsD.revenue_recovered_cents,
    5000,
    `Test D failed: primary revenue_recovered_cents expected 5000 INR, got ${metricsD.revenue_recovered_cents}`
  );
  assert.strictEqual(
    metricsD.totalsByCurrency.USD.revenue_recovered_cents,
    7000,
    `Test D failed: USD totalsByCurrency expected 7000 USD, got ${metricsD.totalsByCurrency.USD.revenue_recovered_cents}`
  );
  console.log('  ✓ PASS: Test D');

  // Test E — churn prevention (no implicit recovery counts)
  console.log('Test E — churn prevention (0 churn_prevented events)...');
  const wsE = `ws_test_e_${Date.now()}`;
  dbAny.recoveryOpportunities.push(
    { id: `opp_e1`, workspace_id: wsE, status: 'recovered', recovered_amount_cents: 1000 },
    { id: `opp_e2`, workspace_id: wsE, status: 'recovered', recovered_amount_cents: 1000 },
    { id: `opp_e3`, workspace_id: wsE, status: 'recovered', recovered_amount_cents: 1000 }
  );
  let metricsE = db.getMetrics(wsE);
  assert.strictEqual(
    metricsE.churn_prevented_count,
    null,
    `Test E failed: expected churn_prevented_count to be null when no explicit churn_prevented events exist, got ${metricsE.churn_prevented_count}`
  );
  console.log('  ✓ PASS: Test E');

  // Test F — explicit churn prevention
  console.log('Test F — explicit churn prevention...');
  const wsF = `ws_test_f_${Date.now()}`;
  dbAny.revenueEvents.push({
    id: `rev_f1`,
    workspace_id: wsF,
    customer_id: 'cust_f',
    event_type: 'churn_prevented',
    amount_cents: 2000,
    currency: 'USD',
    recorded_at: new Date().toISOString(),
  });
  let metricsF = db.getMetrics(wsF);
  assert.strictEqual(
    metricsF.churn_prevented_count,
    1,
    `Test F failed: expected churn_prevented_count to be 1, got ${metricsF.churn_prevented_count}`
  );
  console.log('  ✓ PASS: Test F');

  // Test G — no subscriptions + customer LTV -> MRR = 0, ARR = 0
  console.log('Test G — no subscriptions + customer LTV -> MRR = 0, ARR = 0...');
  const wsG = `ws_test_g_${Date.now()}`;
  dbAny.customers.push({
    id: 'cust_g1',
    workspace_id: wsG,
    name: 'No Sub Cust',
    email: 'nosub@test.com',
    currency: 'USD',
    lifetime_value_cents: 120000,
    current_risk_status: 'healthy',
  });
  let metricsG = db.getMetrics(wsG);
  assert.strictEqual(metricsG.mrr_cents, 0, `Test G failed: expected mrr_cents = 0 without subscriptions, got ${metricsG.mrr_cents}`);
  assert.strictEqual(metricsG.arr_cents, 0, `Test G failed: expected arr_cents = 0 without subscriptions, got ${metricsG.arr_cents}`);
  console.log('  ✓ PASS: Test G');

  console.log('======================================================');
  console.log('FINANCIAL & REPORTING INTEGRITY TESTS: ALL PASSED (100%)');
  console.log('======================================================\n');
}

runFinalFinancialIntegrityGateTests().catch((err) => {
  console.error('❌ Reporting Integrity Gate Test Failed:', err);
  process.exit(1);
});
