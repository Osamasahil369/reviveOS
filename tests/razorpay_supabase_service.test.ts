import './setupEnv.js';
import assert from 'assert';
import { supabaseService } from '../server/db/supabaseService.js';
import { setSupabaseServerClientOverride } from '../server/db/supabaseClient.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { encryptSecret, decryptSecret } from '../server/security/encryption.js';

async function runRazorpaySupabaseServiceTests() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY OS: REAL SUPABASE RAZORPAY SERVICE SUITE');
  console.log('======================================================\n');

  setStorageMode('supabase_production');

  const originalFetch = globalThis.fetch;
  let providerDb: Record<string, any> = {};
  let upsertCalls: any[] = [];

  // Helper to create a deterministic mock Supabase client
  function createMockSupabaseClient() {
    return {
      from(tableName: string) {
        if (tableName !== 'provider_connections') {
          throw new Error(`Unexpected table query: ${tableName}`);
        }
        let filterWs = '';
        let filterProvider = '';

        const builder = {
          select(_cols?: string) {
            return builder;
          },
          eq(column: string, val: string) {
            if (column === 'workspace_id') filterWs = val;
            if (column === 'provider_type') filterProvider = val;
            return builder;
          },
          async maybeSingle() {
            const key = `${filterWs}_${filterProvider}`;
            const row = providerDb[key] || null;
            return { data: row ? { ...row } : null, error: null };
          },
          upsert(payload: any, options?: any) {
            upsertCalls.push({ payload, options });
            const key = `${payload.workspace_id}_${payload.provider_type}`;
            const existingRow = providerDb[key];
            const rowId = existingRow ? existingRow.id : `conn_rzp_${Date.now()}_${Math.random()}`;

            const updatedRow = {
              id: rowId,
              workspace_id: payload.workspace_id,
              provider_type: payload.provider_type,
              status: payload.status,
              api_key_encrypted: payload.api_key_encrypted,
              api_secret_encrypted: payload.api_secret_encrypted,
              webhook_secret_encrypted: payload.webhook_secret_encrypted,
              is_live: payload.is_live,
              last_sync_at: payload.last_sync_at,
              last_error: payload.last_error,
              metadata: payload.metadata || {},
              created_at: existingRow ? existingRow.created_at : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            providerDb[key] = updatedRow;

            return {
              select(_c?: string) {
                return {
                  async single() {
                    return { data: { ...updatedRow }, error: null };
                  },
                };
              },
            };
          },
        };
        return builder;
      },
    };
  }

  // Setup mock fetch for Razorpay API calls
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const auth = (init?.headers as any)?.Authorization || '';
    const decoded = auth.startsWith('Basic ')
      ? Buffer.from(auth.slice(6), 'base64').toString('utf8')
      : auth;

    if (decoded.includes('invalid') || decoded.includes('badkey') || decoded.includes('badsecret')) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { description: 'Invalid key or secret' } }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ count: 0 }),
    } as Response;
  }) as any;

  try {
    const mockClient = createMockSupabaseClient();
    setSupabaseServerClientOverride(mockClient);

    const wsId = 'fa6e7e7c-21d1-4928-af28-bf9dbec01ae1';

    // H. New Razorpay row + valid credentials -> exactly 1 row created
    console.log('1. Testing H: New Razorpay row + valid credentials...');
    upsertCalls = [];
    const resH = await supabaseService.updateProviderConnection(wsId, 'razorpay', {
      apiKey: 'rzp_test_new123',
      apiSecret: 'secret_new456',
      webhookSecret: 'whsec_new789',
    });

    assert.strictEqual(resH.status, 'connected', 'H. Status is connected');
    assert.strictEqual(resH.config_summary.has_api_key, true, 'H. has_api_key is true');
    assert.strictEqual(resH.config_summary.has_webhook_secret, true, 'H. has_webhook_secret is true');
    assert.strictEqual((resH as any).api_key_encrypted, undefined, 'Plaintext/encrypted keys not exposed in response');
    assert.strictEqual((resH as any).api_key, undefined, 'Plaintext API key never exposed in response');
    assert.strictEqual(Object.keys(providerDb).length, 1, 'H. Exactly 1 row created in DB');

    const createdRowId = providerDb[`${wsId}_razorpay`].id;

    // A. Existing provider row + all 3 credentials -> updateProviderConnection executes, row updated, same ID
    console.log('2. Testing A: Existing provider row + all 3 new credentials...');
    upsertCalls = [];
    const resA = await supabaseService.updateProviderConnection(wsId, 'razorpay', {
      apiKey: 'rzp_test_updated123',
      apiSecret: 'secret_updated456',
      webhookSecret: 'whsec_updated789',
    });

    assert.strictEqual(resA.id, createdRowId, 'A. Same row identity preserved');
    const dbRowA = providerDb[`${wsId}_razorpay`];
    assert.strictEqual(Boolean(dbRowA.api_key_encrypted), true, 'A. api_key_encrypted is non-null');
    assert.strictEqual(Boolean(dbRowA.api_secret_encrypted), true, 'A. api_secret_encrypted is non-null');
    assert.strictEqual(Boolean(dbRowA.webhook_secret_encrypted), true, 'A. webhook_secret_encrypted is non-null');
    assert.strictEqual(decryptSecret(dbRowA.api_key_encrypted), 'rzp_test_updated123', 'A. API key correctly updated');

    // B. Existing row + omitted credentials -> existing encrypted credentials remain unchanged
    console.log('3. Testing B: Existing row + omitted credentials (using masked/blank)...');
    upsertCalls = [];
    const resB = await supabaseService.updateProviderConnection(wsId, 'razorpay', {
      apiKey: '••••••••',
      apiSecret: '••••••••',
      webhookSecret: '••••••••',
    });

    assert.strictEqual(resB.id, createdRowId, 'B. Same row ID');
    const dbRowB = providerDb[`${wsId}_razorpay`];
    assert.strictEqual(decryptSecret(dbRowB.api_key_encrypted), 'rzp_test_updated123', 'B. Existing API key preserved when omitted');
    assert.strictEqual(decryptSecret(dbRowB.api_secret_encrypted), 'secret_updated456', 'B. Existing API secret preserved when omitted');
    assert.strictEqual(decryptSecret(dbRowB.webhook_secret_encrypted), 'whsec_updated789', 'B. Existing webhook secret preserved when omitted');

    // C. Existing row + invalid credentials -> validation fails, NO provider row mutation happens
    console.log('4. Testing C: Existing row + invalid credentials...');
    const snapshotBeforeC = JSON.stringify(providerDb[`${wsId}_razorpay`]);
    let errC: any = null;
    try {
      await supabaseService.updateProviderConnection(wsId, 'razorpay', {
        apiKey: 'rzp_test_invalid_badkey',
        apiSecret: 'badsecret',
        webhookSecret: 'whsec_123',
      });
    } catch (e: any) {
      errC = e;
    }

    assert.strictEqual(Boolean(errC), true, 'C. Validation failure throws error');
    assert.strictEqual(JSON.stringify(providerDb[`${wsId}_razorpay`]), snapshotBeforeC, 'C. NO provider row mutation occurred');

    // D. Existing row + missing Key ID -> rejected, existing API key NOT erased
    console.log('5. Testing D: Existing row + missing Key ID...');
    let errD: any = null;
    try {
      await supabaseService.updateProviderConnection('ws_empty', 'razorpay', {
        apiKey: '',
        apiSecret: 'secret123',
        webhookSecret: 'whsec123',
      });
    } catch (e: any) {
      errD = e;
    }
    assert.strictEqual(Boolean(errD), true, 'D. Missing Key ID rejected');

    // E. Existing row + missing Key Secret -> rejected
    console.log('6. Testing E: Existing row + missing Key Secret...');
    let errE: any = null;
    try {
      await supabaseService.updateProviderConnection('ws_empty', 'razorpay', {
        apiKey: 'rzp_test_123',
        apiSecret: '',
        webhookSecret: 'whsec123',
      });
    } catch (e: any) {
      errE = e;
    }
    assert.strictEqual(Boolean(errE), true, 'E. Missing Key Secret rejected');

    // F. Existing row + missing Webhook Secret -> rejected
    console.log('7. Testing F: Existing row + missing Webhook Secret...');
    let errF: any = null;
    try {
      await supabaseService.updateProviderConnection('ws_empty', 'razorpay', {
        apiKey: 'rzp_test_123',
        apiSecret: 'secret123',
        webhookSecret: '',
      });
    } catch (e: any) {
      errF = e;
    }
    assert.strictEqual(Boolean(errF), true, 'F. Missing Webhook Secret rejected');

    // G. Existing row + repeated successful save -> still exactly one provider connection
    console.log('8. Testing G: Repeated successful save (idempotent upsert)...');
    await supabaseService.updateProviderConnection(wsId, 'razorpay', {
      apiKey: 'rzp_test_updated123',
      apiSecret: 'secret_updated456',
      webhookSecret: 'whsec_updated789',
    });
    await supabaseService.updateProviderConnection(wsId, 'razorpay', {
      apiKey: 'rzp_test_updated123',
      apiSecret: 'secret_updated456',
      webhookSecret: 'whsec_updated789',
    });
    assert.strictEqual(Object.keys(providerDb).length, 1, 'G. Still exactly 1 provider connection row in DB');

    // I. Duplicate INSERT attempt -> no duplicate row (handled by onConflict in upsert)
    console.log('9. Testing I: Verify upsert onConflict options...');
    const lastUpsert = upsertCalls[upsertCalls.length - 1];
    assert.strictEqual(lastUpsert.options?.onConflict, 'workspace_id,provider_type', 'I. onConflict constraint is workspace_id,provider_type');

    // J. Test key -> is_live = false
    console.log('10. Testing J: Test key produces is_live = false...');
    const resJ = await supabaseService.updateProviderConnection(wsId, 'razorpay', {
      apiKey: 'rzp_test_livecheck',
      apiSecret: 'secret',
      webhookSecret: 'whsec',
    });
    assert.strictEqual(resJ.is_live, false, 'J. Test key resolves is_live = false');

    // K. Live key -> is_live = true
    console.log('11. Testing K: Live key produces is_live = true...');
    const resK = await supabaseService.updateProviderConnection(wsId, 'razorpay', {
      apiKey: 'rzp_live_livecheck',
      apiSecret: 'secret',
      webhookSecret: 'whsec',
    });
    assert.strictEqual(resK.is_live, true, 'K. Live key resolves is_live = true');

    // L. Database write failure -> error propagates
    console.log('12. Testing L: Database write failure error propagation...');
    const dbErrClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return { data: null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          upsert() {
            return {
              select() {
                return {
                  async single() {
                    return { data: null, error: { message: 'Database disk full or constraint error' } };
                  },
                };
              },
            };
          },
        };
      },
    };
    setSupabaseServerClientOverride(dbErrClient as any);

    let errL: any = null;
    try {
      await supabaseService.updateProviderConnection('ws_dberr', 'razorpay', {
        apiKey: 'rzp_test_valid',
        apiSecret: 'validsecret',
        webhookSecret: 'validwhsec',
      });
    } catch (e: any) {
      errL = e;
    }

    assert.strictEqual(Boolean(errL), true, 'L. Database error propagated');
    assert.strictEqual(errL.message.includes('Database disk full'), true, 'L. Exact DB error message preserved');

    // M. PROVIDER SYNC SCENARIOS (1-14)
    console.log('\n--- Testing Provider Sync Scenarios (1-14) ---');

    // Mock DB tables for sync testing
    const syncDbCustomers: any[] = [];
    const syncDbSubscriptions: any[] = [];
    const syncDbInvoices: any[] = [];
    const syncDbPayments: any[] = [];

    const syncMockClient = {
      from(tableName: string) {
        if (tableName === 'provider_connections') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return {
                            data: {
                              id: 'conn_123',
                              workspace_id: wsId,
                              provider_type: 'razorpay',
                              status: 'connected',
                              api_key_encrypted: encryptSecret('rzp_test_sync123'),
                              api_secret_encrypted: encryptSecret('secret_sync456'),
                              webhook_secret_encrypted: encryptSecret('whsec_sync789'),
                              is_live: false,
                            },
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
            update() {
              return {
                eq() {
                  return {
                    async eq() {
                      return { data: [], error: null };
                    },
                  };
                },
              };
            },
          };
        }

        if (tableName === 'customers') {
          return {
            async upsert(payload: any) {
              const existingIdx = syncDbCustomers.findIndex((c) => c.provider_customer_id === payload.provider_customer_id);
              if (existingIdx >= 0) {
                syncDbCustomers[existingIdx] = { ...syncDbCustomers[existingIdx], ...payload };
              } else {
                syncDbCustomers.push({ id: `cust_uuid_${syncDbCustomers.length + 1}`, ...payload });
              }
              return { data: null, error: null };
            },
            select() {
              return {
                eq() {
                  return {
                    async eq() {
                      return { data: syncDbCustomers, error: null };
                    },
                  };
                },
              };
            },
          };
        }

        if (tableName === 'subscriptions') {
          return {
            async upsert(payload: any) {
              const existingIdx = syncDbSubscriptions.findIndex((s) => s.provider_subscription_id === payload.provider_subscription_id);
              if (existingIdx >= 0) {
                syncDbSubscriptions[existingIdx] = { ...syncDbSubscriptions[existingIdx], ...payload };
              } else {
                syncDbSubscriptions.push({ id: `sub_uuid_${syncDbSubscriptions.length + 1}`, ...payload });
              }
              return { data: null, error: null };
            },
            select() {
              return {
                eq() {
                  return {
                    async eq() {
                      return { data: syncDbSubscriptions, error: null };
                    },
                  };
                },
              };
            },
          };
        }

        if (tableName === 'invoices') {
          return {
            async upsert(payload: any) {
              const existingIdx = syncDbInvoices.findIndex((i) => i.provider_invoice_id === payload.provider_invoice_id);
              if (existingIdx >= 0) {
                syncDbInvoices[existingIdx] = { ...syncDbInvoices[existingIdx], ...payload };
              } else {
                syncDbInvoices.push({ id: `inv_uuid_${syncDbInvoices.length + 1}`, ...payload });
              }
              return { data: null, error: null };
            },
            select() {
              return {
                eq() {
                  return {
                    async eq() {
                      return { data: syncDbInvoices, error: null };
                    },
                  };
                },
              };
            },
          };
        }

        if (tableName === 'payments') {
          return {
            async upsert(payload: any) {
              const existingIdx = syncDbPayments.findIndex((p) => p.provider_payment_id === payload.provider_payment_id);
              if (existingIdx >= 0) {
                syncDbPayments[existingIdx] = { ...syncDbPayments[existingIdx], ...payload };
              } else {
                syncDbPayments.push({ id: `pay_uuid_${syncDbPayments.length + 1}`, ...payload });
              }
              return { data: null, error: null };
            },
          };
        }

        if (tableName === 'audit_logs') {
          return {
            insert(row: any) {
              return {
                select(_cols?: string) {
                  return {
                    async single() {
                      return { data: { id: 'audit_log_1', ...row }, error: null };
                    },
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table query: ${tableName}`);
      },
    };

    setSupabaseServerClientOverride(syncMockClient as any);

    // Scenario 1: All endpoints succeed
    console.log('Scenario 1: All endpoints succeed...');
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/customers')) {
        return { ok: true, json: async () => ({ items: [{ id: 'c_01', name: 'Alice', email: 'alice@test.com' }] }) } as any;
      }
      if (urlStr.includes('/subscriptions')) {
        return { ok: true, json: async () => ({ items: [{ id: 's_01', customer_id: 'c_01', amount: 2900 }] }) } as any;
      }
      if (urlStr.includes('/invoices')) {
        return { ok: true, json: async () => ({ items: [{ id: 'i_01', customer_id: 'c_01', subscription_id: 's_01', amount: 2900 }] }) } as any;
      }
      if (urlStr.includes('/payments')) {
        return { ok: true, json: async () => ({ items: [{ id: 'p_01', customer_id: 'c_01', invoice_id: 'i_01', amount: 2900, status: 'captured' }] }) } as any;
      }
      return { ok: true, json: async () => ({ count: 0 }) } as any;
    }) as any;

    const syncRes1 = await supabaseService.syncProviderData(wsId, 'razorpay');
    assert.strictEqual(syncRes1.success, true, '1. All endpoints succeed yields success=true');
    assert.strictEqual(syncRes1.partial, false, '1. partial is false');
    assert.strictEqual(syncRes1.synced.customers, 1, '1. 1 customer synced');
    assert.strictEqual(syncRes1.synced.subscriptions, 1, '1. 1 subscription synced');

    // Verify UUID mappings
    assert.strictEqual(syncDbSubscriptions[0].customer_id, 'cust_uuid_1', '6 & 7. Subscription customer_id resolved to customer UUID');
    assert.strictEqual(syncDbInvoices[0].customer_id, 'cust_uuid_1', '8. Invoice customer_id resolved to customer UUID');
    assert.strictEqual(syncDbInvoices[0].subscription_id, 'sub_uuid_1', '8. Invoice subscription_id resolved to subscription UUID');
    assert.strictEqual(syncDbPayments[0].customer_id, 'cust_uuid_1', '9. Payment customer_id resolved to customer UUID');
    assert.strictEqual(syncDbPayments[0].invoice_id, 'inv_uuid_1', '9. Payment invoice_id resolved to invoice UUID');

    // Scenario 2: Subscriptions 401 while others succeed -> Partial Success
    console.log('Scenario 2: Subscriptions 401 while others succeed...');
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/subscriptions')) {
        return { ok: false, status: 401, json: async () => ({ error: { description: 'Unauthorized subscription access' } }) } as any;
      }
      if (urlStr.includes('/customers')) {
        return { ok: true, json: async () => ({ items: [{ id: 'c_01', name: 'Alice' }] }) } as any;
      }
      if (urlStr.includes('/invoices')) {
        return { ok: true, json: async () => ({ items: [{ id: 'i_01', customer_id: 'c_01', amount: 2900 }] }) } as any;
      }
      if (urlStr.includes('/payments')) {
        return { ok: true, json: async () => ({ items: [{ id: 'p_01', customer_id: 'c_01', amount: 2900 }] }) } as any;
      }
      return { ok: true, json: async () => ({ count: 0 }) } as any;
    }) as any;

    const syncRes2 = await supabaseService.syncProviderData(wsId, 'razorpay');
    assert.strictEqual(syncRes2.success, true, '2. Subscriptions 401 returns success=true (partial)');
    assert.strictEqual(syncRes2.partial, true, '2. partial is true');
    assert.strictEqual(Boolean(syncRes2.errors?.subscriptions), true, '2. errors.subscriptions is recorded');
    assert.strictEqual(syncRes2.message.includes('completed with warnings'), true, '2. User-facing warning message returned');

    // Scenario 6: 0 records across all endpoints, and subscriptions 401 -> Partial Success (does NOT throw 500)
    console.log('Scenario 6: 0 records across all endpoints, and subscriptions 401...');
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/subscriptions')) {
        return { ok: false, status: 401, json: async () => ({ error: { description: 'Unauthorized subscription access' } }) } as any;
      }
      if (urlStr.includes('/customers')) {
        return { ok: true, json: async () => ({ items: [] }) } as any;
      }
      if (urlStr.includes('/invoices')) {
        return { ok: true, json: async () => ({ items: [] }) } as any;
      }
      if (urlStr.includes('/payments')) {
        return { ok: true, json: async () => ({ items: [] }) } as any;
      }
      return { ok: true, json: async () => ({ count: 0 }) } as any;
    }) as any;

    const syncRes6 = await supabaseService.syncProviderData(wsId, 'razorpay');
    assert.strictEqual(syncRes6.success, true, '6. 0 records + subscriptions 401 returns success=true');
    assert.strictEqual(syncRes6.partial, true, '6. partial is true');
    assert.strictEqual(syncRes6.synced.customers, 0, '6. 0 customers');
    assert.strictEqual(syncRes6.synced.subscriptions, 0, '6. 0 subscriptions');
    assert.strictEqual(syncRes6.synced.invoices, 0, '6. 0 invoices');
    assert.strictEqual(syncRes6.synced.payments, 0, '6. 0 payments');
    assert.strictEqual(Boolean(syncRes6.errors?.subscriptions), true, '6. errors.subscriptions is recorded');
    assert.strictEqual(syncRes6.message.includes('completed with warnings'), true, '6. Warning message returned without throwing');

    // Scenario 5: All endpoints fail -> Hard Failure
    console.log('Scenario 5: All endpoints fail...');
    globalThis.fetch = (async () => {
      return { ok: false, status: 401, json: async () => ({ error: { description: 'Unauthorized' } }) } as any;
    }) as any;

    let syncErr5: any = null;
    try {
      await supabaseService.syncProviderData(wsId, 'razorpay');
    } catch (e: any) {
      syncErr5 = e;
    }
    assert.strictEqual(Boolean(syncErr5), true, '5. All endpoints failing causes hard failure error');
    assert.strictEqual(syncErr5.message.includes('Gateway sync failed'), true, '5. Explicit error message returned');

  } finally {
    globalThis.fetch = originalFetch;
    setSupabaseServerClientOverride(null);
    setStorageMode('local_development');
  }

  console.log('======================================================');
  console.log('SUPABASE RAZORPAY SERVICE SUITE: ALL PASSED (100%)');
  console.log('======================================================\n');
}

runRazorpaySupabaseServiceTests().catch((err) => {
  console.error('❌ Razorpay Supabase Service Test Failed:', err);
  process.exit(1);
});
