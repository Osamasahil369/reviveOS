import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.ts';

async function runWorkspaceTests() {
  console.log('\n======================================================');
  console.log('WORKSPACE CREATION & IDEMPOTENCY TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Zero Automatic Workspace Creation on Sign In / Sign Up
  const store = db as any;
  store.users = [];
  store.workspaces = [];
  store.memberships = [];

  const signInSession = db.signIn('newuser@example.com');
  assert.strictEqual(signInSession.is_authenticated, true);
  assert.strictEqual(signInSession.workspace_id, null, 'Sign in with zero workspaces must result in null workspace_id (onboarding)');
  assert.strictEqual(store.workspaces.length, 0, 'Zero workspaces must exist automatically');

  // Test 2: Explicit One-Time Workspace Creation
  const newWs = db.createWorkspace('Acme Corp', 'saas', 'USD', false);
  assert.ok(newWs && newWs.id);
  assert.strictEqual(store.workspaces.length, 1);

  // Test 3: Idempotency of Workspace Creation (Duplicate creation call returns existing)
  const duplicateWs = db.createWorkspace('Acme Corp', 'saas', 'USD', false);
  assert.strictEqual(duplicateWs.id, newWs.id, 'Duplicate workspace creation with same name must return existing workspace');
  assert.strictEqual(store.workspaces.length, 1, 'Workspace count must remain 1 after duplicate call');

  // Test 4: Deduplication logic
  const list = [newWs, duplicateWs, newWs];
  const unique = Array.from(new Map(list.map(w => [w.id, w])).values());
  assert.strictEqual(unique.length, 1, 'Deduplication must yield exactly 1 unique workspace');

  // Test 5: End-to-End JWT Auth & Workspace Creation Flow
  const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfdGVzdF93c185OTkiLCJlbWFpbCI6Im93bmVyQGV4YW1wbGUuY29tIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjk5OTk5OTk5OTksInVzZXJfbWV0YWRhdGEiOnsiZnVsbF9uYW1lIjoiVGVzdCBPd25lciJ9fQ.mockSignature';
  const { tenantIsolationMiddleware } = await import('../server/middleware/tenantIsolation.js');
  
  const mockReq: any = {
    method: 'POST',
    url: '/api/workspaces',
    path: '/api/workspaces',
    headers: {
      authorization: `Bearer ${mockJwt}`,
    },
    body: {
      name: 'Integration Test Workspace',
      businessType: 'saas',
      currency: 'USD',
    },
  };
  const mockRes: any = {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.data = data;
      return this;
    },
  };

  let nextCalled = false;
  await tenantIsolationMiddleware(mockReq, mockRes, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true, 'tenantIsolationMiddleware must call next() for valid Bearer token');
  assert.ok(mockReq.user, 'req.user must be populated by tenantIsolationMiddleware');
  assert.strictEqual(mockReq.user.id, 'usr_test_ws_999', 'req.user.id must match JWT sub');
  assert.strictEqual(mockReq.user.email, 'owner@example.com', 'req.user.email must match JWT email');
  assert.strictEqual(mockReq.user.full_name, 'Test Owner', 'req.user.full_name must match JWT full_name');

  db.seedInitialData();
  console.log('  ✓ ALL WORKSPACE CREATION & IDEMPOTENCY TESTS PASSED\n');
}

runWorkspaceTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
