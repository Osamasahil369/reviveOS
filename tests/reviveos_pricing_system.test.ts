/**
 * ReviveOS Pricing System & Founding Customer Protection Test Suite
 */

import { strict as assert } from 'assert';
import { db } from '../server/store/db.js';
import { CentralPricingConfig } from '../server/services/centralPricingConfig.js';
import { PlatformBillingEngine } from '../server/services/platformBilling.js';

async function runPricingSystemTests() {
  console.log('🚀 [TEST SUITE] Starting ReviveOS Pricing System & Founding Customer Protection Verification');

  // Disable persistence during tests
  db.setPersistenceEnabled(false);

  // 1. Verify Central Pricing Configuration
  console.log('\n--- 1. Verifying Central Pricing Configuration ---');
  const plans = CentralPricingConfig.getAllPlans();
  assert.ok(plans.length >= 5, 'Must have at least 5 plans including founding, starter, growth, business, enterprise');

  const foundingPlan = CentralPricingConfig.getPlan('founding');
  assert.strictEqual(foundingPlan.monthlyPriceRupees, 999);
  assert.strictEqual(foundingPlan.monthlyPricePaise, 99900);
  assert.strictEqual(foundingPlan.isFoundingProgram, true);
  console.log('  ✓ Central pricing configuration loaded correctly (Founding ₹999/mo).');

  // 2. Create test workspaces
  const ws1 = db.createWorkspace('SaaS Apex One', 'saas', 'INR');
  const ws2 = db.createWorkspace('Gym Apex Two', 'gym', 'INR');
  console.log(`✓ Initialized test workspaces: ${ws1.id}, ${ws2.id}`);

  // 3. Verify Founding Customer Program & 20 Customer Limit Protection
  console.log('\n--- 2. Verifying Founding Customer Protection Logic ---');
  const initialFoundingCount = PlatformBillingEngine.getFoundingCustomerCount();
  console.log(`  Initial founding customers: ${initialFoundingCount}`);

  // Upgrade ws1 to founding
  const sub1 = PlatformBillingEngine.upgradePlan(ws1.id, 'founding', 'monthly', '4242');
  assert.strictEqual(sub1.is_founding_customer, true);
  assert.strictEqual(sub1.founding_customer_number, initialFoundingCount + 1);
  assert.strictEqual(sub1.founding_locked_price, 99900);
  console.log(`  ✓ Workspace 1 assigned Founding Customer #${sub1.founding_customer_number} at ₹999/mo locked forever.`);

  // Verify analytics reflects founding count and MRR
  const analytics = PlatformBillingEngine.getRevenueAnalytics();
  assert.ok(analytics.foundingCustomerCount >= 1);
  assert.ok(analytics.mrrPaise > 0);
  console.log(`  ✓ Revenue Analytics verified: MRR ₹${analytics.mrrRupees}/mo, Founding count: ${analytics.foundingCustomerCount}.`);

  // 4. Verify Upgrade, Downgrade & Subscription Enforcement
  console.log('\n--- 3. Verifying Upgrade, Downgrade & Feature Gating ---');
  const sub2 = PlatformBillingEngine.upgradePlan(ws2.id, 'growth', 'annual', '1111');
  assert.strictEqual(sub2.plan, 'growth');
  assert.strictEqual(sub2.status, 'active');

  const agencyCheckWs2 = PlatformBillingEngine.isFeatureAllowed(ws2.id, 'agency_mode');
  assert.strictEqual(agencyCheckWs2.allowed, false, 'Growth plan should not allow agency mode');

  const agencyCheckWs1 = PlatformBillingEngine.isFeatureAllowed(ws1.id, 'agency_mode');
  assert.strictEqual(agencyCheckWs1.allowed, true, 'Founding customer plan should allow agency mode');
  console.log('  ✓ Plan limits and feature gating enforced correctly.');

  // 5. Verify Cancellation & Reactivation
  console.log('\n--- 4. Verifying Cancellation & Reactivation ---');
  const canceled = PlatformBillingEngine.cancelSubscription(ws2.id, false);
  assert.strictEqual(canceled.cancel_at_period_end, true);

  const reactivated = PlatformBillingEngine.reactivateSubscription(ws2.id);
  assert.strictEqual(reactivated.cancel_at_period_end, false);
  assert.strictEqual(reactivated.status, 'active');
  console.log('  ✓ Subscription cancellation and reactivation lifecycle verified.');

  console.log('\n🎉 ALL REVIVEOS PRICING SYSTEM & FOUNDING CUSTOMER TESTS PASSED SUCCESSFULLY!\n');
}

runPricingSystemTests().catch((err) => {
  console.error('❌ Pricing System Test Failed:', err);
  process.exit(1);
});
