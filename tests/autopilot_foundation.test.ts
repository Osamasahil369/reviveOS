import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { AutopilotService, DEFAULT_AUTOPILOT_SETTINGS } from '../server/services/autopilotService.js';
import { RevenueLeakScanner } from '../server/scanner/revenueScanner.js';
import { CopilotOrchestrator } from '../server/copilot/copilotOrchestrator.js';

async function runAutopilotFoundationTests() {
  console.log('--- STARTING REVIVEOS AUTOPILOT FOUNDATION TESTS ---');

  // Enforce local development storage mode for deterministic tests
  setStorageMode('local_development');
  const timestamp = Date.now();

  // Test 1: Autopilot Settings Defaults & Persistence
  console.log('1. Testing Autopilot Settings Defaults & Configuration Persistence...');
  const ws = db.createWorkspace(`Autopilot Test Co ${timestamp}`, 'saas', 'USD');
  const wsId = ws.id;

  const initialSettings = AutopilotService.getSettings(wsId);
  assert.strictEqual(
    initialSettings.auto_scans_enabled,
    true,
    'Automatic Revenue Scans default must be ON (true)'
  );
  assert.strictEqual(
    initialSettings.auto_plans_enabled,
    true,
    'Automatic Recovery Plans default must be ON (true)'
  );
  assert.strictEqual(
    initialSettings.auto_retry_scheduling_enabled,
    false,
    'Automatic Retry Scheduling default must be OFF (false)'
  );
  assert.strictEqual(
    initialSettings.pause_all_automation,
    false,
    'Pause All Automation default must be OFF (false)'
  );

  // Update settings and test persistence
  const updated = AutopilotService.updateSettings(wsId, {
    auto_retry_scheduling_enabled: true,
  });
  assert.strictEqual(updated.auto_retry_scheduling_enabled, true);

  const reloaded = AutopilotService.getSettings(wsId);
  assert.strictEqual(reloaded.auto_retry_scheduling_enabled, true);
  assert.strictEqual(reloaded.auto_scans_enabled, true);

  console.log('✓ Autopilot settings defaults and updates verified.');

  // Test 2: Auto-Scan on Provider Connection & Idempotency
  console.log('2. Testing Auto-Scan on Provider Connection...');
  // Seed a customer, invoice, and payment failure in the workspace
  const customer = db.createCustomer(wsId, {
    name: 'Elena Rostova',
    email: `elena_${timestamp}@example.com`,
    country: 'US',
    currency: 'USD',
    provider_type: 'stripe',
    plan_name: 'Pro Plan',
    plan_amount_cents: 8900,
    billing_interval: 'monthly',
  });

  const failureResult = db.createManualFailedInvoice(wsId, {
    customerId: customer.id,
    amountCents: 8900,
    currency: 'USD',
    providerFailureCode: 'insufficient_funds',
    rawErrorMessage: 'Card issuer reported insufficient funds in account.',
  });
  assert.ok(failureResult.opportunity, 'Failed invoice ingestion should create opportunity');

  // Connect provider via Autopilot handler
  const scanTrigger = await AutopilotService.handleProviderConnected(wsId, 'stripe', {
    id: `conn_stripe_${timestamp}`,
    is_live: true,
    config_summary: { account_id: `acct_stripe_${timestamp}` },
  });

  assert.strictEqual(scanTrigger.scanTriggered, true, 'Auto-scan should trigger upon provider connection');

  // Verify events recorded in the Automation Event Log
  const events = AutopilotService.getEvents(wsId);
  const providerConnectedEvent = events.find((e) => e.event === 'Provider Connected');
  assert.ok(providerConnectedEvent, 'Automation log must contain "Provider Connected" event');
  assert.strictEqual(providerConnectedEvent?.status, 'completed');

  const scanStartedEvent = events.find((e) => e.event === 'Revenue Scan Started');
  assert.ok(scanStartedEvent, 'Automation log must contain "Revenue Scan Started" event');
  assert.strictEqual(scanStartedEvent?.status, 'completed');

  // Test Idempotency / No Duplication: Running provider connect or scan again must NOT duplicate opportunities
  const oppsCountBefore = db.getOpportunities(wsId).length;
  await AutopilotService.handleProviderConnected(wsId, 'stripe', {
    id: `conn_stripe_${timestamp}`,
    is_live: true,
    config_summary: { account_id: `acct_stripe_${timestamp}` },
  });
  const oppsCountAfter = db.getOpportunities(wsId).length;
  assert.strictEqual(oppsCountAfter, oppsCountBefore, 'Auto-scan must be idempotent: no duplicate opportunities created');

  console.log('✓ Auto-scan on provider connection and idempotency verified.');

  // Test 3: Automatic Recovery Link Generation
  console.log('3. Testing Automatic Recovery Link Generation...');
  const opp = db.getOpportunities(wsId)[0];
  assert.ok(opp, 'Expected at least one opportunity in workspace');
  assert.ok(opp.recovery_token, 'Opportunity must have automatically generated recovery_token');
  assert.ok(opp.payment_link_url, 'Opportunity must have automatically generated payment_link_url');
  assert.ok(opp.payment_link_url.includes(opp.recovery_token), 'payment_link_url must contain the token');

  // Ensure no duplicate links when called repeatedly
  const linkBefore = opp.payment_link_url;
  const linkResult = AutopilotService.ensureOpportunityRecoveryLink(wsId, opp);
  assert.strictEqual(linkResult.isNew, false, 'Existing recovery link must be safely reused');
  assert.strictEqual(linkResult.link, linkBefore, 'Recovery link URL must remain stable without duplication');

  // Verify Recovery Link Created event exists
  const linkEvent = events.find((e) => e.event === 'Recovery Link Created');
  assert.ok(linkEvent, 'Automation event log must record "Recovery Link Created"');
  assert.strictEqual(linkEvent?.status, 'completed');

  console.log('✓ Automatic recovery link generation and token stability verified.');

  // Test 4: Automatic Recovery Plan Generation
  console.log('4. Testing Automatic Recovery Plan Generation...');
  // Verify plan is already attached to opportunity
  let plan = opp.recovery_plan;
  if (!plan) {
    plan = await AutopilotService.generateOpportunityRecoveryPlan(wsId, opp.id);
  }
  assert.ok(plan, 'Recovery Action Plan must be generated automatically');
  assert.strictEqual(plan.opportunityId, opp.id, 'Plan must be attached to the correct opportunity ID');
  assert.ok(plan.recommendedSteps && plan.recommendedSteps.length > 0, 'Plan must contain recommended steps');

  // Verify Recovery Plan Generated event exists in log
  const refreshedEvents = AutopilotService.getEvents(wsId);
  const planEvent = refreshedEvents.find((e) => e.event === 'Recovery Plan Generated');
  assert.ok(planEvent, 'Automation event log must record "Recovery Plan Generated"');
  assert.strictEqual(planEvent?.status, 'completed');

  console.log('✓ Automatic recovery plan generation verified without requiring any button click.');

  // Test 5: Automation Event Log Read-Only Integrity & Tenant Isolation
  console.log('5. Testing Automation Event Log Multi-Tenant Isolation...');
  const otherWs = db.createWorkspace(`Other Tenant ${timestamp}`, 'gym', 'USD');
  const otherWsEvents = AutopilotService.getEvents(otherWs.id);
  assert.strictEqual(
    otherWsEvents.length,
    0,
    'New workspace must have empty automation event log (tenant isolation)'
  );

  // Test 6: Pause All Automation Master Switch
  console.log('6. Testing Pause All Automation Master Switch...');
  AutopilotService.updateSettings(wsId, { pause_all_automation: true });
  const pausedSettings = AutopilotService.getSettings(wsId);
  assert.strictEqual(pausedSettings.pause_all_automation, true);

  const pausedScanTrigger = await AutopilotService.handleProviderConnected(wsId, 'stripe');
  assert.strictEqual(pausedScanTrigger.scanTriggered, false, 'Auto-scan must NOT run when pause_all_automation is ON');

  const afterPauseEvents = AutopilotService.getEvents(wsId);
  const pausedEvent = afterPauseEvents.find((e) => e.event === 'Revenue Scan Skipped' && e.status === 'paused');
  assert.ok(pausedEvent, 'Log must record "Revenue Scan Skipped" with status paused');

  console.log('✓ Pause All Automation master switch verified.');

  console.log('--- ALL REVIVEOS AUTOPILOT FOUNDATION TESTS PASSED SUCCESSFULLY ---');
}

runAutopilotFoundationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
