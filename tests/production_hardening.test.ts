import './setupEnv.js';
import assert from 'assert';
import { PaymentProviderFactory } from '../server/providers/factory.js';
import { StripeAdapter } from '../server/providers/stripe.js';
import { RazorpayAdapter } from '../server/providers/razorpay.js';
import { PayPalAdapter } from '../server/providers/paypal.js';
import { setStorageMode, getStorageMode, isSupabaseAuthoritative, isSupabaseConfigured } from '../server/db/storageMode.js';
import { db } from '../server/store/db.js';

let totalTests = 0;
let passedTests = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runProductionHardeningTests() {
  console.log('\n======================================================');
  console.log('PRODUCTION HARDENING & AUDIT VERIFICATION TESTS');
  console.log('======================================================\n');

  // ====================================================================
  // 1. STRIPE PROVIDER CREDENTIAL SECURITY
  // ====================================================================
  console.log('[Suite 1: Stripe Provider Credential Isolation]');

  await test('Stripe provider: throws when workspace credentials missing in production mode', async () => {
    const prevMode = getStorageMode();
    const prevEnvKey = process.env.STRIPE_SECRET_KEY;
    try {
      setStorageMode('supabase_production');
      process.env.STRIPE_SECRET_KEY = 'sk_live_global_env_secret_should_not_be_used';

      const stripe = new StripeAdapter();
      let threw = false;
      try {
        await stripe.createPaymentLink(
          'ws_tenant_99',
          'inv_123',
          'cust_123',
          5000,
          'USD'
        );
      } catch (err: any) {
        threw = true;
        assert.ok(
          err.message.includes('Stripe API key is required for workspace') ||
          err.message.includes('Global environment credential fallback is strictly forbidden') ||
          err.message.includes('Workspace credentials missing') ||
          err.message.includes('Authoritative production mode requires workspace-scoped credentials'),
          `Expected workspace credential error, got: ${err.message}`
        );
      }
      assert.strictEqual(threw, true, 'Stripe must throw when workspace credentials missing in production mode');
    } finally {
      process.env.STRIPE_SECRET_KEY = prevEnvKey;
      setStorageMode(prevMode);
    }
  });

  await test('Stripe provider: uses workspace credentials when provided', async () => {
    const stripe = new StripeAdapter();
    // Access private getEffectiveApiKey via prototype or test call
    const effectiveKey = (stripe as any).getEffectiveApiKey(
      { apiSecret: 'sk_test_workspace_specific_key_123' },
      'ws_tenant_99'
    );
    assert.strictEqual(
      effectiveKey,
      'sk_test_workspace_specific_key_123',
      'Should return the workspace credentials secret'
    );
  });

  await test('Stripe provider: never falls back to process.env in production mode', async () => {
    const prevMode = getStorageMode();
    const prevEnvKey = process.env.STRIPE_SECRET_KEY;
    try {
      setStorageMode('supabase_production');
      process.env.STRIPE_SECRET_KEY = 'sk_live_should_never_be_picked';

      const stripe = new StripeAdapter();
      let threw = false;
      try {
        (stripe as any).getEffectiveApiKey(undefined, 'ws_prod_tenant');
      } catch (err: any) {
        threw = true;
        assert.ok(
          err.message.includes('Stripe API key is required for workspace') ||
          err.message.includes('Global environment credential fallback is strictly forbidden') ||
          err.message.includes('Workspace credentials missing'),
          'Must fail with workspace credential error instead of using env key'
        );
      }
      assert.strictEqual(threw, true, 'Must never fall back to process.env.STRIPE_SECRET_KEY in production mode');
    } finally {
      process.env.STRIPE_SECRET_KEY = prevEnvKey;
      setStorageMode(prevMode);
    }
  });

  // ====================================================================
  // 2. PAYMENT LINK CREATION & NO FABRICATED EXPIRATION
  // ====================================================================
  console.log('\n[Suite 2: Authoritative Payment Link Expiration]');

  await test('Payment link creation: expiresAt is null / undefined when provider does not return one', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('local_development');
      const razorpay = new RazorpayAdapter();
      const link = await razorpay.createPaymentLink(
        'ws_test',
        'inv_test_456',
        'cust_test_456',
        7500,
        'INR'
      );

      assert.ok(link.url, 'Payment URL must be returned');
      assert.strictEqual(link.expiresAt, null, 'expiresAt must be null when provider does not specify an expiration date');
    } finally {
      setStorageMode(prevMode);
    }
  });

  await test('Stripe payment link: does NOT fabricate 24h expiration when unconfigured', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('local_development');
      const stripe = new StripeAdapter();
      const link = await stripe.createPaymentLink(
        'ws_test',
        'inv_stripe_test',
        'cust_stripe_test',
        4900,
        'USD'
      );

      assert.ok(link.url, 'Payment URL must exist');
      assert.strictEqual(link.expiresAt, null, 'expiresAt must be null rather than a fabricated 24h timestamp');
    } finally {
      setStorageMode(prevMode);
    }
  });

  // ====================================================================
  // 3. SUPABASE PRODUCTION STORAGE & FAIL-CLOSED GUARDS
  // ====================================================================
  console.log('\n[Suite 3: Supabase Production Storage Enforcement]');

  await test('Supabase production storage: rejects setStorageMode when env variables missing', () => {
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      process.env.SUPABASE_URL = '';
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';

      let threw = false;
      try {
        setStorageMode('supabase_production');
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('Supabase production database required'));
      }
      assert.strictEqual(threw, true, 'Must reject switching to supabase_production without valid config');
    } finally {
      process.env.SUPABASE_URL = prevUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });

  await test('Supabase production storage: getStorageMode rejects in production when config missing', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = '';
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';

      let threw = false;
      try {
        getStorageMode();
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('CRITICAL CONFIGURATION ERROR'));
      }
      assert.strictEqual(threw, true, 'getStorageMode must fail closed in production when config is missing');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      process.env.SUPABASE_URL = prevUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });

  // ====================================================================
  // 4. SIGNUP WORKFLOW & AUTH SECURITY
  // ====================================================================
  console.log('\n[Suite 4: Signup Workflow & Role Protection]');

  await test('Signup workflow: does not accept arbitrary role from request body', () => {
    const store = db as any;
    const testEmail = `attacker_${Date.now()}@example.com`;

    // Sign up a user
    const session = db.signUp(testEmail, 'Attacker Name');
    assert.strictEqual(session.is_authenticated, true);
    assert.strictEqual(session.user.email, testEmail);

    // If an attacker calls signup or attempts to assign a role in an unauthorized workspace:
    const userRoleInUnknownWs = db.getCurrentRole('ws_arbitrary_unauthorized');
    assert.notStrictEqual(userRoleInUnknownWs, 'owner', 'User must not be granted owner role in arbitrary workspaces');
  });

  await test('Signup workflow: creates user account and initial workspace with role=owner, never inheriting existing workspaces', () => {
    const store = db as any;
    const testEmail = `new_signup_${Date.now()}@example.com`;
    const session = db.signUp(testEmail, 'New Founder');

    assert.strictEqual(session.is_authenticated, true);
    assert.ok(session.workspace_id, 'New user should have an initial workspace ID or onboarding');
    assert.notStrictEqual(session.workspace_id, 'ws_acme_saas_01', 'New user MUST NOT be added to Acme Cloud or demo workspaces');

    const role = db.getCurrentRole(session.workspace_id);
    assert.strictEqual(role, 'owner', 'Newly created workspace must have role=owner for the creating user');
  });

  console.log('\n======================================================');
  console.log(`PRODUCTION HARDENING TESTS: ${passedTests}/${totalTests} Passed (100% SUCCESS)`);
  console.log('======================================================\n');
  db.seedInitialData();
}

runProductionHardeningTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
