import assert from 'node:assert';
import { db } from '../server/store/db.js';
import { CustomerHealthEngine } from '../server/intelligence/customerHealthEngine.js';
import { ExpansionPlaybookEngine } from '../server/intelligence/expansionPlaybookEngine.js';
import { RevenueOrchestrator } from '../server/intelligence/revenueOrchestrator.js';
import { Customer, Subscription, Invoice } from '../src/types/index.js';

console.log('================================================================');
console.log('TEST SUITE: REVENUE OPERATING SYSTEM V2 — BILLION DOLLAR EXECUTION');
console.log('================================================================');

async function runRevenueOperatingSystemV2Tests() {
  // Disable disk persistence during isolated test execution
  db.setPersistenceEnabled(false);

  // -------------------------------------------------------------
  // TEST 1: MULTI-TENANT ISOLATION
  // -------------------------------------------------------------
  console.log('\n1. Testing Multi-Tenant Isolation across Workspaces...');
  const wsA = db.createWorkspace('Tenant Alpha SaaS', 'saas', 'USD', false);
  const wsB = db.createWorkspace('Tenant Beta Gym', 'fitness', 'INR', false);

  assert.notStrictEqual(wsA.id, wsB.id, 'Workspace IDs must be distinct');

  // Customer A in Workspace A
  const custA: Customer = {
    id: `cust_a_${Date.now()}`,
    workspace_id: wsA.id,
    name: 'Alice Johnson',
    email: 'alice@alpha.io',
    currency: 'USD',
    country: 'US',
    provider_type: 'stripe',
    provider_customer_id: 'cus_stripe_a',
    current_risk_status: 'healthy',
    lifetime_value_cents: 120000, // $1,200
    total_recovered_cents: 0,
    created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  } as any;
  db.addCustomer(custA);

  // Customer B in Workspace B
  const custB: Customer = {
    id: `cust_b_${Date.now()}`,
    workspace_id: wsB.id,
    name: 'Rohan Verma',
    email: 'rohan@beta.in',
    currency: 'INR',
    country: 'IN',
    provider_type: 'razorpay',
    provider_customer_id: 'cust_rzp_b',
    current_risk_status: 'healthy',
    lifetime_value_cents: 2400000, // ₹24,000
    total_recovered_cents: 0,
    created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  } as any;
  db.addCustomer(custB);

  // Query health for Workspace A
  const healthProfilesA = CustomerHealthEngine.evaluateWorkspace(wsA.id);
  assert.strictEqual(healthProfilesA.length, 1, 'Workspace A must only contain 1 customer');
  assert.strictEqual(healthProfilesA[0].customerId, custA.id, 'Workspace A customer must be Alice');
  assert.strictEqual(healthProfilesA[0].workspaceId, wsA.id, 'Workspace A customer must belong to Workspace A');

  // Query health for Workspace B
  const healthProfilesB = CustomerHealthEngine.evaluateWorkspace(wsB.id);
  assert.strictEqual(healthProfilesB.length, 1, 'Workspace B must only contain 1 customer');
  assert.strictEqual(healthProfilesB[0].customerId, custB.id, 'Workspace B customer must be Rohan');
  assert.strictEqual(healthProfilesB[0].workspaceId, wsB.id, 'Workspace B customer must belong to Workspace B');

  // Verify cross-tenant isolation: querying Cust B under Workspace A returns null
  const crossQuery = CustomerHealthEngine.evaluateCustomer(wsA.id, custB.id);
  assert.strictEqual(crossQuery, null, 'Cross-tenant customer query must return null');
  console.log('  ✓ Verified: Strict multi-tenant isolation enforced. Zero cross-workspace data leakage.');

  // -------------------------------------------------------------
  // TEST 2: CUSTOMER HEALTH ENGINE — DETERMINISTIC OUTPUTS
  // -------------------------------------------------------------
  console.log('\n2. Testing Customer Health Engine Deterministic Classifications...');

  // Setup healthy recurring history for Alice in wsA
  db.addSubscription({
    id: `sub_a_${Date.now()}`,
    workspace_id: wsA.id,
    customer_id: custA.id,
    provider_type: 'stripe',
    plan_name: 'Pro Monthly',
    amount_cents: 10000, // $100/mo
    currency: 'USD',
    billing_interval: 'monthly',
    status: 'active',
    created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // Add 3 paid invoices
  for (let i = 1; i <= 3; i++) {
    db.addInvoice({
      id: `inv_a_${i}_${Date.now()}`,
      workspace_id: wsA.id,
      customer_id: custA.id,
      amount_cents: 10000,
      currency: 'USD',
      status: 'paid',
      created_at: new Date(Date.now() - (90 - i * 30) * 24 * 60 * 60 * 1000).toISOString(),
    } as any);
  }

  const healthAlice = CustomerHealthEngine.evaluateCustomer(wsA.id, custA.id)!;
  assert.strictEqual(healthAlice.status, 'HEALTHY', 'Alice must be HEALTHY');
  assert.strictEqual(healthAlice.paymentReliabilityPercent, 100, 'Alice must have 100% reliability');
  assert.strictEqual(healthAlice.failedPaymentFrequency, 0, 'Alice has 0 recent failures');
  assert.strictEqual(healthAlice.cancellationRisk, 'low', 'Alice has low cancellation risk');
  assert.strictEqual(healthAlice.expansionLikelihood, 'high', 'Alice has high expansion likelihood');
  assert.ok(healthAlice.evidence.some(e => e.includes('consecutive on-time payment')), 'Evidence shows on-time payment');
  console.log('  ✓ Verified: HEALTHY status deterministically derived from verified payment history.');

  // Create a distressed customer in wsB (2 consecutive failures)
  const custDistressed: Customer = {
    id: `cust_distressed_${Date.now()}`,
    workspace_id: wsB.id,
    name: 'Suresh Patil',
    email: 'suresh@distressed.in',
    currency: 'INR',
    country: 'IN',
    provider_type: 'razorpay',
    provider_customer_id: 'cust_rzp_dist',
    current_risk_status: 'at_risk',
    lifetime_value_cents: 2400000,
    total_recovered_cents: 0,
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  } as any;
  db.addCustomer(custDistressed);

  db.addSubscription({
    id: `sub_dist_${Date.now()}`,
    workspace_id: wsB.id,
    customer_id: custDistressed.id,
    provider_type: 'razorpay',
    plan_name: 'Gym Standard',
    amount_cents: 200000, // ₹2,000
    currency: 'INR',
    billing_interval: 'monthly',
    status: 'past_due',
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // Ingest failed invoice and opportunity
  const invoiceRes = db.createManualFailedInvoice(wsB.id, {
    customerId: custDistressed.id,
    amountCents: 200000,
    currency: 'INR',
    providerFailureCode: 'INSUFFICIENT_FUNDS',
    rawErrorMessage: 'Insufficient funds in account',
    failureCategory: 'insufficient_funds',
  });

  const healthDistressed = CustomerHealthEngine.evaluateCustomer(wsB.id, custDistressed.id)!;
  assert.strictEqual(healthDistressed.status, 'AT RISK', 'Distressed customer must be AT RISK');
  assert.strictEqual(healthDistressed.cancellationRisk, 'high', 'Distressed customer has high cancellation risk');
  assert.strictEqual(healthDistressed.subscriptionStability, 'past_due', 'Subscription is past_due');
  assert.strictEqual(healthDistressed.revenueAtRiskCents, 200000, 'Revenue at risk is ₹2,000 (200,000 paise)');
  console.log('  ✓ Verified: AT RISK status deterministically derived from past_due status and active failure.');

  // Test CRITICAL classification (disputed payment)
  invoiceRes.opportunity.has_active_dispute = true;
  invoiceRes.opportunity.dispute_status = 'active';
  const healthCritical = CustomerHealthEngine.evaluateCustomer(wsB.id, custDistressed.id)!;
  assert.strictEqual(healthCritical.status, 'CRITICAL', 'Disputed customer must be CRITICAL');
  assert.strictEqual(healthCritical.cancellationRisk, 'imminent', 'Cancellation risk is imminent');
  assert.ok(healthCritical.evidence.some(e => e.includes('Active payment dispute')), 'Dispute evidence recorded');
  console.log('  ✓ Verified: CRITICAL status deterministically derived when dispute is active.');

  // -------------------------------------------------------------
  // TEST 3: EXPANSION PLAYBOOK ENGINE
  // -------------------------------------------------------------
  console.log('\n3. Testing Expansion Playbook Engine...');
  const expansionOppsA = ExpansionPlaybookEngine.scanWorkspace(wsA.id);
  assert.ok(expansionOppsA.length >= 1, 'Should detect at least 1 expansion opportunity for Alice');

  const annualPlaybook = expansionOppsA.find(o => o.playbookType === 'annual_conversion');
  assert.ok(annualPlaybook, 'Must identify Annual Conversion playbook');
  assert.strictEqual(annualPlaybook.expectedExpansionValueCents, 100000, 'Expected expansion is 10x monthly fee ($1,000)');
  assert.strictEqual(annualPlaybook.status, 'action_ready', 'Status is action_ready');
  assert.ok(annualPlaybook.supportingEvidence.length >= 2, 'Has verified supporting evidence');

  // Test executing expansion action
  const execRes = ExpansionPlaybookEngine.executeAction(wsA.id, annualPlaybook.id);
  assert.strictEqual(execRes.success, true, 'Execution must succeed');
  assert.strictEqual(execRes.opportunity?.status, 'converted', 'Opportunity transitioned to converted');
  const rescanned = ExpansionPlaybookEngine.scanWorkspace(wsA.id).find(o => o.id === annualPlaybook.id);
  assert.strictEqual(rescanned?.status, 'converted', 'Rescanned opportunity remains converted');
  console.log('  ✓ Verified: Annual Prepayment expansion playbook generated and executed with exact math.');

  // -------------------------------------------------------------
  // TEST 4: AUTONOMOUS REVENUE ORCHESTRATOR & CEO DAILY BRIEF
  // -------------------------------------------------------------
  console.log('\n4. Testing Revenue Orchestrator & CEO Daily Brief...');
  // Settle a payment in wsB to verify recovered revenue accounting
  db.settleRecoveryPayment(
    invoiceRes.opportunity.id,
    {
      amountCents: 200000,
      providerPaymentId: `pay_test_${Date.now()}`,
      method: 'smart_retry',
    },
    wsB.id
  );

  const orchestratorB = RevenueOrchestrator.getOrchestratorState(wsB.id);
  assert.strictEqual(orchestratorB.workspaceId, wsB.id, 'Orchestrator state scoped to wsB');
  assert.strictEqual(orchestratorB.summary.totalRecoveredCents, 200000, 'Total recovered is ₹2,000 (200,000 paise)');
  assert.ok(orchestratorB.summary.totalProtectedRevenueCents >= 200000, 'Protected revenue reflects customer LTV');

  // Verify CEO Daily Brief format and readability (<30 seconds)
  const brief = orchestratorB.ceoDailyBrief;
  assert.ok(brief.statement.includes('Today ReviveOS recovered'), 'Brief contains recovered revenue statement');
  assert.ok(brief.recoveredTodayFormatted.includes('2,000'), 'Brief displays ₹2,000 recovered');
  assert.ok(brief.statement.length < 350, 'Brief is punchy and easily readable in under 30 seconds');
  console.log(`  ✓ Executive CEO Daily Brief Verified: "${brief.statement}"`);

  // Test Orchestrator Action Execution
  const actionRes = await RevenueOrchestrator.executeAction(wsB.id, `act_ret_${custDistressed.id}`);
  assert.strictEqual(actionRes.success, true, 'Retention action execution must succeed');
  console.log('  ✓ Verified: Revenue Orchestrator executed retention intervention deterministically.');

  console.log('\n================================================================');
  console.log('ALL REVENUE OPERATING SYSTEM V2 TESTS PASSED (100%)');
  console.log('================================================================');
}

runRevenueOperatingSystemV2Tests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
