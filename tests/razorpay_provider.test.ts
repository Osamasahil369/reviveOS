import './setupEnv.js';
import assert from 'assert';
import { PaymentProviderFactory } from '../server/providers/factory.js';

async function runRazorpayAdapterTests() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY OS: RAZORPAY ADAPTER UNIT TESTS');
  console.log('======================================================\n');

  const adapter = PaymentProviderFactory.getAdapter('razorpay');
  const originalFetch = globalThis.fetch;

  try {
    // A. Valid credentials -> Razorpay HTTP 200 -> valid=true
    console.log('1. Testing A: Valid credentials HTTP 200...');
    let lastAuthHeader: string | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      lastAuthHeader = (init?.headers as any)?.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({ count: 0, items: [] }),
      } as Response;
    }) as any;

    const resA = await adapter.validateConnection({
      apiKey: 'rzp_test_sample123',
      apiSecret: 'sample_secret_456',
      webhookSecret: 'whsec_sample_789',
    });

    assert.strictEqual(resA.valid, true, 'A. Valid HTTP 200 response yields valid=true');
    assert.strictEqual(Boolean(lastAuthHeader), true, 'Authorization header was present');
    assert.strictEqual(lastAuthHeader?.startsWith('Basic '), true, 'Authorization header starts with Basic');
    const expectedAuth = `Basic ${Buffer.from('rzp_test_sample123:sample_secret_456').toString('base64')}`;
    assert.strictEqual(lastAuthHeader, expectedAuth, 'Authorization header correctly constructed');

    // B. Invalid credentials -> Razorpay HTTP 401 -> valid=false
    console.log('2. Testing B: Invalid credentials HTTP 401...');
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } }),
      } as Response;
    }) as any;

    const resB = await adapter.validateConnection({
      apiKey: 'rzp_test_badkey',
      apiSecret: 'badsecret',
      webhookSecret: 'whsec_valid',
    });

    assert.strictEqual(resB.valid, false, 'B. HTTP 401 response yields valid=false');
    assert.strictEqual(resB.error?.includes('The id provided does not exist'), true, 'B. Returns Razorpay error description');

    // C. Server error -> useful failure
    console.log('3. Testing C: Server error HTTP 500...');
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { description: 'Razorpay internal error' } }),
      } as Response;
    }) as any;

    const resC = await adapter.validateConnection({
      apiKey: 'rzp_test_key',
      apiSecret: 'secret',
      webhookSecret: 'whsec_123',
    });

    assert.strictEqual(resC.valid, false, 'C. HTTP 500 response yields valid=false');
    assert.strictEqual(resC.error?.includes('Razorpay internal error'), true, 'C. Useful server error message preserved');

    // D. Network failure -> useful failure
    console.log('4. Testing D: Network failure...');
    globalThis.fetch = (async () => {
      throw new Error('fetch failed ECONNREFUSED');
    }) as any;

    const resD = await adapter.validateConnection({
      apiKey: 'rzp_test_key',
      apiSecret: 'secret',
      webhookSecret: 'whsec_123',
    });

    assert.strictEqual(resD.valid, false, 'D. Network throw yields valid=false');
    assert.strictEqual(resD.error?.includes('Could not reach Razorpay API'), true, 'D. Network failure reported gracefully');

    // E. Malformed Key ID -> rejected before network call
    console.log('5. Testing E: Malformed Key ID...');
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return { ok: true } as Response;
    }) as any;

    const resE = await adapter.validateConnection({
      apiKey: 'invalid_prefix_123',
      apiSecret: 'secret',
      webhookSecret: 'whsec_123',
    });

    assert.strictEqual(resE.valid, false, 'E. Malformed Key ID fails validation');
    assert.strictEqual(fetchCalled, false, 'E. Fetch was NOT called for malformed Key ID');
    assert.strictEqual(resE.error?.includes('rzp_test_ or rzp_live_'), true, 'E. Prefix requirement reported');

    // F. Missing secret -> rejected before network call
    console.log('6. Testing F: Missing secret...');
    fetchCalled = false;
    const resF = await adapter.validateConnection({
      apiKey: 'rzp_test_123',
      apiSecret: '',
      webhookSecret: 'whsec_123',
    });

    assert.strictEqual(resF.valid, false, 'F. Missing secret fails validation');
    assert.strictEqual(fetchCalled, false, 'F. Fetch was NOT called when secret missing');

    // G. Missing webhook secret -> rejected before network call
    console.log('7. Testing G: Missing webhook secret...');
    fetchCalled = false;
    const resG = await adapter.validateConnection({
      apiKey: 'rzp_test_123',
      apiSecret: 'secret_123',
      webhookSecret: '',
    });

    assert.strictEqual(resG.valid, false, 'G. Missing webhook secret fails validation');
    assert.strictEqual(fetchCalled, false, 'G. Fetch was NOT called when webhook secret missing');

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('======================================================');
  console.log('RAZORPAY ADAPTER UNIT TESTS: ALL PASSED (100%)');
  console.log('======================================================\n');
}

runRazorpayAdapterTests().catch((err) => {
  console.error('❌ Razorpay Adapter Test Failed:', err);
  process.exit(1);
});
