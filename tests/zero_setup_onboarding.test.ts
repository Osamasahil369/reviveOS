import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { RevenueBrainEngine } from '../server/intelligence/revenueBrain.js';
import { AiOpportunityEngine } from '../server/intelligence/opportunityEngine.js';

async function runZeroSetupOnboardingTests() {
  console.log('======================================================');
  console.log('REVENUE RECOVERY OS: ZERO-SETUP ONBOARDING TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const timestamp = Date.now();

  // Test 1: New Workspace & Business Type Selection
  console.log('1. Testing New Workspace Creation & Non-Technical Business Types...');
  const wsTypes = [
    { id: `ws_rest_${timestamp}`, name: 'Bella Italia Restaurant', type: 'restaurant' },
    { id: `ws_gym_${timestamp}`, name: 'Apex Fitness Gym', type: 'gym' },
    { id: `ws_dentist_${timestamp}`, name: 'BrightSmiles Dental', type: 'dentist' },
    { id: `ws_hotel_${timestamp}`, name: 'Grand Horizon Hotel', type: 'hotel' },
    { id: `ws_saas_${timestamp}`, name: 'CloudScale SaaS', type: 'saas' },
  ];

  for (const item of wsTypes) {
    const newWs = db.createWorkspace(item.name, item.type as any, 'USD');

    assert.ok(newWs, `Workspace ${item.name} should be created successfully.`);
    assert.strictEqual(newWs.business_type, item.type);
  }
  console.log('  ✓ PASS: Business types (restaurant, gym, dentist, hotel, saas) successfully created.');

  // Test 2: Empty Workspace & Empty State Behavior
  console.log('2. Testing Empty Workspace & Empty State Data Integrity...');
  const emptyWs = db.createWorkspace(`Empty Onboard ${timestamp}`, 'restaurant', 'USD');
  const emptyWsId = emptyWs.id;

  const emptyBrain = await RevenueBrainEngine.evaluateWorkspace(emptyWsId);
  assert.strictEqual(emptyBrain.workspaceId, emptyWsId);
  assert.strictEqual(emptyBrain.totalOpportunities, 0);
  assert.strictEqual(emptyBrain.totalAtRiskCents, 0);
  assert.strictEqual(emptyBrain.opportunities.length, 0);

  const emptyQueue = await AiOpportunityEngine.generatePrioritizedQueue(emptyWsId);
  assert.strictEqual(emptyQueue.queue.length, 0);
  console.log('  ✓ PASS: Empty workspace returns zero metrics cleanly without errors or fake data.');

  // Test 3: Provider Connected vs. Not Connected State
  console.log('3. Testing Provider Connected vs. Provider Not Connected...');
  let connections = db.getProviderConnections(emptyWsId);
  assert.strictEqual(connections.length, 0, 'Initially zero connections exist.');

  // Connect Stripe provider
  (db as any).providerConnections.push({
    id: `conn_stripe_${timestamp}`,
    workspace_id: emptyWsId,
    provider_type: 'stripe',
    status: 'connected',
    is_live: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    capabilities: {
      canRetryDirectly: true,
      canGeneratePaymentLink: true,
      supportsSmartRetries: true,
      supportsSubscriptionPausation: true,
      supportsCustomerPortal: true,
    },
  });

  connections = db.getProviderConnections(emptyWsId);
  assert.ok(connections.length >= 1, 'Provider connection should now exist.');
  assert.strictEqual(connections[0].status, 'connected');
  assert.strictEqual(connections[0].provider_type, 'stripe');
  console.log('  ✓ PASS: Provider connection state correctly transitions from unconnected to connected.');

  // Test 4: First Scan Experience & First Value Analysis
  console.log('4. Testing First Scan Experience & First Value Metrics Generation...');
  // Add customer & payment failure to simulate post-connect scan
  db.addCustomer({
    id: `cust_scan_1_${timestamp}`,
    workspace_id: emptyWsId,
    name: 'Sample Restaurant Customer',
    email: 'guest@restaurant.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'at_risk',
    lifetime_value_cents: 120000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: 'cus_rest_1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  db.createManualFailedInvoice(emptyWsId, {
    customerId: `cust_scan_1_${timestamp}`,
    amountCents: 25000, // $250.00
    currency: 'USD',
    providerFailureCode: 'card_declined',
    rawErrorMessage: 'Card declined by issuing bank',
  });

  const firstScanBrain = await RevenueBrainEngine.evaluateWorkspace(emptyWsId);
  assert.ok(firstScanBrain.totalOpportunities > 0, 'First scan should detect opportunities.');
  assert.ok(firstScanBrain.totalAtRiskCents >= 25000, 'Total at risk should reflect at least $250.00.');
  
  const recOpp = firstScanBrain.opportunities.find((o) => o.category === 'RECOVERY');
  assert.ok(recOpp, 'Recovery opportunity should be detected in first scan.');
  assert.strictEqual(recOpp.financialAmountCents, 25000, 'Recovery opportunity amount should be $250.00.');
  assert.ok(recOpp.recommendedAction.length > 0, 'Recommended action must be populated.');

  console.log('  ✓ PASS: First scan experience successfully generates first value revenue metrics.');

  console.log('======================================================');
  console.log('ZERO-SETUP ONBOARDING TESTS: ALL PASSED (100%)');
  console.log('======================================================');
}

runZeroSetupOnboardingTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
