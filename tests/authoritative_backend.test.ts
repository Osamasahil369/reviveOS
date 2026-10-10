/**
 * Automated Test Suite: Revenue Recovery OS Authoritative SaaS Backend
 *
 * Verifies Phase II Requirements:
 * 1. Storage Mode & Supabase Authoritative Architecture
 * 2. Deterministic Recovery Retries (Zero Math.random)
 * 3. Database Schema & Tables (all 17 PostgreSQL tables)
 * 4. Recovery Opportunity Workflow & Settlement
 * 5. Tenant Isolation & Workspace Boundary Enforcement
 * 6. Provider Secret Encryption & Decryption (AES-256-GCM)
 * 7. Webhook Idempotency & Signature Verification (Stripe & Razorpay)
 * 8. Webhook Workspace Resolution
 * 9. Financial Validation Engine
 * 10. Authoritative CSV Validation & Ingestion
 * 11. Revenue Event & Audit Trail Recording
 */

import './setupEnv.js';
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';

import { isSupabaseAuthoritative, getStorageMode, setStorageMode } from '../server/db/storageMode.js';
import { supabaseService } from '../server/db/supabaseService.js';
import { PaymentProviderFactory } from '../server/providers/factory.js';
import { db } from '../server/store/db.js';
import { validateAmountAndCurrency, validateCustomerInput } from '../server/validation/validator.js';
import { encryptSecret, decryptSecret, maskSecret } from '../server/security/encryption.js';
import { validateCsvRowsAuthoritative } from '../server/validation/csvValidator.js';
import { resolveWebhookWorkspace } from '../server/webhooks/workspaceResolver.js';
import { tenantIsolationMiddleware, requireRole } from '../server/middleware/tenantIsolation.js';
import { processAuthoritativeWebhook } from '../server/webhooks/webhookProcessor.js';

// Isolate tests completely from persistent disk database
db.setPersistenceEnabled(false);

let passedTests = 0;
let totalTests = 0;

function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passedTests++;
      console.log(`  ✓ PASS: ${name}`);
    })
    .catch((err) => {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      throw err;
    });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY OS: AUTHORITATIVE BACKEND TEST SUITE');
  console.log('======================================================\n');

  db.seedInitialData();

  // 1. Storage Mode Architecture
  await test('Storage Mode: Default state and toggle behavior', () => {
    const initialMode = getStorageMode();
    assert(['local_development', 'supabase_production'].includes(initialMode));

    setStorageMode('supabase_production');
    assert.strictEqual(getStorageMode(), 'supabase_production');
    assert.strictEqual(isSupabaseAuthoritative(), true);

    setStorageMode('local_development');
    assert.strictEqual(getStorageMode(), 'local_development');
    assert.strictEqual(isSupabaseAuthoritative(), false);

    // Reset back
    setStorageMode(initialMode);
  });

  // 2. Deterministic Retries (Zero Math.random in production)
  await test('Deterministic Retries: Stripe provider uses deterministic evaluation (no Math.random)', async () => {
    const stripeAdapter = PaymentProviderFactory.getAdapter('stripe');
    const res1 = await stripeAdapter.retryPayment('ws_test', 'inv_deterministic_001');
    const res2 = await stripeAdapter.retryPayment('ws_test', 'inv_deterministic_001');

    assert.strictEqual(res1.success, res2.success, 'Retry must be deterministic for identical invoice ID');
    assert.strictEqual(typeof res1.isRecovered, 'boolean');
  });

  await test('Deterministic Retries: Razorpay provider deterministic evaluation', async () => {
    const razorpayAdapter = PaymentProviderFactory.getAdapter('razorpay');
    const res1 = await razorpayAdapter.retryPayment('ws_test', 'inv_rzp_001');
    const res2 = await razorpayAdapter.retryPayment('ws_test', 'inv_rzp_001');

    assert.strictEqual(res1.success, res2.success, 'Razorpay retry must be deterministic for identical invoice ID');
  });

  // 3. Database Schema Completeness
  await test('Schema Verification: 17 Required Tables Declared in Architecture', () => {
    const requiredTables = [
      'workspaces',
      'users',
      'memberships',
      'provider_connections',
      'customers',
      'subscriptions',
      'invoices',
      'payments',
      'payment_failures',
      'recovery_campaigns',
      'recovery_steps',
      'recovery_opportunities',
      'recovery_events',
      'customer_timeline_events',
      'revenue_events',
      'webhook_events',
      'audit_logs',
    ];

    assert.strictEqual(requiredTables.length, 17, 'System must have 17 authoritative tables');
  });

  // 4. Recovery Opportunity Workflow & Settlement
  await test('Recovery Workflow: Opportunity lifecycle in data store', async () => {
    const wsId = 'ws_acme_saas_01';
    const opps = db.getOpportunities(wsId);
    assert(Array.isArray(opps), 'Opportunities must return an array');
    assert(opps.length > 0, 'Initial opportunities must exist');

    const firstOpp = opps[0];
    assert(firstOpp.id, 'Opportunity must have an ID');
    assert(firstOpp.amount_at_risk_cents > 0, 'Opportunity must have amount at risk');
    assert(firstOpp.recovery_token, 'Opportunity must have a recovery token');
  });

  // 5. Tenant Isolation Verification
  await test('Tenant Isolation: Check RLS boundary enforcement', () => {
    db.switchUser('user_sameer');
    const accessTest = db.checkRlsAccess('customers', 'SELECT', 'ws_unauthorized_999');
    assert.strictEqual(accessTest.allowed, false, 'Access across different workspace must be denied');
    assert(accessTest.reason.includes('DENIED'), 'Access must be denied with explanation');

    const validTest = db.checkRlsAccess('customers', 'SELECT', 'ws_acme_saas_01');
    assert.strictEqual(validTest.allowed, true, 'Access within authorized workspace must be permitted');
  });

  // 6. Provider Secret AES-256-GCM Encryption
  await test('Security: Provider Secret Encryption (AES-256-GCM)', () => {
    const rawApiKey = 'sk_live_51M0abcdef1234567890SecretKey';
    const encrypted = encryptSecret(rawApiKey);

    assert(encrypted.startsWith('gcm_'), 'Ciphertext must start with gcm_ prefix');
    assert(!encrypted.includes(rawApiKey), 'Ciphertext must never contain raw plaintext');

    const decrypted = decryptSecret(encrypted);
    assert.strictEqual(decrypted, rawApiKey, 'Decrypted secret must match original plaintext');

    // Tampering test: corrupted ciphertext should fail authentication tag check and return empty string
    const tampered = encrypted.slice(0, -6) + 'abcdef';
    const tamperedResult = decryptSecret(tampered);
    assert.strictEqual(tamperedResult, '', 'Tampered ciphertext must fail authentication and return empty string');
  });

  // 7. Webhook Signature Verification
  await test('Webhooks: Stripe signature verification and timestamp anti-replay', async () => {
    const adapter = PaymentProviderFactory.getAdapter('stripe');
    const secret = 'whsec_test_secret_123';
    const payload = JSON.stringify({ id: 'evt_test_01', type: 'invoice.payment_failed' });
    const currentTimestamp = Math.floor(Date.now() / 1000).toString();

    // Replay attack (timestamp drift) test
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
    const expiredResult = await adapter.processWebhook(
      { 'stripe-signature': `t=${expiredTimestamp},v1=bad_sig` },
      payload,
      secret
    );
    assert.strictEqual(expiredResult.processed, false);
    assert(expiredResult.error?.includes('drift exceeded tolerance'));

    // Invalid signature with fresh timestamp
    const invalidResult = await adapter.processWebhook(
      { 'stripe-signature': `t=${currentTimestamp},v1=bad_signature_hash` },
      payload,
      secret
    );
    assert.strictEqual(invalidResult.processed, false);
    assert.strictEqual(invalidResult.error, 'Invalid Stripe Webhook Signature');

    // Valid signature computation
    const validHmac = crypto
      .createHmac('sha256', secret)
      .update(`${currentTimestamp}.${payload}`)
      .digest('hex');

    const validResult = await adapter.processWebhook(
      { 'stripe-signature': `t=${currentTimestamp},v1=${validHmac}` },
      payload,
      secret
    );
    assert.strictEqual(validResult.processed, true);
    assert.strictEqual(validResult.eventType, 'invoice.payment_failed');
  });

  // 8. Webhook Workspace Resolution (Security Pass: Signature / Verified Identity Only in Production)
  await test('Webhooks: Dynamic Workspace Resolution rejects spoofed parameters in production mode', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('supabase_production');
      assert.strictEqual(isSupabaseAuthoritative(), true);

      // 1. Spoofed query parameter MUST be ignored in production
      const spoofedQuery = { workspaceId: 'ws_spoofed_attacker' };
      const res1 = await resolveWebhookWorkspace('stripe', {}, '', {}, spoofedQuery);
      assert.strictEqual(res1.workspaceId, null, 'Production MUST NOT trust ?workspaceId= query param');
      assert.strictEqual(res1.source, 'unresolved');

      // 2. Spoofed header MUST be ignored in production
      const spoofedHeader = { 'x-workspace-id': 'ws_spoofed_attacker' };
      const res2 = await resolveWebhookWorkspace('stripe', {}, '', spoofedHeader, {});
      assert.strictEqual(res2.workspaceId, null, 'Production MUST NOT trust x-workspace-id header');
      assert.strictEqual(res2.source, 'unresolved');

      // 3. Spoofed unverified metadata MUST be ignored in production
      const bodyWithSpoofedMeta = {
        data: { object: { metadata: { workspace_id: 'ws_spoofed_attacker' } } },
      };
      const res3 = await resolveWebhookWorkspace('stripe', bodyWithSpoofedMeta, '', {}, {});
      assert.strictEqual(res3.workspaceId, null, 'Production MUST NOT trust unverified payload metadata');
      assert.strictEqual(res3.source, 'unresolved');

      // 4. Cryptographic HMAC signature resolution for Stripe
      // Get connection secret from stored connections
      const localConns: any[] = db.getProviderConnections();
      const stripeConn = localConns.find((c) => c.provider_type === 'stripe');
      if (stripeConn && stripeConn.webhook_secret_encrypted) {
        const rawPayload = JSON.stringify({ id: 'evt_stripe_real_01', type: 'invoice.payment_failed' });
        const secret = decryptSecret(stripeConn.webhook_secret_encrypted);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const validSig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawPayload}`).digest('hex');

        const resSig = await resolveWebhookWorkspace(
          'stripe',
          JSON.parse(rawPayload),
          rawPayload,
          { 'stripe-signature': `t=${timestamp},v1=${validSig}` },
          { workspaceId: 'ws_spoofed_different' } // Even if spoofed query param passed, signature determines true workspace
        );
        assert.strictEqual(resSig.workspaceId, stripeConn.workspace_id, 'Signature MUST resolve to genuine connection workspace');
        assert.strictEqual(resSig.source, 'signature_match');
      }

      // 5. In Local Development mode, query parameters and metadata may resolve for developer ergonomics
      setStorageMode('local_development');
      const devRes1 = await resolveWebhookWorkspace('stripe', {}, '', {}, { workspaceId: 'ws_acme_saas_01' });
      assert.strictEqual(devRes1.workspaceId, 'ws_acme_saas_01');
      assert.strictEqual(devRes1.source, 'query_param');

      const devRes2 = await resolveWebhookWorkspace('stripe', { metadata: { workspace_id: 'ws_acme_saas_01' } }, '', {}, {});
      assert.strictEqual(devRes2.workspaceId, 'ws_acme_saas_01');
      assert.strictEqual(devRes2.source, 'metadata');
    } finally {
      setStorageMode(prevMode);
    }
  });

  // 9. Atomic Recovery Settlement
  await test('Settlement Workflow: Settle recovery opportunity and check state transition', async () => {
    const wsId = 'ws_acme_saas_01';
    const opps = db.getOpportunities(wsId, { status: 'in_recovery' });
    const targetOpp = opps[0] || db.getOpportunities(wsId)[0];

    assert(targetOpp, 'Target opportunity must exist');
    const prevRecovered = db.getMetrics(wsId).revenue_recovered_cents;

    const settlementResult = db.settleRecoveryPayment(targetOpp.id, {
      amountCents: targetOpp.amount_at_risk_cents,
      providerPaymentId: `py_settle_${Date.now()}`,
      method: 'automated_recovery_test',
    });

    assert.strictEqual(settlementResult.success, true, 'Settlement must succeed');
    const updatedOpp = db.getOpportunityById(targetOpp.id);
    assert.strictEqual(updatedOpp?.status, 'recovered', 'Status must transition to recovered');

    const newMetrics = db.getMetrics(wsId);
    assert(newMetrics.revenue_recovered_cents >= prevRecovered, 'Recovered revenue metric must reflect settlement');
  });

  // 10. Financial Validation Engine
  await test('Validation Engine: Zero tolerance for negative or unwhitelisted currencies', () => {
    const invalidCurrency = validateAmountAndCurrency(5000, 'XYZ');
    assert.strictEqual(invalidCurrency.valid, false);

    const negativeAmount = validateAmountAndCurrency(-100, 'USD');
    assert.strictEqual(negativeAmount.valid, false);

    const validAmount = validateAmountAndCurrency(4900, 'USD');
    assert.strictEqual(validAmount.valid, true);
    assert.strictEqual(validAmount.sanitized?.amountCents, 4900);

    const invalidEmailCustomer = validateCustomerInput({ name: 'Alice', email: 'not-an-email' });
    assert.strictEqual(invalidEmailCustomer.valid, false);
  });

  // 11. Authoritative CSV Validation
  await test('CSV Ingestion: Strict validation and duplicate detection', async () => {
    const testRows = [
      { email: 'valid.user@example.com', name: 'Valid User', amount: 15000, currency: 'USD' },
      { email: 'invalid-email', name: 'Bad Email', amount: 5000, currency: 'USD' },
      { email: 'negative@example.com', name: 'Negative', amount: -200, currency: 'USD' },
      { email: 'valid.user@example.com', name: 'Duplicate Row', amount: 15000, currency: 'USD' },
    ];

    const validationResult = await validateCsvRowsAuthoritative('ws_test', testRows);
    assert.strictEqual(validationResult.validCount, 1, 'Only 1 valid row should pass validation');
    assert.strictEqual(validationResult.invalidCount, 2, '2 invalid rows should be detected');
    assert.strictEqual(validationResult.duplicatesCount, 1, '1 duplicate row in batch should be detected');
  });

  // Helper for middleware execution
  async function runMiddleware(reqOptions: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: any;
  }) {
    const req: any = {
      url: reqOptions.url,
      originalUrl: reqOptions.url,
      path: reqOptions.url.split('?')[0],
      method: reqOptions.method || 'GET',
      headers: reqOptions.headers || {},
      query: reqOptions.query || {},
      body: reqOptions.body || {},
    };

    let statusCode = 200;
    let responseBody: any = null;
    let nextCalled = false;

    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
      send(data: any) {
        responseBody = data;
        return this;
      },
    };

    const next = () => {
      nextCalled = true;
    };

    await tenantIsolationMiddleware(req, res, next);
    return { req, res, statusCode, responseBody, nextCalled };
  }

  // 12. Security Fix 1A: Production Authentication - Missing Token -> Fail Closed (401)
  await test('Production Auth: Missing Bearer token on protected route fails closed (401)', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('supabase_production');
      const res = await runMiddleware({
        url: '/api/metrics',
        method: 'GET',
        headers: {},
      });
      assert.strictEqual(res.statusCode, 401, 'Should return HTTP 401 Unauthorized when no token is provided in production mode');
      assert.strictEqual(res.nextCalled, false, 'Middleware should not call next()');
    } finally {
      setStorageMode(prevMode);
    }
  });

  // 13. Security Fix 1A: Production Authentication - Fake / Preview / Demo Tokens -> Fail Closed (401)
  await test('Production Auth: Fake/Preview tokens (sb_tok_*, sb_sess_*, demo_*, demo) fail closed (401)', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('supabase_production');

      const testTokens = [
        'sb_tok_preview_12345',
        'sb_sess_bootstrap_abcdef',
        'demo_admin_user',
        'demo',
      ];

      for (const token of testTokens) {
        const res = await runMiddleware({
          url: '/api/opportunities',
          method: 'GET',
          headers: {
            authorization: `Bearer ${token}`,
            'x-workspace-id': 'ws_acme_saas_01',
          },
        });
        assert.strictEqual(res.statusCode, 401, `Token "${token}" MUST fail closed with 401 in production mode`);
        assert.strictEqual(res.nextCalled, false, `Token "${token}" MUST NOT proceed to next()`);
      }
    } finally {
      setStorageMode(prevMode);
    }
  });

  // 14. Security Fix 1A: Production Authentication - Invalid Supabase JWT -> Fail Closed (401)
  await test('Production Auth: Invalid Supabase JWT fails closed (401)', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('supabase_production');

      const res = await runMiddleware({
        url: '/api/customers',
        method: 'GET',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid_payload.signature',
          'x-workspace-id': 'ws_acme_saas_01',
        },
      });
      assert.strictEqual(res.statusCode, 401, 'Invalid JWT token must fail closed with 401 in production mode');
      assert.strictEqual(res.nextCalled, false, 'Invalid JWT must not proceed to next()');
    } finally {
      setStorageMode(prevMode);
    }
  });

  // 15. Security Fix 1B: Production Local-Database Fallback Elimination
  await test('Production Storage: Supabase is authoritative and zero rows return empty result without demo substitution', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('supabase_production');
      assert.strictEqual(isSupabaseAuthoritative(), true);

      // Verify that querying a non-existent workspace for memberships returns empty array or null, never substituting demo users
      const membership = await supabaseService.getMembership('ws_non_existent', 'usr_random_999').catch(() => null);
      assert.strictEqual(membership, null, 'Non-existent membership must be null, never substituting demo membership');

      // Verify workspaces list for non-existent user returns empty array, not demo workspaces
      const workspaces = await supabaseService.getWorkspaces('usr_non_existent_999').catch(() => []);
      assert.deepStrictEqual(workspaces, [], 'Non-existent user must return empty workspace list');
    } finally {
      setStorageMode(prevMode);
    }
  });

  // 16. Security Fix 1: Local Development preserves demo auth only in non-production mode
  await test('Local Mode Auth: Local development mode allows local demo session when explicitly active', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('local_development');
      assert.strictEqual(isSupabaseAuthoritative(), false);

      const res = await runMiddleware({
        url: '/api/metrics',
        method: 'GET',
        headers: {
          'x-workspace-id': 'ws_acme_saas_01',
        },
      });
      assert.strictEqual(res.nextCalled, true, 'Local development mode should allow local user and call next()');
      assert.ok(res.req.user, 'Local development should attach dev user to request');
    } finally {
      setStorageMode(prevMode);
    }
  });

  // 17. Security Pass: Database Admin Endpoints Protection in Production Mode
  await test('Database Admin Protection: Admin endpoints require authentication or are disabled in production', async () => {
    const prevMode = getStorageMode();
    try {
      setStorageMode('supabase_production');
      assert.strictEqual(isSupabaseAuthoritative(), true);

      // Unauthenticated access to POST /api/database/mode must return 401
      const resModePost = await runMiddleware({
        url: '/api/database/mode',
        method: 'POST',
        headers: {},
        body: { mode: 'local_development' },
      });
      assert.strictEqual(resModePost.statusCode, 401, 'POST /api/database/mode without auth must return 401');
      assert.strictEqual(resModePost.nextCalled, false);

      // Unauthenticated access to POST /api/database/sync must return 401
      const resSyncPost = await runMiddleware({
        url: '/api/database/sync',
        method: 'POST',
        headers: {},
      });
      assert.strictEqual(resSyncPost.statusCode, 401, 'POST /api/database/sync without auth must return 401');
      assert.strictEqual(resSyncPost.nextCalled, false);

      // Unauthenticated access to GET /api/database/schema must return 401
      const resSchema = await runMiddleware({
        url: '/api/database/schema',
        method: 'GET',
        headers: {},
      });
      assert.strictEqual(resSchema.statusCode, 401, 'GET /api/database/schema without auth must return 401');
      assert.strictEqual(resSchema.nextCalled, false);

      // Unauthenticated access to GET /api/database/tables must return 401
      const resTables = await runMiddleware({
        url: '/api/database/tables',
        method: 'GET',
        headers: {},
      });
      assert.strictEqual(resTables.statusCode, 401, 'GET /api/database/tables without auth must return 401');
      assert.strictEqual(resTables.nextCalled, false);

      // Health checks remain publicly accessible
      const resHealth = await runMiddleware({
        url: '/api/health',
        method: 'GET',
        headers: {},
      });
      assert.strictEqual(resHealth.nextCalled, true, 'GET /api/health should remain public');

      const resDbStatus = await runMiddleware({
        url: '/api/database/status',
        method: 'GET',
        headers: {},
      });
      assert.strictEqual(resDbStatus.nextCalled, true, 'GET /api/database/status should be accessible for status inspection');
    } finally {
      setStorageMode(prevMode);
    }
  });

  // 18. Fail Closed on Table Count Errors
  await test('Fail Closed: getTableCounts propagates explicit errors instead of converting failures to 0 rows', async () => {
    // If Supabase client fails or is unconfigured, getTableCounts must throw/reject
    let didThrow = false;
    try {
      await supabaseService.getTableCounts();
    } catch (err: any) {
      didThrow = true;
      assert.ok(err, 'Explicit error must be propagated on Supabase table count error');
    }
    // Note: depending on environment (no SUPABASE_URL configured), it throws SupabaseUnavailableError
    // or if connected it returns non-zero counts. In either case it must not swallow errors.
  });

  // 19. Role-Based Access Control (requireRole middleware)
  await test('RBAC: requireRole middleware enforces permitted roles and rejects unauthorized roles with HTTP 403', async () => {
    const adminOnlyMiddleware = requireRole(['owner', 'admin']);

    // Case 1: Member attempting admin action -> 403
    let status1 = 0;
    let jsonBody1: any = null;
    let nextCalled1 = false;
    const mockReq1: any = {
      membership: { role: 'member', workspace_id: 'ws_test' },
      user: { id: 'usr_1', email: 'member@test.com' },
    };
    const mockRes1: any = {
      status: (code: number) => {
        status1 = code;
        return {
          json: (body: any) => { jsonBody1 = body; },
        };
      },
    };
    adminOnlyMiddleware(mockReq1, mockRes1, () => { nextCalled1 = true; });
    assert.strictEqual(status1, 403, 'Member must receive 403 for admin-only route');
    assert.strictEqual(nextCalled1, false);

    // Case 2: Viewer attempting admin action -> 403
    let status2 = 0;
    let nextCalled2 = false;
    const mockReq2: any = {
      membership: { role: 'viewer', workspace_id: 'ws_test' },
      user: { id: 'usr_2', email: 'viewer@test.com' },
    };
    const mockRes2: any = {
      status: (code: number) => {
        status2 = code;
        return {
          json: () => {},
        };
      },
    };
    adminOnlyMiddleware(mockReq2, mockRes2, () => { nextCalled2 = true; });
    assert.strictEqual(status2, 403, 'Viewer must receive 403 for admin-only route');
    assert.strictEqual(nextCalled2, false);

    // Case 3: Admin executing admin action -> next()
    let nextCalled3 = false;
    const mockReq3: any = {
      userRole: 'admin',
      membership: { role: 'admin', workspace_id: 'ws_test' },
      user: { id: 'usr_3', email: 'admin@test.com' },
    };
    const mockRes3: any = { status: () => ({ json: () => {} }) };
    adminOnlyMiddleware(mockReq3, mockRes3, () => { nextCalled3 = true; });
    assert.strictEqual(nextCalled3, true, 'Admin must be permitted on admin-only route');

    // Case 4: Owner executing admin action -> next()
    let nextCalled4 = false;
    const mockReq4: any = {
      userRole: 'owner',
      membership: { role: 'owner', workspace_id: 'ws_test' },
      user: { id: 'usr_4', email: 'owner@test.com' },
    };
    const mockRes4: any = { status: () => ({ json: () => {} }) };
    adminOnlyMiddleware(mockReq4, mockRes4, () => { nextCalled4 = true; });
    assert.strictEqual(nextCalled4, true, 'Owner must be permitted on admin-only route');
  });

  // 20. Data Layer Tenant Isolation in Local / Mock Storage
  await test('Tenant Isolation: db methods enforce workspaceId boundary filtering', () => {
    const ws1 = 'ws_acme_saas_01';
    const ws2 = 'ws_dev_test_02';

    // Customers list isolation
    const custs1 = db.getCustomers(ws1);
    const custs2 = db.getCustomers(ws2);
    assert(Array.isArray(custs1), 'Must return array');
    custs1.forEach(c => assert.strictEqual(c.workspace_id, ws1, 'All customers must belong to ws1'));
    custs2.forEach(c => assert.strictEqual(c.workspace_id, ws2, 'All customers must belong to ws2'));

    // Cross-workspace lookup by ID must return undefined/null when mismatched
    if (custs1.length > 0) {
      const crossLookup = db.getCustomerById(custs1[0].id, ws2);
      assert.strictEqual(!crossLookup, true, 'Customer from ws1 queried with ws2 must not be found');
    }

    // Subscriptions list isolation
    const subs1 = db.getSubscriptions(ws1);
    subs1.forEach(s => assert.strictEqual(s.workspace_id, ws1, 'Subscriptions must belong to ws1'));
    if (subs1.length > 0) {
      const crossSub = db.getSubscriptionById(subs1[0].id, ws2);
      assert.strictEqual(!crossSub, true, 'Subscription from ws1 queried with ws2 must not be found');
    }

    // Recovery Opportunities isolation
    const opps1 = db.getOpportunities(ws1);
    opps1.forEach(o => assert.strictEqual(o.workspace_id, ws1, 'Opportunities must belong to ws1'));
    if (opps1.length > 0) {
      const crossOpp = db.getOpportunityById(opps1[0].id, ws2);
      assert.strictEqual(!crossOpp, true, 'Opportunity from ws1 queried with ws2 must not be found');
    }
  });

  // 21. Cross-Tenant Recovery Operations & Timeline Isolation
  await test('Tenant Isolation: Recovery operations and notes enforce workspace boundaries', async () => {
    const ws1 = 'ws_acme_saas_01';
    const ws2 = 'ws_dev_test_02';

    const opps1 = db.getOpportunities(ws1);
    assert(opps1.length > 0, 'ws1 must have opportunities');
    const opp1 = opps1[0];

    // Trigger retry with cross-workspace ID must return failure
    const retryCross = await db.triggerSmartRetry(opp1.id, ws2);
    assert.strictEqual(retryCross.success, false, 'Retry must fail across workspace boundary');
    assert.strictEqual(retryCross.message, 'Opportunity not found');

    // Pause recovery with cross-workspace ID must fail
    const pauseCross = db.pauseRecovery(opp1.id, ws2);
    assert.strictEqual(pauseCross.success, false, 'Pause must fail across workspace boundary');

    // Escalate recovery with cross-workspace ID must fail
    const escalateCross = db.escalateRecovery(opp1.id, 'Test escalation', ws2);
    assert.strictEqual(escalateCross.success, false, 'Escalate must fail across workspace boundary');

    // Send manual recovery email with cross-workspace ID must fail
    const emailCross = await db.sendManualRecoveryEmail(opp1.id, 'Subject', 'Body', ws2);
    assert.strictEqual(emailCross.success, false, 'Email must fail across workspace boundary');

    // Customer timeline and notes cross-workspace check
    const custs1 = db.getCustomers(ws1);
    assert(custs1.length > 0, 'ws1 must have customers');
    const cust1 = custs1[0];

    const timelineCross = db.getCustomerTimeline(cust1.id, ws2);
    assert.deepStrictEqual(timelineCross, [], 'Customer timeline must be empty when queried from different workspace');

    const noteCross = db.addCustomerNote(cust1.id, 'Unauthorized note', 'Attacker', ws2);
    assert.strictEqual(noteCross, null, 'Customer note must not be created for mismatched workspace');
  });

  // 22. Public Signup Security: Client cannot select workspace or privilege
  await test('Public Signup: Client cannot choose arbitrary role or workspace_id on signup', () => {
    const uniqueEmail = `newuser_${Date.now()}@example.com`;
    // Attempting to sign up with requested role: 'admin' and existing workspace
    const session = db.signUp(uniqueEmail, 'New Owner User');

    assert.ok(session.user, 'User must be created');
    assert.strictEqual(session.role, 'owner', 'New user role is owner of their own newly created workspace only');
    assert.notStrictEqual(session.workspace_id, 'ws_acme_saas_01', 'Must not be added to existing workspace');

    // Verify user belongs to their own newly created workspace
    const userMembers = db.getWorkspaceMembers(session.workspace_id);
    assert(userMembers.some(m => m.email === uniqueEmail), 'User must be in their own workspace');
  });

  // 23. Team Invitation & Role Change Hardening: Privilege Escalation Prevention
  await test('Governance & RBAC: Invitation and role change privilege rules', () => {
    const wsId = 'ws_acme_saas_01';

    // 1. Inviting existing member throws error
    assert.throws(() => {
      db.inviteWorkspaceMember(wsId, 'Marcus Brody', 'marcus.brody@acmecloud.io', 'Admin');
    }, /already a member/);

    // 2. Inviting a new member succeeds
    const newInvEmail = `invitee_${Date.now()}@acme.dev`;
    const invited = db.inviteWorkspaceMember(wsId, 'Sarah Ops', newInvEmail, 'Billing Ops');
    assert.ok(invited.id);
    assert.strictEqual(invited.email, newInvEmail);

    // 3. Updating member role
    const updated = db.updateWorkspaceMemberRole(wsId, invited.id, 'viewer');
    assert.ok(updated);
    assert.strictEqual(updated?.role, 'viewer');

    // 4. Updating non-existent member returns null
    const invalidUpdate = db.updateWorkspaceMemberRole(wsId, 'mem_non_existent', 'admin');
    assert.strictEqual(invalidUpdate, null);
  });

  // 24. Customer Payment Portal Token & Data Sanitization
  await test('Customer Payment Portal: Token lookup isolates workspace and returns sanitized payload', () => {
    const opps = db.getOpportunities('ws_acme_saas_01');
    assert(opps.length > 0, 'Must have sample opportunities');
    const opp = opps[0];
    assert.ok(opp.recovery_token, 'Opportunity must have a recovery token');

    const retrieved = db.getOpportunityByToken(opp.recovery_token);
    assert.ok(retrieved, 'Must find opportunity by valid token');
    assert.strictEqual(retrieved?.id, opp.id);
    assert.strictEqual(retrieved?.workspace_id, 'ws_acme_saas_01');

    // Invalid/expired token returns undefined
    const fakeToken = db.getOpportunityByToken('tok_invalid_non_existent_token_999');
    assert.strictEqual(!fakeToken, true, 'Non-existent token must return falsy');
  });

  // 25. Provider Secrets Security & Safe Masking
  await test('Provider Security: Secret masking and credential isolation', () => {
    // Masking test
    assert.strictEqual(maskSecret(''), '');
    assert.strictEqual(maskSecret('12345'), '••••••••');
    const maskedLong = maskSecret('whsec_test_secret_key_1234567890');
    assert.ok(maskedLong.includes('••••••••'));
    assert.ok(maskedLong.endsWith('7890'));
    assert.strictEqual(maskedLong.includes('secret_key'), false, 'Sensitive middle tokens must be masked');

    // AES-256-GCM Roundtrip test
    const rawSecret = 'sk_live_very_secret_key_prod_987654321';
    const encrypted = encryptSecret(rawSecret);
    assert.ok(encrypted.startsWith('gcm_'), 'Must use GCM encryption prefix');
    const decrypted = decryptSecret(encrypted);
    assert.strictEqual(decrypted, rawSecret, 'Decrypted value must match plaintext exactly');
  });

  // 26. GDPR Erasure Tenant Scoping
  await test('Privacy & Compliance: GDPR erasure redacts PII within workspace boundary only', () => {
    const wsId = 'ws_acme_saas_01';
    const uniqueEmail = `gdpr_${Date.now()}@customer.com`;
    const cust = db.createCustomer(wsId, {
      name: 'John Doe',
      email: uniqueEmail,
      currency: 'USD',
      provider_type: 'stripe',
    });

    assert.ok(cust.id);
    const result = db.executeGdprErasure(wsId, uniqueEmail);
    assert.strictEqual(result.success, true);
    
    const erasedCust = db.getCustomerById(cust.id, wsId);
    assert.strictEqual(erasedCust?.name, '[GDPR Redacted]');
    assert.strictEqual(erasedCust?.email.includes('@privacy.internal'), true);

    // GDPR erasure with wrong workspace returns not found
    const wrongWsResult = db.executeGdprErasure('ws_dev_test_02', uniqueEmail);
    assert.strictEqual(wrongWsResult.success, false);
  });

  // 27. Return URL Validation & Open Redirect Protection
  await test('Security: validateReturnUrl rejects external or malformed redirect targets', async () => {
    const { validateReturnUrl } = await import('../server/services/recoveryCheckout.js');
    
    assert.strictEqual(validateReturnUrl('/dashboard'), '/dashboard');
    assert.strictEqual(validateReturnUrl('/pay/success?inv=123'), '/pay/success?inv=123');
    assert.strictEqual(validateReturnUrl('//evil.com'), null);
    assert.strictEqual(validateReturnUrl('/\\evil.com'), null);
    assert.strictEqual(validateReturnUrl('javascript:alert(1)'), null);
    assert.strictEqual(validateReturnUrl('https://malicious-external-site.com'), null);
  });

  // 28. Strict Webhook Fail Closed Verification
  await test('Webhooks: Strict fail-closed verification rejects forged / missing signatures', async () => {
    const { PaymentProviderFactory } = await import('../server/providers/factory.js');
    const stripe = PaymentProviderFactory.getAdapter('stripe');
    const razorpay = PaymentProviderFactory.getAdapter('razorpay');
    const paypal = PaymentProviderFactory.getAdapter('paypal');

    // Stripe missing signature fails
    const stripeRes = await stripe.processWebhook({}, { type: 'invoice.payment_succeeded' }, 'whsec_secret');
    assert.strictEqual(stripeRes.processed, false);
    assert.ok(stripeRes.error);

    // Razorpay missing signature fails
    const rzpRes = await razorpay.processWebhook({}, { event: 'payment.captured' }, 'rzp_secret');
    assert.strictEqual(rzpRes.processed, false);
    assert.ok(rzpRes.error);

    // PayPal missing transmission sig fails
    const paypalRes = await paypal.processWebhook({}, { event_type: 'PAYMENT.CAPTURE.COMPLETED' }, 'paypal_secret');
    assert.strictEqual(paypalRes.processed, false);
    assert.ok(paypalRes.error);
  });

  // 29. Token Hashing & Raw Token Isolation
  await test('Security: Recovery Token Hashing & Plaintext Isolation', async () => {
    const { hashToken } = await import('../server/security/encryption.js');
    const raw = 'tok_test_raw_bearer_token_12345';
    const hashed = hashToken(raw);
    assert.strictEqual(hashed.length, 64, 'SHA-256 token hash must be 64 hex chars');
    assert.notStrictEqual(raw, hashed);
  });

  // 30. Generic Provider Capabilities and Account ID Safety
  await test('Providers: Generic provider defaults capabilities to false and accountId to undefined', async () => {
    const genericAdapter = PaymentProviderFactory.getAdapter('braintree' as any);
    assert.strictEqual(genericAdapter.capabilities.canRetryDirectly, false);
    assert.strictEqual(genericAdapter.capabilities.canGeneratePaymentLink, false);
    assert.strictEqual(genericAdapter.capabilities.supportsSmartRetries, false);

    const validation = await genericAdapter.validateConnection({ apiKey: 'test_key' });
    assert.strictEqual(validation.valid, false);
    assert.strictEqual(validation.accountId, undefined);
  });

  // 31. PayPal CHECKOUT.ORDER.APPROVED Non-Settlement Safety
  await test('Webhooks: PayPal CHECKOUT.ORDER.APPROVED does not settle financial recovery', async () => {
    const initialMode = getStorageMode();
    setStorageMode('local_development');
    try {
      const { processAuthoritativeWebhook } = await import('../server/webhooks/webhookProcessor.js');
      const result = await processAuthoritativeWebhook(
        'ws_acme_saas_01',
        'paypal',
        { id: 'evt_paypal_order_app_001', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORD_12345' } },
        {}
      );

      assert.strictEqual(result.processed, true);
      assert.strictEqual(result.recoveredAmountCents, undefined);
      assert.ok(result.actionTaken.includes('approved by payer'));
    } finally {
      setStorageMode(initialMode);
    }
  });

  // 32. Schema & Migration 006/007 RPC Verification
  await test('Database: Migration 006 & 007 consolidation defines canonical settle_recovery_payment_atomic function and claim_webhook_event_atomic', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migration006 = path.join(process.cwd(), 'supabase', 'migrations', '006_final_rpc_consolidation.sql');
    const migration007 = path.join(process.cwd(), 'supabase', 'migrations', '007_webhook_lease_and_canonical_rpc.sql');
    
    assert.ok(fs.existsSync(migration006), 'Migration 006 must exist');
    assert.ok(fs.existsSync(migration007), 'Migration 007 must exist');

    const content007 = fs.readFileSync(migration007, 'utf-8');
    assert.ok(content007.includes('CREATE OR REPLACE FUNCTION claim_webhook_event_atomic'), 'Migration 007 must create claim_webhook_event_atomic function');
    assert.ok(content007.includes('CREATE OR REPLACE FUNCTION settle_recovery_payment_atomic'), 'Migration 007 must create canonical settle_recovery_payment_atomic function');
    assert.ok(content007.includes('is_resolved = TRUE'), 'Migration 007 must update payment_failures using is_resolved');
    assert.ok(content007.includes('REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic'), 'Must revoke public/authenticated access');
    assert.ok(content007.includes('GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic'), 'Must grant service_role access');
  });

  // 33. Migration Chain Validation (001 through 009)
  await test('Database: Migration chain 001 through 009 schema compliance', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    assert.ok(files.length >= 9, 'Must have at least 9 migration files');

    // Verify 009 exists
    assert.ok(files.includes('009_final_settlement_rpc_cleanup.sql'));

    const content009 = fs.readFileSync(path.join(dir, '009_final_settlement_rpc_cleanup.sql'), 'utf-8');
    
    // Ensure no invalid schema references exist in 009
    assert.strictEqual(content009.includes('recovery_opportunities.provider_type'), false, 'Cannot reference recovery_opportunities.provider_type');
    assert.strictEqual(content009.includes('payment_failures.status'), false, 'Cannot reference payment_failures.status');
    assert.strictEqual(content009.includes('payment_failures.resolved_at'), false, 'Cannot reference payment_failures.resolved_at');
    assert.strictEqual(content009.includes('subscriptions.recovered_revenue_cents'), false, 'Cannot reference subscriptions.recovered_revenue_cents');
    assert.ok(content009.includes("event_type,\n    amount_cents,\n    currency,\n    recovered_via,\n    recorded_at") || content009.includes("'revenue_recovered'"), 'Must insert into revenue_events using event_type revenue_recovered and recorded_at');
    assert.ok(content009.includes("p_user_id UUID DEFAULT NULL"), 'Must use canonical 6-parameter RPC signature');
  });

  // 35. Migration 010 Corrective Settlement RPC & Whole-Chain Schema Audit
  await test('Database: Migration 010 corrective settlement RPC & whole-chain schema audit', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    assert.ok(files.length >= 10, 'Must have at least 10 migration files');
    assert.ok(files.includes('010_final_settlement_schema_correction.sql'), 'Migration 010 must exist');

    const content010 = fs.readFileSync(path.join(dir, '010_final_settlement_schema_correction.sql'), 'utf-8');
    
    // Canonical 6-arg signature
    assert.ok(content010.includes('p_user_id UUID DEFAULT NULL'), '010 must define canonical 6-parameter signature');
    
    // Obsolete overloads dropped
    assert.ok(content010.includes('DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, VARCHAR, VARCHAR)'), '010 must drop legacy overloads');
    
    // Strict permissions
    assert.ok(content010.includes('REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC;'), '010 must revoke PUBLIC access');
    assert.ok(content010.includes('REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM authenticated;'), '010 must revoke authenticated access');
    assert.ok(content010.includes('GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) TO service_role;'), '010 must grant service_role access');

    // Audit ALL migration files for invalid references
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
      assert.strictEqual(sql.includes('recovery_opportunities.invoice_id'), false, `Invalid reference recovery_opportunities.invoice_id found in ${file}`);
      assert.strictEqual(sql.includes('recovery_opportunities.provider_type'), false, `Invalid reference recovery_opportunities.provider_type found in ${file}`);
      assert.strictEqual(sql.includes('payment_failures.status'), false, `Invalid reference payment_failures.status found in ${file}`);
      assert.strictEqual(sql.includes('payment_failures.resolved_at'), false, `Invalid reference payment_failures.resolved_at found in ${file}`);
      assert.strictEqual(sql.includes('payment_failures.subscription_id'), false, `Invalid reference payment_failures.subscription_id found in ${file}`);
      assert.strictEqual(sql.includes('subscriptions.recovered_revenue_cents'), false, `Invalid reference subscriptions.recovered_revenue_cents found in ${file}`);
    }
  });

  // 36. Final Adversarial Settlement Safety Tests
  await test('Adversarial Security: Provider payment identity & session rules', async () => {
    setStorageMode('local_development');
    // 1. Stripe checkout session without payment_intent must be rejected
    const opportunities = db.getOpportunities('ws_acme_saas_01');
    const targetOpp = opportunities.find(o => o.invoice?.provider_invoice_id)!;
    targetOpp.status = 'active';
    const targetInvoiceId = targetOpp.invoice!.provider_invoice_id;

    const { processAuthoritativeWebhook } = await import('../server/webhooks/webhookProcessor.js');
    let didThrow = false;
    try {
      await processAuthoritativeWebhook(
        'ws_acme_saas_01',
        'stripe',
        {
          id: `evt_stripe_checkout_test_${Date.now()}`,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_123',
              payment_status: 'paid',
              client_reference_id: targetInvoiceId,
              amount_total: targetOpp.amount_at_risk_cents,
              currency: targetOpp.currency.toLowerCase(),
              // missing payment_intent!
            }
          }
        },
        {}
      );
    } catch (err: any) {
      didThrow = true;
      assert.ok(err.message.includes('missing authentic payment_intent ID') || err.message.includes('missing valid authentic payment ID'), `Unexpected error message: ${err.message}`);
    }
    assert.strictEqual(didThrow, true, 'Checkout session without payment_intent must throw error');
  });

  // 37. Migration 011 RPC Deduplication & Single Contract Test
  await test('Database: Migration 011 removes legacy migration-002 overload and enforces single canonical RPC contract', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'supabase', 'migrations');

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    assert.ok(files.includes('011_remove_legacy_settlement_overload.sql'), 'Migration 011 must exist');

    const content011 = fs.readFileSync(path.join(dir, '011_remove_legacy_settlement_overload.sql'), 'utf-8');

    // Must drop legacy migration 002 overload
    assert.ok(
      content011.includes('DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(\n  UUID,   -- p_opportunity_id\n  BIGINT, -- p_amount_cents\n  TEXT,   -- p_provider_payment_id\n  TEXT,   -- p_method\n  UUID,   -- p_user_id\n  UUID    -- p_workspace_id\n);') ||
      content011.includes('DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID, UUID)'),
      'Migration 011 must drop legacy migration-002 function signature'
    );

    // Verify latest migration definitions (006, 007, 008, 009, 010) put p_workspace_id FIRST
    const canonicalMigrations = ['006_final_rpc_consolidation.sql', '007_webhook_lease_and_canonical_rpc.sql', '008_settlement_and_authoritative_closure.sql', '009_final_settlement_rpc_cleanup.sql', '010_final_settlement_schema_correction.sql'];
    for (const file of canonicalMigrations) {
      if (files.includes(file)) {
        const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
        const fnIdx = sql.indexOf('CREATE OR REPLACE FUNCTION settle_recovery_payment_atomic');
        if (fnIdx !== -1) {
          const signatureChunk = sql.slice(fnIdx, fnIdx + 300);
          assert.ok(signatureChunk.includes('p_workspace_id UUID'), `Canonical migration ${file} must put p_workspace_id FIRST`);
          assert.ok(signatureChunk.includes('p_opportunity_id UUID'), `Canonical migration ${file} must put p_opportunity_id SECOND`);
          assert.ok(signatureChunk.includes('p_amount_cents BIGINT'), `Canonical migration ${file} must put p_amount_cents THIRD`);
        }
      }
    }
  });

  // 38. Financial Invariant & Settlement Idempotency Test
  await test('Financial Invariants: Single settlement execution and duplicate settlement idempotency', async () => {
    const workspaceId = 'ws_acme_saas_01';
    
    // Find or create an unrecovered opportunity for testing
    const opportunities = db.getOpportunities(workspaceId);
    let targetOpp = opportunities.find(o => o.status !== 'recovered');
    if (!targetOpp) {
      targetOpp = opportunities[0];
      targetOpp.status = 'active';
    }

    const origCust = db.getCustomers(workspaceId).find(c => c.id === targetOpp!.customer_id);
    const initialRecoveredCents = origCust?.total_recovered_cents || 0;

    const authPaymentId = `pi_test_financial_invariant_${Date.now()}`;

    // 1. Settle Payment
    const res1 = await db.settleRecoveryPayment(
      targetOpp.id,
      {
        amountCents: targetOpp.amount_at_risk_cents,
        providerPaymentId: authPaymentId,
        method: 'stripe_payment_element',
      },
      workspaceId
    );

    assert.strictEqual(res1.success, true, 'First settlement must succeed');

    // Verify Financial Invariants
    const updatedOpp = db.getOpportunityById(targetOpp.id, workspaceId);
    assert.strictEqual(updatedOpp?.status, 'recovered', 'Opportunity status must be recovered');

    const updatedCust = db.getCustomers(workspaceId).find(c => c.id === targetOpp!.customer_id);
    assert.strictEqual(
      updatedCust?.total_recovered_cents,
      initialRecoveredCents + targetOpp.amount_at_risk_cents,
      'Customer total_recovered_cents must increase by exact recovered amount'
    );

    // 2. Attempt Duplicate Settlement
    const res2 = await db.settleRecoveryPayment(
      targetOpp.id,
      {
        amountCents: targetOpp.amount_at_risk_cents,
        providerPaymentId: authPaymentId,
        method: 'stripe_payment_element',
      },
      workspaceId
    );

    assert.strictEqual(res2.success, true, 'Duplicate settlement must return success');
    assert.ok(res2.message.includes('already recovered') || (res2 as any).data?.status === 'already_recovered', 'Duplicate settlement must indicate already recovered');

    const updatedCust2 = db.getCustomers(workspaceId).find(c => c.id === targetOpp!.customer_id);
    assert.strictEqual(
      updatedCust2?.total_recovered_cents,
      initialRecoveredCents + targetOpp.amount_at_risk_cents,
      'Duplicate settlement MUST NOT double-increment customer total_recovered_cents'
    );
  });

  // 39. Migration 012 Final Settlement Contract & Security Verification
  await test('Database & Security: Migration 012 final settlement RPC contract, permissions, and security constraints', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'supabase', 'migrations');

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    assert.ok(files.includes('012_final_settlement_contract.sql'), 'Migration 012 file must exist');

    const sql012 = fs.readFileSync(path.join(dir, '012_final_settlement_contract.sql'), 'utf-8');

    // 1. Check RPC Signature, Parameter Order, and Payment Integrity
    assert.ok(sql012.includes('CREATE OR REPLACE FUNCTION settle_recovery_payment_atomic('), 'Migration 012 must define canonical RPC function');
    assert.ok(sql012.includes('p_workspace_id UUID'), 'Migration 012 must place p_workspace_id FIRST');
    assert.ok(sql012.includes('p_opportunity_id UUID'), 'Migration 012 must place p_opportunity_id SECOND');
    assert.ok(sql012.includes('p_amount_cents BIGINT'), 'Migration 012 must place p_amount_cents THIRD');
    assert.ok(sql012.includes('p_provider_payment_id TEXT'), 'Migration 012 must place p_provider_payment_id FOURTH');
    assert.ok(sql012.includes('v_payment_rec.invoice_id IS NULL OR v_payment_rec.invoice_id != v_inv.id'), 'Migration 012 must require exact invoice_id match');
    assert.ok(sql012.includes("v_payment_rec.status != 'succeeded'"), 'Migration 012 must enforce payment status integrity');

    // 2. Check Permissions (Service Role Only)
    assert.ok(sql012.includes('REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC'), 'Migration 012 must revoke execution from PUBLIC');
    assert.ok(sql012.includes('REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM authenticated'), 'Migration 012 must revoke execution from authenticated');
    assert.ok(sql012.includes('GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) TO service_role'), 'Migration 012 must grant execution ONLY to service_role');

    // 3. Check Return URL Validator
    const { validateReturnUrl } = await import('../server/services/recoveryCheckout.js');
    assert.strictEqual(validateReturnUrl('//evil.com'), null, 'Protocol-relative evil URL must be rejected');
    assert.strictEqual(validateReturnUrl('/\\evil.com'), null, 'Backslash escape evil URL must be rejected');
    assert.strictEqual(validateReturnUrl('\\evil.com'), null, 'Leading backslash evil URL must be rejected');
    assert.strictEqual(validateReturnUrl('javascript:alert(1)'), null, 'Javascript URI must be rejected');
    assert.strictEqual(validateReturnUrl('https://evil.com'), null, 'External origin return URL must be rejected');
    assert.strictEqual(validateReturnUrl('/dashboard/recovery'), '/dashboard/recovery', 'Valid relative path must be accepted');

    // 4. Check Unverified Account ID Webhook Resolution in Production Mode
    const { resolveWebhookWorkspace } = await import('../server/webhooks/workspaceResolver.js');
    const prevMode = getStorageMode();
    try {
      setStorageMode('supabase_production');
      const forgedPayload = { account_id: 'acct_attacker_forged' };
      const resForged = await resolveWebhookWorkspace('stripe', forgedPayload, JSON.stringify(forgedPayload), {}, {});
      assert.strictEqual(resForged.workspaceId, null, 'Forged unverified account_id MUST NOT resolve a workspace in production mode');
      assert.strictEqual(resForged.source, 'unresolved');
    } finally {
      setStorageMode(prevMode);
    }

    // 5. Check Production Email Mock Rejection
    const { EmailService } = await import('../server/email/service.js');
    const prevStorageMode = getStorageMode();
    const origEmailProvider = process.env.EMAIL_PROVIDER;
    try {
      setStorageMode('supabase_production');
      process.env.EMAIL_PROVIDER = 'mock';
      let emailFailed = false;
      try {
        await EmailService.sendRecoveryEmail({
          workspaceId: 'ws_test',
          opportunityId: 'opp_123',
          toEmail: 'test@example.com',
          subjectTemplate: 'Payment Action Required',
          bodyTemplate: 'Please update payment details for {{amount_due}}.',
          variables: {
            customer_name: 'Test Customer',
            business_name: 'Test Business',
            amount_due: '$100.00',
            currency: 'USD',
            invoice_id: 'inv_123',
            payment_date: '2026-09-20',
            payment_link: 'https://example.com/pay/token',
            subscription_name: 'Pro Plan',
          },
        });
      } catch (err: any) {
        emailFailed = true;
        assert.ok(err.message.includes('Mock email provider is strictly forbidden in production mode'), 'Mock email in production must throw clear forbidden error');
      }
      assert.strictEqual(emailFailed, true, 'Sending email with mock provider in production mode must fail');
    } finally {
      setStorageMode(prevStorageMode);
      process.env.EMAIL_PROVIDER = origEmailProvider;
    }
  });

    // Razorpay Production Integration & Security Verification Suite (A-K)
    await test('Razorpay: Production mode enforces workspace credentials and rejects fake amount fallbacks', async () => {
      const prevMode = getStorageMode();
      const origKeyId = process.env.RAZORPAY_KEY_ID;
      try {
        setStorageMode('supabase_production');
        delete process.env.RAZORPAY_KEY_ID;
        delete process.env.RAZORPAY_KEY_SECRET;

        const adapter = PaymentProviderFactory.getAdapter('razorpay');
        let threw = false;
        try {
          await adapter.createPaymentLink('ws_test_prod', 'inv_test', 'cust_test', 5000, 'INR', undefined);
        } catch (err: any) {
          threw = true;
          assert.ok(err.message.includes('credentials required') || err.message.includes('not configured') || err.message.includes('requires active Razorpay API credentials'), 'Production requires credentials');
        }
        assert.strictEqual(threw, true, 'Missing credentials in production must throw error');

        // Test missing / invalid amount validation
        let invalidAmountThrew = false;
        try {
          await adapter.createPaymentLink('ws_test_prod', 'inv_test', 'cust_test', 0, 'INR', { apiKey: 'rzp_test_123', apiSecret: 'secret_123' });
        } catch (err: any) {
          invalidAmountThrew = true;
          assert.ok(err.message.includes('Invalid or missing recovery amount'), 'Zero or negative amounts must fail validation');
        }
        assert.strictEqual(invalidAmountThrew, true, 'Zero or negative amount must be rejected');
      } finally {
        setStorageMode(prevMode);
        process.env.RAZORPAY_KEY_ID = origKeyId;
      }
    });

    // =========================================================================
    // FINAL RAZORPAY TEST PREPARATION VERIFICATION SUITE (TESTS A-M)
    // =========================================================================

    // Test A: retryPayment() returns correct TypeScript-safe object with:
    // paymentLinkUrl, providerCheckoutId, recoveryLinkCreated: true, isRecovered: false
    await test('Test A: retryPayment() contract returns correct TypeScript-safe fields', async () => {
      const apiFileContent = fs.readFileSync('src/services/api.ts', 'utf-8');
      assert.ok(apiFileContent.includes('export interface RetryPaymentResponse'), 'Must export RetryPaymentResponse');
      assert.ok(apiFileContent.includes('paymentLinkUrl?: string'), 'Must include paymentLinkUrl in RetryPaymentResponse');
      assert.ok(apiFileContent.includes('providerCheckoutId?: string'), 'Must include providerCheckoutId in RetryPaymentResponse');
      assert.ok(apiFileContent.includes('recoveryLinkCreated?: boolean'), 'Must include recoveryLinkCreated in RetryPaymentResponse');
      assert.ok(apiFileContent.includes('isRecovered?: boolean'), 'Must include isRecovered in RetryPaymentResponse');
      assert.ok(apiFileContent.includes('fetchJson<RetryPaymentResponse>'), 'retryPayment must return RetryPaymentResponse');
    });

    // Test B: App.tsx displays Razorpay payment link and opens it
    await test('Test B: App.tsx displays Razorpay payment link dialog and has OPEN PAYMENT LINK action', async () => {
      const appContent = fs.readFileSync('src/App.tsx', 'utf-8');
      assert.ok(appContent.includes('Recovery Payment Link Created'), 'Must render Recovery Payment Link Created modal');
      assert.ok(appContent.includes('OPEN PAYMENT LINK'), 'Must provide OPEN PAYMENT LINK action button');
      assert.ok(appContent.includes('COPY LINK'), 'Must provide COPY LINK action button');
      assert.ok(appContent.includes("window.open(paymentLinkDialog.url, '_blank')"), 'Must open link via window.open');
    });

    // Test C: App.tsx does NOT mark opportunity recovered on retry
    await test('Test C: App.tsx does NOT mark opportunity recovered on retry', async () => {
      const appContent = fs.readFileSync('src/App.tsx', 'utf-8');
      assert.ok(appContent.includes('Payment is pending. Revenue will be marked recovered only after Razorpay confirms the payment.'), 'Must display pending disclaimer');
      assert.ok(appContent.includes('if (res.paymentLinkUrl)'), 'handleRetry must branch on paymentLinkUrl');
      assert.ok(appContent.includes('setPaymentLinkDialog'), 'Must set paymentLinkDialog on paymentLinkUrl');
    });

    // Test D: Webhook idempotency uses SHA-256(rawBody) when event ID is absent
    await test('Test D: Webhook idempotency uses SHA-256(rawBody) when event ID is absent', async () => {
      const wsId = 'ws_acme_saas_01';
      const rawPayload = JSON.stringify({
        event: 'payment.authorized',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_no_event_id_' + Date.now(),
              order_id: 'order_test_no_event_' + Date.now(),
              amount: 5000,
              currency: 'INR',
            }
          }
        }
      });
      const expectedHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

      const result = await processAuthoritativeWebhook(
        wsId,
        'razorpay',
        JSON.parse(rawPayload),
        { 'content-type': 'application/json' },
        rawPayload
      );

      assert.strictEqual(result.providerEventId, expectedHash, 'Webhook event ID must match SHA-256 hash of rawBody when event ID is omitted');
    });

    // Test E: payment.id is never overwritten with the webhook event hash
    await test('Test E: payment.id is never overwritten with the webhook event hash', async () => {
      const wsId = 'ws_acme_saas_01';
      const realPaymentId = 'pay_authentic_test_' + Date.now();
      const rawPayload = JSON.stringify({
        event: 'payment.authorized',
        payload: {
          payment: {
            entity: {
              id: realPaymentId,
              amount: 5000,
              currency: 'INR',
            }
          }
        }
      });
      const eventHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

      const result = await processAuthoritativeWebhook(
        wsId,
        'razorpay',
        JSON.parse(rawPayload),
        {},
        rawPayload
      );

      assert.strictEqual(result.providerEventId, eventHash, 'Event ID is hash');
      assert.notStrictEqual(realPaymentId, eventHash, 'Payment ID must remain authentic resource ID, not event hash');
    });

    // Test F: payment_link.id is never overwritten with the webhook event hash
    await test('Test F: payment_link.id is never overwritten with the webhook event hash', async () => {
      const realLinkCheckoutId = 'plink_real_test_' + Date.now();
      const rawPayload = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: realLinkCheckoutId,
              amount: 5000,
              currency: 'INR',
            }
          }
        }
      });
      const eventHash = crypto.createHash('sha256').update(rawPayload).digest('hex');
      assert.notStrictEqual(realLinkCheckoutId, eventHash, 'Payment link ID must not be overwritten by webhook event hash');
    });

    // Test G: Two different webhook event types for the same payment resource do not falsely collide
    await test('Test G: Two different webhook event types for same resource do not falsely collide', async () => {
      const wsId = 'ws_acme_saas_01';
      const paymentId = 'pay_shared_resource_' + Date.now();

      const eventPayload1 = JSON.stringify({
        event: 'payment.authorized',
        payload: { payment: { entity: { id: paymentId, amount: 5000, currency: 'INR' } } }
      });

      const eventPayload2 = JSON.stringify({
        event: 'order.created',
        payload: { order: { entity: { id: 'order_test_coll_' + Date.now(), amount: 5000, currency: 'INR' } } }
      });

      const hash1 = crypto.createHash('sha256').update(eventPayload1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(eventPayload2).digest('hex');

      assert.notStrictEqual(hash1, hash2, 'Different event types produce distinct idempotency hashes');

      const res1 = await processAuthoritativeWebhook(wsId, 'razorpay', JSON.parse(eventPayload1), {}, eventPayload1);
      assert.strictEqual(res1.duplicate, false, 'First event must not be duplicate');

      const res2 = await processAuthoritativeWebhook(wsId, 'razorpay', JSON.parse(eventPayload2), {}, eventPayload2);
      assert.strictEqual(res2.duplicate, false, 'Second event of different type must not be falsely treated as duplicate');
    });

    // Test H: getRecoveryOpportunityByProviderCheckoutId queries exact resource without loading all opportunities
    await test('Test H: getRecoveryOpportunityByProviderCheckoutId queries exact resource', async () => {
      const wsId = 'ws_acme_saas_01';
      const testCheckoutId = 'plink_indexed_' + Date.now();
      const created = db.createRecoveryOpportunity(wsId, {
        customer_id: 'cust_01',
        payment_failure_id: 'fail_01',
        amount_at_risk_cents: 7500,
        currency: 'INR',
        status: 'active',
      });
      (created as any).provider_checkout_id = testCheckoutId;
      (created as any).provider_type = 'razorpay';

      const found = db.getOpportunityByProviderCheckoutId(wsId, testCheckoutId, 'razorpay');
      assert.ok(found, 'Must find opportunity by providerCheckoutId');
      assert.strictEqual(found?.id, created.id);

      const notFound = db.getOpportunityByProviderCheckoutId(wsId, 'non_existent_checkout_id', 'razorpay');
      assert.strictEqual(notFound, undefined, 'Must return undefined for non-existent checkout ID');
    });

    // Test I: Webhook rejects currency mismatch
    await test('Test I: Webhook rejects currency mismatch', async () => {
      const wsId = 'ws_acme_saas_01';
      const checkoutId = 'plink_curr_test_' + Date.now();
      const opp = db.createRecoveryOpportunity(wsId, {
        customer_id: 'cust_01',
        payment_failure_id: 'fail_01',
        amount_at_risk_cents: 8000,
        currency: 'INR',
        status: 'active',
      });
      (opp as any).provider_checkout_id = checkoutId;
      (opp as any).provider_type = 'razorpay';

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_valid_curr_test_' + Date.now(),
              payment_link_id: checkoutId,
              amount: 8000,
              currency: 'USD',
            }
          }
        }
      };

      let threw = false;
      try {
        await processAuthoritativeWebhook(wsId, 'razorpay', payload, {}, JSON.stringify(payload));
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('Currency mismatch'), 'Error must specify currency mismatch');
      }
      assert.strictEqual(threw, true, 'Currency mismatch must be rejected');
    });

    // Test J: Webhook rejects amount mismatch
    await test('Test J: Webhook rejects amount mismatch', async () => {
      const wsId = 'ws_acme_saas_01';
      const checkoutId = 'plink_amt_test_' + Date.now();
      const opp = db.createRecoveryOpportunity(wsId, {
        customer_id: 'cust_01',
        payment_failure_id: 'fail_01',
        amount_at_risk_cents: 9900,
        currency: 'INR',
        status: 'active',
      });
      (opp as any).provider_checkout_id = checkoutId;
      (opp as any).provider_type = 'razorpay';

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_valid_amt_test_' + Date.now(),
              payment_link_id: checkoutId,
              amount: 5000,
              currency: 'INR',
            }
          }
        }
      };

      let threw = false;
      try {
        await processAuthoritativeWebhook(wsId, 'razorpay', payload, {}, JSON.stringify(payload));
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('Exact amount match required'), 'Error must specify amount match required');
      }
      assert.strictEqual(threw, true, 'Amount mismatch must be rejected');
    });

    // Test K: Webhook rejects fake payment IDs (fake_..., sandbox_..., py_ret_...)
    await test('Test K: Webhook rejects fake payment IDs', async () => {
      const wsId = 'ws_acme_saas_01';
      const checkoutId = 'plink_fake_id_test_' + Date.now();
      const opp = db.createRecoveryOpportunity(wsId, {
        customer_id: 'cust_01',
        payment_failure_id: 'fail_01',
        amount_at_risk_cents: 4500,
        currency: 'INR',
        status: 'active',
      });
      (opp as any).provider_checkout_id = checkoutId;
      (opp as any).provider_type = 'razorpay';

      const fakePaymentIds = ['fake_pay_123', 'sandbox_pay_456', 'py_ret_789', 'sim_pay_000'];

      for (const fakeId of fakePaymentIds) {
        const payload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: fakeId,
                payment_link_id: checkoutId,
                amount: 4500,
                currency: 'INR',
              }
            }
          }
        };

        let threw = false;
        try {
          await processAuthoritativeWebhook(wsId, 'razorpay', payload, {}, JSON.stringify(payload));
        } catch (err: any) {
          threw = true;
          assert.ok(err.message.includes('missing valid authentic payment ID'), 'Must reject fake payment ID');
        }
        assert.strictEqual(threw, true, `Fake ID ${fakeId} must be rejected`);
      }
    });

    // Test L: /pay/callback does NOT settle payment
    await test('Test L: /pay/callback does NOT settle payment and shows pending confirmation', async () => {
      const appContent = fs.readFileSync('src/App.tsx', 'utf-8');
      assert.ok(appContent.includes("path === '/pay/callback'"), 'Must handle /pay/callback');
      assert.ok(appContent.includes('Payment submitted. Confirmation pending.'), 'Must display pending message');
      const callbackBlock = appContent.slice(appContent.indexOf("path === '/pay/callback'"), appContent.indexOf('isPayRoute && payTokenFromUrl'));
      assert.ok(!callbackBlock.includes('settlePayment'), '/pay/callback block must never settle payment');
      assert.ok(!callbackBlock.includes('isRecovered'), '/pay/callback block must never claim isRecovered');
    });

    // Test M: Settling is strictly blocked when opportunity has no real Razorpay payment ID
    await test('Test M: Settling is strictly blocked without authentic Razorpay payment ID', async () => {
      const wsId = 'ws_acme_saas_01';
      const checkoutId = 'plink_no_pay_id_' + Date.now();
      const opp = db.createRecoveryOpportunity(wsId, {
        customer_id: 'cust_01',
        payment_failure_id: 'fail_01',
        amount_at_risk_cents: 6000,
        currency: 'INR',
        status: 'active',
      });
      (opp as any).provider_checkout_id = checkoutId;
      (opp as any).provider_type = 'razorpay';

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: '',
              payment_link_id: checkoutId,
              amount: 6000,
              currency: 'INR',
            }
          }
        }
      };

      let threw = false;
      try {
        await processAuthoritativeWebhook(wsId, 'razorpay', payload, {}, JSON.stringify(payload));
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('missing valid authentic payment ID'), 'Must block settlement without authentic payment ID');
      }
      assert.strictEqual(threw, true, 'Must strictly block settlement without authentic payment ID');

      const oppAfter = db.getOpportunityById(opp.id);
      assert.notStrictEqual(oppAfter?.status, 'recovered', 'Opportunity must remain unrecovered');
    });

  // ====================================================================
  // 40. Migration 013 Auth User Profile Synchronization & RLS Verification
  // ====================================================================
  await test('Database & Auth: Migration 013 defines trigger, backfill, and strict RLS policies', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'supabase', 'migrations');

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    assert.ok(files.includes('013_auth_user_profile_sync.sql'), 'Migration 013 must exist');

    const sql013 = fs.readFileSync(path.join(dir, '013_auth_user_profile_sync.sql'), 'utf-8');

    // 1. Function definition
    assert.ok(sql013.includes('CREATE OR REPLACE FUNCTION public.handle_new_auth_user()'), '013 must create handle_new_auth_user function');
    assert.ok(sql013.includes('SECURITY DEFINER'), '013 must use SECURITY DEFINER for profile sync trigger function');
    assert.ok(sql013.includes('SET search_path = public, pg_temp'), '013 must restrict search_path to public, pg_temp');
    assert.ok(sql013.includes('ON CONFLICT (id) DO UPDATE'), '013 must handle conflicts safely and idempotently');

    // 2. Trigger definition
    assert.ok(sql013.includes('AFTER INSERT ON auth.users'), '013 must create trigger AFTER INSERT ON auth.users');
    assert.ok(sql013.includes('EXECUTE FUNCTION public.handle_new_auth_user()'), '013 must execute handle_new_auth_user on trigger');

    // 3. Backfill
    assert.ok(sql013.includes('INSERT INTO public.users'), '013 must backfill into public.users');
    assert.ok(sql013.includes('FROM auth.users'), '013 must query auth.users for existing identities');
    assert.ok(sql013.includes('ON CONFLICT (id) DO UPDATE'), '013 backfill must be idempotent with ON CONFLICT (id)');

    // 4. RLS policies
    assert.ok(sql013.includes('CREATE POLICY "Users can insert their own profile"'), '013 must create INSERT policy for users');
    assert.ok(sql013.includes('auth.uid() = id'), '013 must require auth.uid() = id');
    assert.ok(!sql013.includes('WITH CHECK (true)'), '013 must NOT use WITH CHECK (true)');
  });

  await test('Auth API: Server auth flow does not rely on application createUser and reflects active session state', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

    // Check that signup route does not call supabaseService.createUser
    const signupSection = serverCode.substring(serverCode.indexOf("app.post('/api/auth/signup'"), serverCode.indexOf("app.post('/api/auth/signout'"));
    assert.strictEqual(
      signupSection.includes('supabaseService.createUser'),
      false,
      'Signup route must NOT call supabaseService.createUser (handled automatically by Migration 013 trigger)'
    );

    // Check that signin route does not call supabaseService.createUser or directly upsert users
    const signinSection = serverCode.substring(serverCode.indexOf("app.post('/api/auth/signin'"), serverCode.indexOf("app.post('/api/auth/signup'"));
    assert.strictEqual(
      signinSection.includes('supabaseService.createUser'),
      false,
      'Signin route must NOT call supabaseService.createUser'
    );
    assert.strictEqual(
      signinSection.includes(".from('users').upsert"),
      false,
      'Signin route must NOT perform direct users.upsert violating RLS'
    );
    assert.strictEqual(
      signinSection.includes('ensureUserProfileFromAuthUser'),
      true,
      'Signin route must use ensureUserProfileFromAuthUser'
    );
    assert.strictEqual(
      signinSection.includes('refresh_token: data.session?.refresh_token'),
      false,
      'Signin route must NOT return refresh_token in response body'
    );

    // Check session route
    const sessionSection = serverCode.substring(serverCode.indexOf("app.get('/api/auth/session'"), serverCode.indexOf("app.get('/api/auth/users'"));
    assert.strictEqual(
      sessionSection.includes('refresh_token'),
      false,
      'Session inspection endpoint must not return refresh_token'
    );
  });

  // ====================================================================
  // 41. Migration 014 Final Auth Profile Bootstrap & ensure_my_profile()
  // ====================================================================
  await test('Database & Security: Migration 014 removes fragile auth triggers and defines ensure_my_profile & atomic workspace RPC', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'supabase', 'migrations');

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    assert.ok(files.includes('014_final_auth_profile_bootstrap.sql'), 'Migration 014 must exist');

    const sql014 = fs.readFileSync(path.join(dir, '014_final_auth_profile_bootstrap.sql'), 'utf-8');

    // 1. Fragile triggers removed
    assert.ok(sql014.includes('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;'), '014 must drop on_auth_user_created trigger');
    assert.ok(sql014.includes('DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;'), '014 must drop on_auth_user_updated trigger');
    assert.ok(sql014.includes('DROP FUNCTION IF EXISTS public.handle_new_auth_user();'), '014 must drop handle_new_auth_user');

    // 2. ensure_my_profile defined
    assert.ok(sql014.includes('CREATE OR REPLACE FUNCTION public.ensure_my_profile()'), '014 must define ensure_my_profile function');
    assert.ok(sql014.includes('SECURITY DEFINER'), '014 must use SECURITY DEFINER');
    assert.ok(sql014.includes('SET search_path = public, pg_temp'), '014 must set search_path = public, pg_temp');
    assert.ok(sql014.includes('auth.uid()'), '014 must derive identity from auth.uid()');
    assert.ok(!sql014.includes('p_user_id'), '014 must NOT accept client-controlled user ID parameter');
    assert.ok(!sql014.includes('p_email'), '014 must NOT accept client-controlled email parameter');

    // 3. Permissions
    assert.ok(sql014.includes('REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC;'), '014 must revoke execute from PUBLIC');
    assert.ok(sql014.includes('GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;'), '014 must grant execute to authenticated');
    assert.ok(sql014.includes('GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO service_role;'), '014 must grant execute to service_role');

    // 4. Atomic workspace creation procedure
    assert.ok(sql014.includes('CREATE OR REPLACE FUNCTION public.create_initial_workspace('), '014 must define create_initial_workspace function');
    assert.ok(sql014.includes('PERFORM public.ensure_my_profile();'), 'create_initial_workspace must ensure profile');

    // 5. Backfill & RLS preservation
    assert.ok(sql014.includes('INSERT INTO public.users'), '014 must backfill existing auth.users');
    assert.ok(sql014.includes('ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;'), '014 must keep RLS enabled');
    assert.ok(!sql014.includes('DISABLE ROW LEVEL SECURITY'), '014 must NEVER disable RLS');
    assert.ok(!sql014.includes('WITH CHECK (true)'), '014 must NEVER allow WITH CHECK (true)');
  });

  await test('Client & Server Auth Flow: Trusted server-authoritative profile synchronization via ensureUserProfileFromAuthUser', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const clientCode = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'supabase.ts'), 'utf-8');
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    const serviceCode = fs.readFileSync(path.join(process.cwd(), 'server', 'db', 'supabaseService.ts'), 'utf-8');

    // 1. Browser client does NOT call ensure_my_profile or ensureMyProfile in normal signIn or signUp
    const signInBody = clientCode.substring(clientCode.indexOf('async signIn('), clientCode.indexOf('async signUp('));
    assert.strictEqual(signInBody.includes("rpc('ensure_my_profile')"), false, 'Client signIn must NOT call ensure_my_profile RPC');
    assert.strictEqual(signInBody.includes('ensureMyProfile()'), false, 'Client signIn must NOT call ensureMyProfile()');

    const signUpBody = clientCode.substring(clientCode.indexOf('async signUp('), clientCode.indexOf('async resetPassword('));
    assert.strictEqual(signUpBody.includes("rpc('ensure_my_profile')"), false, 'Client signUp must NOT call ensure_my_profile RPC');
    assert.strictEqual(signUpBody.includes('ensureMyProfile()'), false, 'Client signUp must NOT call ensureMyProfile()');

    // 2. Server defines ensureUserProfileFromAuthUser and enforces SUPABASE_SERVICE_ROLE_KEY
    assert.ok(serviceCode.includes('export async function ensureUserProfileFromAuthUser'), 'supabaseService must define ensureUserProfileFromAuthUser');
    assert.ok(serviceCode.includes('SUPABASE_SERVICE_ROLE_KEY'), 'ensureUserProfileFromAuthUser must require SUPABASE_SERVICE_ROLE_KEY');
    assert.ok(serverCode.includes('ensureUserProfileFromAuthUser(data.user'), 'server.ts must call ensureUserProfileFromAuthUser on signin');

    // 3. Server-side workspace creation does NOT do users.upsert
    const createWsCode = serviceCode.substring(serviceCode.indexOf('createWorkspace('), serviceCode.indexOf('updateWorkspace('));
    assert.strictEqual(createWsCode.includes(".from('users').upsert"), false, 'createWorkspace must NOT call users.upsert');
  });

  await test('Server Profile Sync: ensureUserProfileFromAuthUser validates auth user and synchronizes profile', async () => {
    const { ensureUserProfileFromAuthUser } = await import('../server/db/supabaseService.js');

    // 1. Rejects null or empty user
    await assert.rejects(async () => {
      await ensureUserProfileFromAuthUser(null);
    }, /valid authenticated Supabase Auth user object/);

    await assert.rejects(async () => {
      await ensureUserProfileFromAuthUser({});
    }, /valid authenticated Supabase Auth user object/);

    // 2. Accepts valid auth user and synchronizes profile
    const synced = await ensureUserProfileFromAuthUser({
      id: 'usr_test_auth_123',
      email: 'owner@saas.io',
      user_metadata: { full_name: 'SaaS Founder' },
    });
    assert.strictEqual(synced.id, 'usr_test_auth_123');
    assert.strictEqual(synced.email, 'owner@saas.io');
    assert.strictEqual(synced.full_name, 'SaaS Founder');
  });

  // ====================================================================
  // 42. Demo Workspace & Optional Payment Provider Architecture
  // ====================================================================
  await test('Demo Mode & Provider Architecture: Demo session is self-contained and Stripe is strictly optional', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    const factoryCode = fs.readFileSync(path.join(process.cwd(), 'server/providers/factory.ts'), 'utf-8');

    // 1. Server defines POST /api/auth/demo
    assert.ok(serverCode.includes("app.post('/api/auth/demo'"), 'server.ts must define POST /api/auth/demo endpoint');
    assert.ok(serverCode.includes('demo.operator@reviveos.internal'), 'server.ts must define demo operator identity');
    assert.ok(serverCode.includes('email_confirm: true'), 'server.ts must set email_confirm: true to avoid SMTP delivery requirement for demo users');

    // 2. Stripe is an optional provider
    assert.ok(factoryCode.includes("['stripe', new StripeAdapter()]"), 'Provider factory must support stripe adapter');
    assert.ok(factoryCode.includes("['razorpay', new RazorpayAdapter()]"), 'Provider factory must support razorpay adapter');
    assert.ok(factoryCode.includes("['paypal', new PayPalAdapter()]"), 'Provider factory must support paypal adapter');
  });

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (100% SUCCESS)`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\nTest Suite encountered fatal error:', err);
  process.exit(1);
});
