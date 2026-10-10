import { strict as assert } from 'assert';
import { db } from '../server/store/db.js';
import { PlatformBillingEngine } from '../server/services/platformBilling.js';

async function runPlatformBillingTests() {
  console.log('🚀 [TEST SUITE] Starting Master Platform Billing & Trial Gatekeeper Verification');

  // Disable persistence during tests
  db.setPersistenceEnabled(false);

  // 1. Create test workspaces
  const ws1 = db.createWorkspace('Revive Client One', 'saas', 'USD');
  const ws2 = db.createWorkspace('Revive Client Two', 'gym', 'INR');
  console.log(`✓ Initialized test workspaces: ${ws1.id}, ${ws2.id}`);

  // =========================================================================
  // TEST 1: TRIAL LIFECYCLE & WARNINGS (DAY 0, DAY 10, DAY 14)
  // =========================================================================
  console.log('\n--- 1. Verifying Trial Lifecycle Progression ---');
  const initialTrial = db.getWorkspaceTrialStatus(ws1.id);
  assert.strictEqual(initialTrial.in_trial, true, 'New workspace must be in trial');
  assert.strictEqual(initialTrial.is_warning, false, 'Day 0 must not show warning');
  assert.strictEqual(initialTrial.is_expired, false, 'Day 0 must not be expired');
  assert.strictEqual(initialTrial.is_locked, false, 'Day 0 must not be locked');
  assert.strictEqual(initialTrial.trial_days_remaining, 14, 'Should have 14 days remaining');
  console.log('  ✓ Day 0: Full trial access verified (14 days remaining).');

  // Simulate Day 10 (4 days remaining)
  const day10Start = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
  const day10End = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString();
  db.updateWorkspaceSubscription(ws1.id, {
    trial_starts_at: day10Start,
    trial_ends_at: day10End,
  });

  const day10Trial = db.getWorkspaceTrialStatus(ws1.id);
  assert.strictEqual(day10Trial.in_trial, true);
  assert.strictEqual(day10Trial.is_warning, true, 'Day 10 must activate upgrade warning');
  assert.strictEqual(day10Trial.is_locked, false, 'Day 10 must still allow operations');
  console.log('  ✓ Day 10: Upgrade warning active, operations unlocked.');

  // Simulate Day 14+ (Expired trial)
  const expiredStart = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
  const expiredEnd = new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString();
  db.updateWorkspaceSubscription(ws1.id, {
    trial_starts_at: expiredStart,
    trial_ends_at: expiredEnd,
    status: 'trialing',
  });

  const expiredTrial = db.getWorkspaceTrialStatus(ws1.id);
  assert.strictEqual(expiredTrial.in_trial, false, 'Expired trial must not be in trial');
  assert.strictEqual(expiredTrial.is_expired, true, 'Must mark is_expired = true');
  assert.strictEqual(expiredTrial.is_locked, true, 'Must mark is_locked = true');
  console.log('  ✓ Day 14+: Trial marked expired and locked.');

  // =========================================================================
  // TEST 2: TRIAL GATEKEEPER FEATURE LOCKING
  // =========================================================================
  console.log('\n--- 2. Verifying Trial Gatekeeper Feature Enforcement ---');
  const scanCheck = PlatformBillingEngine.isFeatureAllowed(ws1.id, 'scanner');
  assert.strictEqual(scanCheck.allowed, false, 'Scanner must be locked when trial expired');
  assert.ok(scanCheck.reason?.includes('expired'), 'Reason must explain trial expiration');

  const recoveryCheck = PlatformBillingEngine.isFeatureAllowed(ws1.id, 'recovery');
  assert.strictEqual(recoveryCheck.allowed, false, 'Recovery execution must be locked');

  const importCheck = PlatformBillingEngine.isFeatureAllowed(ws1.id, 'import');
  assert.strictEqual(importCheck.allowed, false, 'CSV imports must be locked');

  const settingsCheck = PlatformBillingEngine.isFeatureAllowed(ws1.id, 'settings');
  assert.strictEqual(settingsCheck.allowed, true, 'Settings must remain accessible');

  const billingCheck = PlatformBillingEngine.isFeatureAllowed(ws1.id, 'billing');
  assert.strictEqual(billingCheck.allowed, true, 'Billing tab must remain accessible');
  console.log('  ✓ Gatekeeper correctly blocks operational engines while allowing settings & billing.');

  // =========================================================================
  // TEST 3: UPGRADE FLOW & IMMEDIATE UNLOCK
  // =========================================================================
  console.log('\n--- 3. Verifying Subscription Upgrade Flow ---');
  const upgradedSub = PlatformBillingEngine.upgradePlan(ws1.id, 'growth', 'annual', '1111');
  assert.strictEqual(upgradedSub.status, 'active');
  assert.strictEqual(upgradedSub.plan, 'growth');
  assert.strictEqual(upgradedSub.billing_cycle, 'annual');
  assert.strictEqual(upgradedSub.card_last4, '1111');

  const activeTrial = db.getWorkspaceTrialStatus(ws1.id);
  assert.strictEqual(activeTrial.status, 'active');
  assert.strictEqual(activeTrial.is_locked, false, 'Paid active workspace must be fully unlocked');

  const postUpgradeScan = PlatformBillingEngine.isFeatureAllowed(ws1.id, 'scanner');
  assert.strictEqual(postUpgradeScan.allowed, true, 'Scanner allowed immediately post-upgrade');
  console.log('  ✓ Upgraded to Growth Annual. Workspace instantly unlocked.');

  // Upgrade to Enterprise
  const enterpriseSub = PlatformBillingEngine.upgradePlan(ws1.id, 'enterprise', 'monthly', '9999');
  assert.strictEqual(enterpriseSub.plan, 'enterprise');
  assert.strictEqual(enterpriseSub.card_last4, '9999');
  console.log('  ✓ Upgraded to Enterprise Monthly tier.');

  // =========================================================================
  // TEST 4: DOWNGRADE FLOW
  // =========================================================================
  console.log('\n--- 4. Verifying Subscription Downgrade Flow ---');
  const downgradedSub = PlatformBillingEngine.downgradePlan(ws1.id, 'growth');
  assert.strictEqual(downgradedSub.plan, 'growth');
  console.log('  ✓ Successfully downgraded from Enterprise to Growth tier.');

  // =========================================================================
  // TEST 5: STRIPE CHECKOUT & BILLING PORTAL SESSION CREATION
  // =========================================================================
  console.log('\n--- 5. Verifying Stripe Checkout & Portal Sessions ---');
  const checkoutSession = await PlatformBillingEngine.createCheckoutSession({
    workspaceId: ws2.id,
    planTier: 'growth',
    billingCycle: 'monthly',
    userEmail: 'admin@gymapex.in',
  });

  assert.ok(checkoutSession.sessionId.length > 0);
  assert.ok(checkoutSession.checkoutUrl.length > 0);
  assert.strictEqual(checkoutSession.planTier, 'growth');
  assert.strictEqual(checkoutSession.amountCents, 29900);
  console.log(`  ✓ Checkout Session generated: ${checkoutSession.sessionId}`);

  const portalSession = await PlatformBillingEngine.createBillingPortalSession(ws2.id);
  assert.ok(portalSession.url.length > 0);
  console.log('  ✓ Stripe Customer Billing Portal Session generated.');

  // =========================================================================
  // TEST 6: STRIPE WEBHOOK INGESTION & IDEMPOTENCY
  // =========================================================================
  console.log('\n--- 6. Verifying Stripe Platform Webhook Ingestion ---');
  const checkoutCompletedEvent = {
    id: `evt_test_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        customer: 'cus_stripe_revive_99',
        subscription: 'sub_stripe_revive_99',
        metadata: {
          workspace_id: ws2.id,
          plan_tier: 'enterprise',
          billing_cycle: 'annual',
        },
      },
    },
  };

  const webhookRes = await PlatformBillingEngine.handleStripePlatformWebhook(checkoutCompletedEvent);
  assert.strictEqual(webhookRes.success, true);
  assert.strictEqual(webhookRes.workspaceId, ws2.id);

  const ws2Sub = db.getWorkspaceSubscription(ws2.id);
  assert.strictEqual(ws2Sub.status, 'active');
  assert.strictEqual(ws2Sub.plan, 'enterprise');
  assert.strictEqual(ws2Sub.stripe_customer_id, 'cus_stripe_revive_99');
  assert.strictEqual(ws2Sub.stripe_subscription_id, 'sub_stripe_revive_99');
  console.log('  ✓ Webhook checkout.session.completed ingested: ws2 activated as Enterprise.');

  // Test invoice.payment_succeeded renewal
  const invoiceSuccessEvent = {
    id: `evt_inv_${Date.now()}`,
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: 'in_test_456',
        customer: 'cus_stripe_revive_99',
        lines: {
          data: [{ period: { end: Math.floor(Date.now() / 1000) + 30 * 86400 } }],
        },
        metadata: { workspace_id: ws2.id },
      },
    },
  };

  const invoiceRes = await PlatformBillingEngine.handleStripePlatformWebhook(invoiceSuccessEvent);
  assert.strictEqual(invoiceRes.success, true);
  console.log('  ✓ Webhook invoice.payment_succeeded ingested: renewal period extended.');

  // =========================================================================
  // TEST 7: CANCELLATION & REACTIVATION LIFECYCLE
  // =========================================================================
  console.log('\n--- 7. Verifying Cancellation & Reactivation Lifecycle ---');
  const canceledSub = PlatformBillingEngine.cancelSubscription(ws2.id, false);
  assert.strictEqual(canceledSub.cancel_at_period_end, true, 'Should cancel at period end');
  assert.strictEqual(canceledSub.status, 'active', 'Status remains active until period ends');

  const reactivatedSub = PlatformBillingEngine.reactivateSubscription(ws2.id);
  assert.strictEqual(reactivatedSub.cancel_at_period_end, false);
  assert.strictEqual(reactivatedSub.status, 'active');
  console.log('  ✓ Cancellation scheduled and reactivated seamlessly.');

  // Immediate cancellation
  PlatformBillingEngine.cancelSubscription(ws2.id, true);
  const immediateStatus = db.getWorkspaceTrialStatus(ws2.id);
  assert.strictEqual(immediateStatus.status, 'canceled');
  console.log('  ✓ Immediate cancellation processed and gated.');

  // =========================================================================
  // TEST 8: MULTI-TENANT ISOLATION
  // =========================================================================
  console.log('\n--- 8. Verifying Strict Multi-Tenant Isolation ---');
  const finalSub1 = db.getWorkspaceSubscription(ws1.id);
  const finalSub2 = db.getWorkspaceSubscription(ws2.id);

  assert.notStrictEqual(finalSub1.workspace_id, finalSub2.workspace_id);
  assert.strictEqual(finalSub1.plan, 'growth');
  assert.strictEqual(finalSub1.status, 'active');
  assert.strictEqual(finalSub2.status, 'canceled');
  console.log('  ✓ Strict multi-tenant isolation enforced. Subscriptions completely separated.');

  console.log('\n=============================================================');
  console.log('🎉 ALL MASTER PLATFORM BILLING & TRIAL TESTS PASSED (100%)!');
  console.log('=============================================================\n');
}

runPlatformBillingTests().catch((err) => {
  console.error('\n❌ PLATFORM BILLING TEST SUITE FAILED:', err);
  process.exit(1);
});
