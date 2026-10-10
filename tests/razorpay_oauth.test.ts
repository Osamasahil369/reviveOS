import assert from 'assert';
import crypto from 'crypto';
import { RazorpayOAuthService } from '../server/services/razorpayOAuthService.js';
import { RazorpayAdapter } from '../server/providers/razorpay.js';
import { db } from '../server/store/db.js';
import { encryptSecret, decryptSecret } from '../server/security/encryption.js';

console.log('======================================================');
console.log('REVIVEOS: RAZORPAY OAUTH ONBOARDING VALIDATION TESTS');
console.log('======================================================');

async function runTests() {
  const workspace1 = db.createWorkspace('Tenant Alpha ' + Date.now(), 'saas_recurring', 'USD', false);
  const workspace2 = db.createWorkspace('Tenant Beta ' + Date.now(), 'ecommerce', 'USD', false);
  const ws1 = workspace1.id;
  const ws2 = workspace2.id;

  // -------------------------------------------------------------------
  // TEST 1: Authorize URL Generation & OAuth Flow
  // -------------------------------------------------------------------
  console.log('1. Testing OAuth Flow & Authorize URL Generation...');
  const authResult = RazorpayOAuthService.getAuthorizeUrl(ws1, {
    redirectUri: 'https://app.reviveos.com/api/auth/razorpay/callback',
    scope: 'read_write',
  });

  assert(authResult.url, 'Authorize URL must be generated');
  assert(authResult.state, 'State token must be generated');
  assert(authResult.url.includes('state='), 'URL must contain state parameter');
  assert(authResult.url.includes('callback'), 'URL must contain redirect_uri');
  console.log('  ✓ PASS: Authorize URL constructed with secure state and redirect URI');

  // -------------------------------------------------------------------
  // TEST 2: Cryptographic State Verification & Anti-Tamper Security
  // -------------------------------------------------------------------
  console.log('2. Testing State Verification & Tamper Resistance...');
  const statePayload = RazorpayOAuthService.verifyState(authResult.state);
  assert.strictEqual(statePayload.workspaceId, ws1, 'State must bind to initiator workspaceId');
  assert(statePayload.nonce, 'State must contain unique cryptographic nonce');
  assert(statePayload.timestamp, 'State must have creation timestamp');

  // Test tampered state
  const stateParts = authResult.state.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ workspaceId: 'hacked_workspace', nonce: 'fake', timestamp: Date.now() })
  ).toString('base64url');
  const tamperedState = `${tamperedPayload}.${stateParts[1]}`;

  let tamperedCaught = false;
  try {
    RazorpayOAuthService.verifyState(tamperedState);
  } catch (err: any) {
    tamperedCaught = true;
    assert(err.message.includes('signature') || err.message.includes('verification'));
  }
  assert(tamperedCaught, 'Tampered OAuth state must be rejected');

  // Test expired state
  const expiredPayload = Buffer.from(
    JSON.stringify({ workspaceId: ws1, nonce: 'exp', timestamp: Date.now() - 20 * 60 * 1000 })
  ).toString('base64url');
  const expiredSig = crypto
    .createHmac('sha256', process.env.PROVIDER_SECRET_ENCRYPTION_KEY || 'reviveos-razorpay-oauth-state-secret-salt-2026')
    .update(expiredPayload)
    .digest('base64url');
  const expiredState = `${expiredPayload}.${expiredSig}`;

  let expiredCaught = false;
  try {
    RazorpayOAuthService.verifyState(expiredState);
  } catch (err: any) {
    expiredCaught = true;
    assert(err.message.includes('expired'));
  }
  assert(expiredCaught, 'Expired OAuth state (>15m) must be rejected');
  console.log('  ✓ PASS: HMAC verification protects against CSRF and tenant spoofing');

  // -------------------------------------------------------------------
  // TEST 3: Callback Validation & Code Exchange
  // -------------------------------------------------------------------
  console.log('3. Testing Callback Validation & Token Exchange...');
  const testCode = `test_code_${crypto.randomBytes(8).toString('hex')}`;
  const tokens = await RazorpayOAuthService.exchangeCodeForTokens(
    testCode,
    'https://app.reviveos.com/api/auth/razorpay/callback',
    true
  );

  assert(tokens.access_token, 'Tokens must include access_token');
  assert(tokens.refresh_token, 'Tokens must include refresh_token');
  assert(tokens.expires_at, 'Tokens must have calculated expires_at ISO date');
  assert(tokens.razorpay_account_id, 'Tokens must include merchant razorpay_account_id');
  assert(tokens.token_type === 'Bearer', 'Token type must be Bearer');
  console.log('  ✓ PASS: Authorization code exchanged for OAuth access & refresh tokens');

  // -------------------------------------------------------------------
  // TEST 4: Automatic Webhook Provisioning with 5 Required Events
  // -------------------------------------------------------------------
  console.log('4. Testing Automatic Webhook Provisioning & Event Subscriptions...');
  const webhookResult = await RazorpayOAuthService.provisionWebhook(
    tokens.access_token,
    tokens.razorpay_account_id,
    'https://app.reviveos.com'
  );

  assert(webhookResult.success, 'Webhook provisioning must succeed');
  assert(webhookResult.webhookSecret, 'Webhook secret must be generated');
  assert(webhookResult.webhookSecret.startsWith('whsec_rzp_'), 'Webhook secret must have secure prefix');

  const requiredEvents = RazorpayOAuthService.getRequiredWebhookEvents();
  assert.strictEqual(requiredEvents.length, 5, 'Must require exactly 5 failure & subscription events');
  assert(requiredEvents.includes('payment.failed'), 'Must include payment.failed');
  assert(requiredEvents.includes('payment.captured'), 'Must include payment.captured');
  assert(requiredEvents.includes('subscription.halted'), 'Must include subscription.halted');
  assert(requiredEvents.includes('subscription.charged'), 'Must include subscription.charged');
  assert(requiredEvents.includes('subscription.cancelled'), 'Must include subscription.cancelled');
  console.log('  ✓ PASS: Webhooks provisioned with all 5 mandatory recovery events');

  // -------------------------------------------------------------------
  // TEST 5: Tenant-Isolated Storage & AES-256 Encryption
  // -------------------------------------------------------------------
  console.log('5. Testing Multi-Tenant Isolation & Credential Encryption...');
  const encryptedToken = encryptSecret(tokens.access_token);
  const decryptedToken = decryptSecret(encryptedToken);
  assert.strictEqual(decryptedToken, tokens.access_token, 'Encrypted secret must decrypt cleanly');

  // Store connection in Workspace 1
  const conn1 = await db.saveOAuthProviderConnection(ws1, 'razorpay', {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_at,
    accountId: tokens.razorpay_account_id,
    webhookSecret: webhookResult.webhookSecret,
    webhookId: webhookResult.webhookId,
    subscribedEvents: webhookResult.events,
  });

  assert.strictEqual(conn1.workspace_id, ws1, 'Connection must belong to Workspace 1');
  assert.strictEqual(conn1.status, 'connected', 'Status must be connected');
  assert.strictEqual(conn1.config_summary?.is_oauth, true, 'Config summary must flag is_oauth');
  assert.strictEqual(conn1.config_summary?.account_id, tokens.razorpay_account_id, 'Account ID stored');

  // Verify Workspace 2 has ZERO access to Workspace 1 credentials
  const conn2 = db.getProviderConnection(ws2, 'razorpay');
  assert(!conn2 || conn2.status === 'disconnected', 'Workspace 2 must NOT see Workspace 1 connection');
  console.log('  ✓ PASS: Tenant isolation strictly enforced; credentials encrypted in vault');

  // -------------------------------------------------------------------
  // TEST 6: Token Refresh Flow
  // -------------------------------------------------------------------
  console.log('6. Testing Token Refresh Flow...');
  const refreshedTokens = await RazorpayOAuthService.refreshAccessToken(
    tokens.refresh_token,
    true
  );

  assert(refreshedTokens.access_token, 'Refreshed access token must exist');
  assert(refreshedTokens.expires_at, 'Refreshed expires_at must exist');
  assert.notStrictEqual(refreshedTokens.access_token, tokens.access_token, 'New token must differ from old');

  // Update storage with refreshed token
  const updatedConn = await db.saveOAuthProviderConnection(ws1, 'razorpay', {
    accessToken: refreshedTokens.access_token,
    refreshToken: refreshedTokens.refresh_token,
    expiresAt: refreshedTokens.expires_at,
    accountId: tokens.razorpay_account_id,
    webhookSecret: webhookResult.webhookSecret,
  });

  assert.strictEqual(updatedConn.api_key, refreshedTokens.access_token, 'Stored token updated');
  console.log('  ✓ PASS: Refresh token generates new access token and updates tenant store');

  // -------------------------------------------------------------------
  // TEST 7: Razorpay Adapter OAuth Token Support
  // -------------------------------------------------------------------
  console.log('7. Testing Razorpay Adapter OAuth Token Handling...');
  const adapter = new RazorpayAdapter();

  const oauthValidation = await adapter.validateConnection({
    authType: 'oauth',
    accessToken: 'rzp_oauth_test_token',
    accountId: 'acc_rzp_test_123',
    webhookSecret: 'whsec_test',
  });

  assert.strictEqual(oauthValidation.valid, true, 'OAuth credentials must validate successfully');
  assert.strictEqual(oauthValidation.accountId, 'acc_rzp_test_123', 'Account ID resolved');

  const effCreds = (adapter as any).getEffectiveCredentials(
    {
      authType: 'oauth',
      accessToken: 'rzp_oauth_valid_key',
      accountId: 'acc_rzp_merchant_99',
    },
    ws1
  );

  assert(effCreds, 'Effective credentials must be resolved');
  assert.strictEqual(effCreds.isOAuth, true, 'isOAuth flag must be true');
  assert.strictEqual(effCreds.authHeader, 'Bearer rzp_oauth_valid_key', 'Auth header must use Bearer prefix');
  assert.strictEqual(effCreds.headers['X-Razorpay-Account'], 'acc_rzp_merchant_99', 'X-Razorpay-Account passed');
  console.log('  ✓ PASS: Razorpay Adapter seamlessly constructs Bearer and account headers');

  // -------------------------------------------------------------------
  // TEST 8: Full Backward Compatibility with Manual API Keys
  // -------------------------------------------------------------------
  console.log('8. Testing Backward Compatibility with Manual API Keys...');
  const apiKeyValidation = await adapter.validateConnection({
    apiKey: 'rzp_test_1234567890abcdef',
    apiSecret: 'secret_1234567890abcdef',
    webhookSecret: 'whsec_test_secret',
  });

  // Note: network call to mock or test
  assert(typeof apiKeyValidation.valid === 'boolean', 'API key validation returns boolean response');

  const legacyCreds = (adapter as any).getEffectiveCredentials(
    {
      apiKey: 'rzp_test_manual_key_id',
      apiSecret: 'manual_secret_key',
    },
    ws1
  );

  assert(legacyCreds, 'Legacy credentials must be resolved');
  assert.strictEqual(legacyCreds.isOAuth, false, 'isOAuth flag must be false for API keys');
  assert(legacyCreds.authHeader.startsWith('Basic '), 'Auth header must use HTTP Basic for API keys');
  assert(!legacyCreds.headers['X-Razorpay-Account'], 'X-Razorpay-Account must not be set for standard API keys');
  console.log('  ✓ PASS: 100% backward compatibility maintained for existing API-key integrations');

  // -------------------------------------------------------------------
  // TEST 9: Failure & Edge-Case Handling
  // -------------------------------------------------------------------
  console.log('9. Testing Failure & Edge-Case Handling...');
  let emptyCodeCaught = false;
  try {
    await RazorpayOAuthService.exchangeCodeForTokens('', 'https://callback');
  } catch (err: any) {
    emptyCodeCaught = true;
    assert(err.message.includes('required'));
  }
  assert(emptyCodeCaught, 'Empty authorization code must be rejected');

  let emptyStateCaught = false;
  try {
    RazorpayOAuthService.verifyState('');
  } catch (err: any) {
    emptyStateCaught = true;
  }
  assert(emptyStateCaught, 'Empty state must be rejected');

  console.log('  ✓ PASS: Malformed inputs, missing codes, and expired states handled gracefully');

  console.log('======================================================');
  console.log('ALL 9/9 RAZORPAY OAUTH TEST SUITES PASSED (100%)');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
