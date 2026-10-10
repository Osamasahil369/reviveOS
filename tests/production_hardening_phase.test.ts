import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { RevenueLeakScanner } from '../server/scanner/revenueScanner.js';
import { AutopilotPolicyEngine } from '../server/services/autopilotPolicyEngine.js';
import { AutonomousRecoveryEngine } from '../server/services/autonomousRecoveryEngine.js';
import { RecoveryDispatchEngine } from '../server/services/recoveryDispatchEngine.js';
import { AutopilotService } from '../server/services/autopilotService.js';
import { formatCurrencyAmount } from '../src/utils/currency.js';

async function runProductionHardeningValidation() {
  console.log('================================================================');
  console.log('REVIVEOS PRODUCTION HARDENING PHASE: 13-STEP E2E AUDIT');
  console.log('================================================================\n');

  setStorageMode('local_development');
  db.setPersistenceEnabled(false);
  db.resetToCleanSeed();

  const timestamp = Date.now();

  // ---------------------------------------------------------------------------
  // 1. CREATE ACCOUNT
  // ---------------------------------------------------------------------------
  console.log('Step 1: Create Account / Verify Authenticated Identity...');
  const user = db.getCurrentUser();
  assert.ok(user && user.id, 'User account exists');
  console.log(`  ✓ Authenticated user: ${user.full_name || user.email}`);

  // ---------------------------------------------------------------------------
  // 2. CREATE WORKSPACE
  // ---------------------------------------------------------------------------
  console.log('Step 2: Create Clean Workspace (Tenant Isolation)...');
  const ws = db.createWorkspace(`Apex SaaS Solutions ${timestamp}`, 'saas', 'USD');
  const wsId = ws.id;
  assert.ok(wsId, 'Workspace created');
  assert.strictEqual(ws.currency, 'USD');
  console.log(`  ✓ Workspace created: ${ws.name} (${wsId})`);

  // Verify fresh workspace metrics are strictly 0 and NOT hardcoded mock numbers
  const initialMetrics = db.getMetrics(wsId);
  assert.strictEqual(initialMetrics.revenue_recovered_cents, 0, 'Fresh workspace has 0 recovered revenue');
  assert.strictEqual(initialMetrics.revenue_at_risk_cents, 0, 'Fresh workspace has 0 revenue at risk');
  assert.strictEqual(initialMetrics.total_failed_payments_count, 0, 'Fresh workspace has 0 failed payments');
  console.log('  ✓ Verified 0 hardcoded/mock metrics on initial workspace');

  // ---------------------------------------------------------------------------
  // 3. CONNECT PROVIDER
  // ---------------------------------------------------------------------------
  console.log('Step 3: Connect Provider...');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.includes('api.stripe.com') || url.includes('api.razorpay.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'acct_apex_test', object: 'account' }),
      } as Response;
    }
    return originalFetch(url);
  }) as any;

  const conn = await db.updateProviderConnection(wsId, 'stripe', {
    apiKey: 'sk_test_apex_prod_key',
    webhookSecret: 'whsec_apex_test',
    isLive: false,
  });
  globalThis.fetch = originalFetch;

  assert.ok(conn && conn.status === 'connected', 'Provider is connected');
  console.log(`  ✓ Provider connected: ${conn.provider_type} (status: ${conn.status})`);

  // ---------------------------------------------------------------------------
  // 4. AUTO SCAN
  // ---------------------------------------------------------------------------
  console.log('Step 4: Auto Scan...');
  // Ingest failed invoice
  const cust = db.createCustomer(wsId, {
    name: 'TechCorp Cloud',
    email: 'billing@techcorp.cloud',
    phone: '+14155552671',
    currency: 'USD',
  });
  assert.ok(cust && cust.id, 'Customer created');

  const paymentFailure = db.createManualFailedInvoice(wsId, {
    customerId: cust.id,
    amountCents: 45000, // $450.00 (under $500 threshold -> Autonomous)
    currency: 'USD',
    providerFailureCode: 'insufficient_funds',
    rawErrorMessage: 'Insufficient funds on credit card',
  });
  assert.ok(paymentFailure && paymentFailure.opportunity, 'Payment failure ingested');
  const oppId = paymentFailure.opportunity.id;

  const scanResult = await RevenueLeakScanner.executeScan(wsId);
  assert.ok(scanResult.totalRecordsAudited >= 1, 'Scan audited payment records');
  assert.strictEqual(scanResult.totalAtRiskCents, 45000, 'Scan correctly audited $450 at risk');
  console.log(`  ✓ Scan completed. Audited ${scanResult.totalRecordsAudited} records, At Risk: $${scanResult.totalAtRiskCents / 100}`);

  // ---------------------------------------------------------------------------
  // 5. OPPORTUNITY CREATION
  // ---------------------------------------------------------------------------
  console.log('Step 5: Opportunity Creation...');
  const opp = db.getOpportunityById(oppId, wsId);
  assert.ok(opp, 'Opportunity exists in store');
  assert.strictEqual(opp.amount_at_risk_cents, 45000);
  assert.strictEqual(opp.customer?.name, 'TechCorp Cloud');
  console.log(`  ✓ Opportunity verified: ${opp.id} (${opp.customer?.name})`);

  // ---------------------------------------------------------------------------
  // 6. POLICY EVALUATION
  // ---------------------------------------------------------------------------
  console.log('Step 6: Policy Evaluation...');
  const policyDecision = AutopilotPolicyEngine.evaluate(opp, opp.customer, ws, ws.autopilot_settings);
  assert.ok(policyDecision, 'Policy evaluated');
  assert.strictEqual(policyDecision.decision, 'AUTONOMOUS', 'Invoice under threshold is AUTONOMOUS');
  console.log(`  ✓ Policy evaluated: ${policyDecision.decision} (Reason: ${policyDecision.reason})`);

  // ---------------------------------------------------------------------------
  // 7. RECOVERY PLAN GENERATION
  // ---------------------------------------------------------------------------
  console.log('Step 7: Recovery Plan Generation...');
  const plan = await AutopilotService.generateOpportunityRecoveryPlan(wsId, oppId);
  assert.ok(plan && (plan.recommendedSteps || plan.steps), 'Recovery plan generated');
  const stepCount = (plan.recommendedSteps || plan.steps || []).length;
  console.log(`  ✓ Plan generated with ${stepCount} step(s)`);

  // ---------------------------------------------------------------------------
  // 8. RECOVERY LINK GENERATION
  // ---------------------------------------------------------------------------
  console.log('Step 8: Recovery Link Generation...');
  const linkInfo = AutopilotService.ensureOpportunityRecoveryLink(wsId, opp);
  assert.ok(linkInfo && linkInfo.link, 'Hosted payment portal link created');
  assert.ok(linkInfo.link.includes('/pay/'), 'Link contains secure payment route');
  console.log(`  ✓ Secure recovery link generated: ${linkInfo.link}`);

  // ---------------------------------------------------------------------------
  // 9. WORKFLOW CREATION
  // ---------------------------------------------------------------------------
  console.log('Step 9: Workflow Creation...');
  const processResult = await AutonomousRecoveryEngine.processOpportunity(wsId, oppId);
  assert.ok(processResult && processResult.workflow, 'Autonomous recovery workflow created');
  const workflow = processResult.workflow;
  assert.ok(workflow.state === 'scheduled' || workflow.state === 'running', 'Workflow in active state');
  console.log(`  ✓ Autonomous workflow created: ${workflow.id} (State: ${workflow.state})`);

  // ---------------------------------------------------------------------------
  // 10. RETRY SCHEDULING
  // ---------------------------------------------------------------------------
  console.log('Step 10: Retry Scheduling...');
  const schedules = db.getAutonomousRetrySchedules(wsId);
  const wfSchedules = schedules.filter((s) => s.workflow_id === workflow.id);
  assert.ok(wfSchedules.length >= 1, 'Retry schedule registered');
  console.log(`  ✓ Retry schedule active: ${wfSchedules.length} scheduled attempt(s)`);

  // ---------------------------------------------------------------------------
  // 11. DISPATCH TRACKING
  // ---------------------------------------------------------------------------
  console.log('Step 11: Dispatch Tracking...');
  const dispatchRes = await RecoveryDispatchEngine.dispatchWorkflow(wsId, workflow.id, {
    channel: 'email',
  });
  assert.ok(dispatchRes && dispatchRes.dispatch, 'Dispatch recorded');
  const dispatch = dispatchRes.dispatch;
  assert.strictEqual(dispatch.channel, 'email');
  assert.strictEqual(dispatch.status, 'sent');
  console.log(`  ✓ Dispatch tracked: ${dispatch.id} to ${cust.email}`);

  // ---------------------------------------------------------------------------
  // 12. RECOVERY COMPLETION
  // ---------------------------------------------------------------------------
  console.log('Step 12: Recovery Completion...');
  const settlement = db.settleRecoveryPayment(oppId, {
    amountCents: 45000,
    providerPaymentId: 'pay_test_settled_123',
    method: 'payment_link',
  }, wsId);
  assert.ok(settlement && settlement.success, 'Opportunity successfully settled');
  const settledOpp = db.getOpportunityById(oppId, wsId);
  assert.strictEqual(settledOpp?.status, 'recovered');
  console.log(`  ✓ Recovery completed. Amount: $${45000 / 100} via payment_link`);

  // ---------------------------------------------------------------------------
  // 13. METRICS UPDATE
  // ---------------------------------------------------------------------------
  console.log('Step 13: Authoritative Metrics Update...');
  const updatedMetrics = db.getMetrics(wsId);
  assert.strictEqual(updatedMetrics.revenue_recovered_cents, 45000, 'Metrics recovered cents updated from backend');
  assert.strictEqual(updatedMetrics.revenue_at_risk_cents, 0, 'Metrics revenue at risk cleared');
  assert.strictEqual(updatedMetrics.recovery_rate_percentage, 100, 'Recovery rate is 100%');
  console.log(`  ✓ Metrics verified: Recovered=$${updatedMetrics.revenue_recovered_cents / 100}, AtRisk=$${updatedMetrics.revenue_at_risk_cents / 100}, Rate=${updatedMetrics.recovery_rate_percentage}%`);

  // ---------------------------------------------------------------------------
  // REAL DATA VALIDATION (PHASE 4 AUDIT)
  // ---------------------------------------------------------------------------
  console.log('\n--- Real Data Validation Audit ---');
  // 1. Revenue Recovered is derived from backend records:
  assert.strictEqual(typeof updatedMetrics.revenue_recovered_cents, 'number');
  assert.strictEqual(updatedMetrics.revenue_recovered_cents, 45000);

  // 2. Revenue At Risk is derived from actual failure records:
  assert.strictEqual(typeof updatedMetrics.revenue_at_risk_cents, 'number');
  assert.strictEqual(updatedMetrics.revenue_at_risk_cents, 0);

  // 3. Recovery counts:
  const wsOpps = db.getOpportunities(wsId);
  const recoveredCount = wsOpps.filter((o) => o.status === 'recovered').length;
  assert.strictEqual(recoveredCount, 1);

  // 4. Success Rates:
  assert.strictEqual(updatedMetrics.recovery_rate_percentage, 100);

  // 5. Customer counts:
  const custs = db.getCustomers(wsId);
  assert.strictEqual(custs.length, 1);
  assert.strictEqual(custs[0].name, 'TechCorp Cloud');

  console.log('  ✓ All metrics derived from authoritative backend records');
  console.log('  ✓ Zero synthetic or hardcoded fallback metrics');

  console.log('\n================================================================');
  console.log('PRODUCTION HARDENING 13-STEP E2E AUDIT PASSED (100%)');
  console.log('================================================================');
}

runProductionHardeningValidation().catch((err) => {
  console.error('❌ Hardening test failed:', err);
  process.exit(1);
});
