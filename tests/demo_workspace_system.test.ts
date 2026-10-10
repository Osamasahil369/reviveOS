import assert from 'node:assert';
import { db } from '../server/store/db.js';
import { generateCompleteDemoWorkspace } from '../server/store/demo_generator.js';

console.log('================================================================');
console.log('REVIVEOS DEMO WORKSPACE SYSTEM TEST');
console.log('================================================================');

async function runDemoWorkspaceTest() {
  const wsId = 'ws_demo_validation_test';
  const wsName = 'Acme Cloud Platform (Demo Test)';

  console.log('Step 1: Generating and Loading Demo Workspace...');
  const result = db.loadDemoWorkspace(wsId, wsName);

  // 1. Verify Customers
  console.log('Step 2: Validating 1,000 Customer Accounts...');
  assert.strictEqual(result.totalCustomers, 1000, 'Must generate exactly 1,000 customers');
  const customers = db.getCustomers(wsId);
  assert.strictEqual(customers.length, 1000, 'Workspace customers count matches 1,000');
  console.log(`  ✓ 1,000 customers verified (Sample: ${customers[0].name}, ${customers[0].email})`);

  // 2. Verify Failed Payments
  console.log('Step 3: Validating 2,000 Failed Payments...');
  assert.strictEqual(result.totalFailures, 2000, 'Must generate exactly 2,000 failed payments');
  const failures = db.getPaymentFailures(wsId);
  assert.strictEqual(failures.length, 2000, 'Workspace payment failures count matches 2,000');
  console.log(`  ✓ 2,000 failed payments verified (Categories: insufficient_funds, expired_card, bank_decline, etc.)`);

  // 3. Verify Successful Recoveries
  console.log('Step 4: Validating 500 Successful Recoveries...');
  assert.strictEqual(result.totalRecoveries, 500, 'Must generate exactly 500 successful recoveries');
  const revenueEvents = db.getRevenueEvents(wsId);
  assert.strictEqual(revenueEvents.length, 500, 'Workspace revenue recovered events match 500');
  console.log(`  ✓ 500 successful recoveries verified (Sample: $${revenueEvents[0].amount_cents / 100} via ${revenueEvents[0].recovered_via})`);

  // 4. Verify VIP Customers
  console.log('Step 5: Validating 100 VIP Customer Accounts...');
  assert.strictEqual(result.totalVips, 100, 'Must generate exactly 100 VIP accounts');
  const vipCustomers = customers.filter((c) => c.is_vip);
  assert.strictEqual(vipCustomers.length, 100, 'VIP customers count matches 100');
  console.log(`  ✓ 100 VIP customers verified`);

  // 5. Verify Enterprise Accounts
  console.log('Step 6: Validating 50 Enterprise Accounts...');
  assert.strictEqual(result.totalEnterprise, 50, 'Must generate exactly 50 enterprise accounts');
  const enterpriseCustomers = customers.filter((c) => c.is_enterprise);
  assert.strictEqual(enterpriseCustomers.length, 50, 'Enterprise customers count matches 50');
  console.log(`  ✓ 50 Enterprise accounts verified`);

  // 6. Verify Fraud Cases
  console.log('Step 7: Validating 20 Fraud Cases...');
  assert.strictEqual(result.totalFraud, 20, 'Must generate exactly 20 fraud cases');
  const opportunities = db.getOpportunities(wsId);
  const fraudOpps = opportunities.filter((o) => o.is_fraud);
  assert.strictEqual(fraudOpps.length, 20, 'Fraud opportunities match 20');
  console.log(`  ✓ 20 Fraud cases verified`);

  // 7. Verify Chargebacks
  console.log('Step 8: Validating 20 Chargebacks / Active Disputes...');
  assert.strictEqual(result.totalChargebacks, 20, 'Must generate exactly 20 chargeback cases');
  const chargebackOpps = opportunities.filter((o) => o.is_chargeback || o.has_active_dispute);
  assert.strictEqual(chargebackOpps.length, 20, 'Chargeback opportunities match 20');
  console.log(`  ✓ 20 Chargebacks verified`);

  // 8. Verify Executive Metrics Calculation
  console.log('Step 9: Validating Authoritative Dashboard Metrics...');
  const metrics = db.getMetrics(wsId);
  assert.ok(metrics.revenue_recovered_cents > 0, 'Metrics revenue recovered > 0');
  assert.ok(metrics.revenue_at_risk_cents > 0, 'Metrics revenue at risk > 0');
  assert.ok(metrics.recovery_rate_percentage > 0, 'Metrics recovery rate > 0');
  console.log(`  ✓ Authoritative Metrics: Recovered=$${metrics.revenue_recovered_cents / 100}, AtRisk=$${metrics.revenue_at_risk_cents / 100}, Rate=${metrics.recovery_rate_percentage}%`);

  // 9. Verify Autonomous Recovery Workflows
  console.log('Step 10: Validating Recovery Workflows & Policy Audits...');
  const workflows = db.getAutonomousWorkflows(wsId);
  assert.ok(workflows.length > 0, 'Autonomous workflows generated');
  const policyAudits = db.getPolicyAuditLogs(wsId);
  assert.ok(policyAudits.length > 0, 'Policy audit records generated');
  console.log(`  ✓ Workflows (${workflows.length}) and Policy Audits (${policyAudits.length}) verified`);

  console.log('================================================================');
  console.log('DEMO WORKSPACE SYSTEM TEST: 100% PASSED');
  console.log('================================================================');
}

runDemoWorkspaceTest().catch((err) => {
  console.error('Demo Workspace test failed:', err);
  process.exit(1);
});
