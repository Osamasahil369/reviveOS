import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { RevenueBrainEngine } from '../server/intelligence/revenueBrain.js';

async function runRevenueBrainTests() {
  console.log('======================================================');
  console.log('REVENUE RECOVERY OS: REVENUE BRAIN ENGINE TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const wsA = 'ws_brain_test_A_' + Date.now();
  const wsB = 'ws_brain_test_B_' + Date.now();

  console.log('1. Testing Unified Multi-Category Aggregation & Categories...');

  // Workspace A Seed Data
  // Cust 1: Recovery Opportunity (soft decline)
  db.addCustomer({
    id: 'cust_brain_1',
    workspace_id: wsA,
    name: 'Alpha Recovery Enterprise',
    email: 'rec1@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'at_risk',
    lifetime_value_cents: 500000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: 'cus_brain1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  db.createManualFailedInvoice(wsA, {
    customerId: 'cust_brain_1',
    amountCents: 49000,
    currency: 'USD',
    providerFailureCode: 'insufficient_funds',
    rawErrorMessage: 'Insufficient funds for recurring charge',
  });

  // Cust 2: Churn Risk Candidate (Critical)
  db.addCustomer({
    id: 'cust_brain_2',
    workspace_id: wsA,
    name: 'Beta Churn AtRisk',
    email: 'churn2@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'critical',
    lifetime_value_cents: 1200000,
    total_recovered_cents: 0,
    health_score: 25,
    country: 'US',
    provider_customer_id: 'cus_brain2',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  db.addSubscription({
    id: 'sub_brain_2',
    workspace_id: wsA,
    customer_id: 'cust_brain_2',
    provider_type: 'stripe',
    provider_subscription_id: 'sub_b2',
    plan_name: 'Enterprise Scale Tier',
    amount_cents: 100000,
    currency: 'USD',
    billing_interval: 'monthly',
    status: 'past_due',
    subscription_start_date: new Date(Date.now() - 365 * 86400000).toISOString(),
    renewal_count: 12,
    current_period_end: new Date(Date.now() + 5 * 86400000).toISOString(),
    created_at: new Date().toISOString(),
  });

  // Cust 3: Expansion Candidate (Expansion Ready)
  db.addCustomer({
    id: 'cust_brain_3',
    workspace_id: wsA,
    name: 'Gamma Expansion HighFlyer',
    email: 'exp3@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 800000,
    total_recovered_cents: 100000,
    health_score: 95,
    country: 'US',
    provider_customer_id: 'cus_brain3',
    metadata: { expansion_amount_cents: 250000, expansion_signal: 'Seat upgrade pending approval' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  const evalA = await RevenueBrainEngine.evaluateWorkspace(wsA);

  assert.ok(evalA.opportunities.length >= 3, 'Evaluates unified opportunities across categories');
  assert.strictEqual(evalA.workspaceId, wsA, 'Matches workspace ID');

  const categoriesPresent = new Set(evalA.opportunities.map((o) => o.category));
  assert.ok(categoriesPresent.has('RECOVERY'), 'Contains RECOVERY category');
  assert.ok(categoriesPresent.has('CHURN_PREVENTION'), 'Contains CHURN_PREVENTION category');
  assert.ok(categoriesPresent.has('EXPANSION'), 'Contains EXPANSION category');

  console.log('  ✓ PASS: Unified multi-category aggregation verified across RECOVERY, CHURN_PREVENTION, and EXPANSION.');

  console.log('2. Testing Deterministic Ranking & Impact Scoring...');
  for (let i = 0; i < evalA.opportunities.length - 1; i++) {
    const item1 = evalA.opportunities[i];
    const item2 = evalA.opportunities[i + 1];

    assert.ok(
      typeof item1.impactScore === 'number' && item1.impactScore >= 0 && item1.impactScore <= 100,
      'Impact score is integer 0-100'
    );

    // Verify Priority Tier ordering
    const P_RANK: Record<string, number> = { P1_CRITICAL: 4, P2_HIGH: 3, P3_MEDIUM: 2, P4_LOW: 1 };
    assert.ok(
      P_RANK[item1.priorityTier] >= P_RANK[item2.priorityTier],
      `Tier ordering preserved (${item1.priorityTier} >= ${item2.priorityTier})`
    );

    assert.ok(
      item1.rankingExplanation.includes(`Ranked #${i + 1}`),
      `Ranking explanation contains correct 1-based rank #${i + 1}`
    );
  }

  console.log('  ✓ PASS: Multi-category deterministic ranking and impact scoring verified.');

  console.log('3. Testing Missing Data Handling...');
  const emptyWs = 'ws_empty_' + Date.now();
  const emptyEval = await RevenueBrainEngine.evaluateWorkspace(emptyWs);

  assert.strictEqual(emptyEval.totalOpportunities, 0, 'Empty workspace totalOpportunities = 0');
  assert.strictEqual(emptyEval.opportunities.length, 0, 'Empty workspace opportunities array is empty');
  assert.strictEqual(emptyEval.totalAtRiskCents, 0, 'Empty workspace totalAtRiskCents = 0');
  assert.strictEqual(emptyEval.totalRecoverableCents, 0, 'Empty workspace totalRecoverableCents = 0');
  assert.strictEqual(emptyEval.totalExpansionValueCents, 0, 'Empty workspace totalExpansionValueCents = 0');

  console.log('  ✓ PASS: Missing data / empty workspace handled cleanly without errors or fabricated values.');

  console.log('4. Testing Multi-Tenant Isolation...');
  db.addCustomer({
    id: 'cust_brain_wsB',
    workspace_id: wsB,
    name: 'Workspace B Isolated Customer',
    email: 'wsb@test.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'healthy',
    lifetime_value_cents: 990000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: 'cus_wsB1',
    metadata: { expansion_amount_cents: 500000 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  const evalB = await RevenueBrainEngine.evaluateWorkspace(wsB);
  assert.strictEqual(evalB.workspaceId, wsB);
  assert.ok(evalB.opportunities.some((o) => o.customerId === 'cust_brain_wsB'), 'Workspace B contains Workspace B customer');

  const evalA2 = await RevenueBrainEngine.evaluateWorkspace(wsA);
  assert.strictEqual(
    evalA2.opportunities.some((o) => o.customerId === 'cust_brain_wsB'),
    false,
    'Workspace A contains ZERO records from Workspace B'
  );

  console.log('  ✓ PASS: Multi-tenant workspace isolation strictly enforced.');

  console.log('5. Testing Read-Only Safety Guardrails...');
  const customersBefore = db.getCustomers(wsA);
  const oppsBefore = db.getOpportunities(wsA);

  await RevenueBrainEngine.evaluateWorkspace(wsA);

  const customersAfter = db.getCustomers(wsA);
  const oppsAfter = db.getOpportunities(wsA);

  assert.strictEqual(customersAfter.length, customersBefore.length, 'Customer count unchanged');
  assert.strictEqual(oppsAfter.length, oppsBefore.length, 'Opportunity count unchanged');

  console.log('  ✓ PASS: Read-only intelligence layer verified; zero state mutation.');

  console.log('6. Testing Category Filtering & Slicing Limits...');
  const recOnly = await RevenueBrainEngine.evaluateWorkspace(wsA, { category: 'RECOVERY' });
  for (const o of recOnly.opportunities) {
    assert.strictEqual(o.category, 'RECOVERY', 'Category filter strictly returns RECOVERY');
  }

  const limitEval = await RevenueBrainEngine.evaluateWorkspace(wsA, { limit: 1 });
  assert.strictEqual(limitEval.opportunities.length, 1, 'Limit parameter strictly caps returned array');
  assert.strictEqual(limitEval.totalOpportunities, evalA.totalOpportunities, 'Total metric retains full workspace count');

  console.log('  ✓ PASS: Category filtering and pagination limits verified.');

  console.log('======================================================');
  console.log('REVENUE BRAIN TESTS: ALL PASSED (100%)');
  console.log('======================================================');
}

runRevenueBrainTests().catch((err) => {
  console.error('❌ Revenue Brain Test Failed:', err);
  process.exit(1);
});
