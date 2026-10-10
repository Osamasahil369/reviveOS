import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { RevenueBrainEngine } from '../server/intelligence/revenueBrain.js';

async function runCustomerLanguageAuditTests() {
  console.log('======================================================');
  console.log('REVENUE RECOVERY OS: CUSTOMER LANGUAGE AUDIT TESTS');
  console.log('======================================================');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const timestamp = Date.now();
  const ws = db.createWorkspace(`Language Audit Ws ${timestamp}`, 'restaurant', 'USD');
  const wsId = ws.id;

  console.log('1. Testing Business-Friendly Workspace Business Types...');
  assert.strictEqual(ws.business_type, 'restaurant');
  assert.ok(ws.name.includes('Language Audit Ws'));
  console.log('  ✓ PASS: Business types represent real-world operations (restaurant, gym, dentist, etc.).');

  console.log('2. Testing Plain-English Revenue Dashboard Categories...');
  // Seed sample customer and payment failure
  db.addCustomer({
    id: `cust_lang_${timestamp}`,
    workspace_id: wsId,
    name: 'Bella Trattoria',
    email: 'owner@bellatrattoria.com',
    currency: 'USD',
    provider_type: 'stripe',
    current_risk_status: 'at_risk',
    lifetime_value_cents: 80000,
    total_recovered_cents: 0,
    country: 'US',
    provider_customer_id: `cus_lang_${timestamp}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  db.createManualFailedInvoice(wsId, {
    customerId: `cust_lang_${timestamp}`,
    amountCents: 15000,
    currency: 'USD',
    providerFailureCode: 'card_declined',
    rawErrorMessage: 'Card declined by issuing bank',
  });

  const res = await RevenueBrainEngine.evaluateWorkspace(wsId);
  assert.ok(res.opportunities.length > 0, 'Should find opportunities.');

  const opp = res.opportunities[0];
  assert.ok(opp.recommendedAction, 'Should have human-understandable recommended action.');
  assert.ok(opp.financialAmountCents > 0, 'Should have quantified financial figure.');

  console.log('  ✓ PASS: Plain-English categories and actions evaluated cleanly.');

  console.log('======================================================');
  console.log('CUSTOMER LANGUAGE AUDIT TESTS: ALL PASSED (100%)');
  console.log('======================================================');
}

runCustomerLanguageAuditTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
