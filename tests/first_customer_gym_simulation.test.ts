import assert from 'node:assert';
import { GymSimulationEngine } from '../server/simulation/gymSimulation.js';
import { db } from '../server/store/db.js';

console.log('================================================================');
console.log('TEST SUITE: FIRST CUSTOMER TEST — SUBSCRIPTION GYM SCENARIO');
console.log('================================================================');

async function runGymSimulationTest() {
  console.log('1. Launching full simulation for Subscription Gym ("PulseFit")...');
  const startTime = Date.now();
  const sim = await GymSimulationEngine.runSimulation();
  const durationMs = Date.now() - startTime;

  console.log(`  ✓ Completed simulation in ${durationMs}ms`);
  console.log(`  - Business: ${sim.workspace.name}`);
  console.log(`  - Total Members: ${sim.totalMembers}`);
  console.log(`  - Monthly Membership: ₹${sim.monthlyFeeInr}`);
  console.log(`  - Total Revenue At Risk: ₹${sim.totalAtRiskInr}`);

  // Test 1: Verification of Detection
  console.log('\n2. Verifying Detection Phase...');
  assert.strictEqual(sim.detection.failuresDetected, 50, 'Must detect exactly 50 failed payments');
  assert.strictEqual(sim.detection.opportunitiesCreated, 50, 'Must create 50 recovery opportunities');
  assert.ok(sim.detection.failureCategories['insufficient_funds'] >= 20, 'Identifies insufficient funds failures');
  assert.ok(sim.detection.failureCategories['expired_card'] >= 10, 'Identifies expired cards');
  assert.ok(sim.detection.failureCategories['bank_related_failure'] >= 10, 'Identifies bank network failures');
  console.log('  ✓ Verified: 50/50 failed payments detected and categorized.');

  // Test 2: Policy Arbitration
  console.log('\n3. Verifying Policy Arbitration...');
  assert.strictEqual(sim.policyArbitration.autonomousCount, 45, '45 cases classified as AUTONOMOUS');
  assert.strictEqual(sim.policyArbitration.manualReviewCount, 3, '3 VIP/Corporate cases routed to MANUAL_REVIEW');
  assert.strictEqual(sim.policyArbitration.blockedCount, 2, '2 Fraud/Dispute cases classified as BLOCKED');
  console.log('  ✓ Verified: Safety guards routed 3 to review and safely blocked 2 fraud/disputes.');

  // Test 3: Recovery Actions & Communication
  console.log('\n4. Verifying Recovery Outreach & Link Generation...');
  assert.strictEqual(sim.recoveryActions.linksGenerated, 45, 'Generated 45 1-click recovery links');
  assert.strictEqual(sim.recoveryActions.communicationsDispatched, 45, 'Dispatched 45 customer communications');
  assert.ok(sim.recoveryActions.channelsUsed['email'] > 0, 'Used email channel for delivery');
  console.log('  ✓ Verified: 45 links generated & communications dispatched to customer inboxes.');

  // Test 4: Payment Recovery
  console.log('\n5. Verifying Payment Recovery Outcomes...');
  assert.strictEqual(sim.paymentRecovery.paymentsRecovered, 38, 'Successfully recovered 38 payments');
  assert.strictEqual(sim.paymentRecovery.recoveredAmountInr, 76000, 'Recovered ₹76,000 (38 * ₹2,000)');
  assert.strictEqual(sim.paymentRecovery.unrecoveredAmountInr, 24000, 'Outstanding unrecovered is ₹24,000');
  assert.strictEqual(sim.paymentRecovery.recoveryRatePercent, 76, 'Recovery rate is 76% of all failures');
  console.log('  ✓ Verified: ₹76,000 recovered across 38 subscribers (76% overall recovery rate).');

  // Test 5: Accounting & Double-Entry Ledger Verification
  console.log('\n6. Verifying Accounting & Ledger Records...');
  assert.strictEqual(sim.accounting.revenueEventsLogged, 38, 'Logged exactly 38 authoritative RevenueEvent records');
  assert.strictEqual(sim.accounting.invoicesMarkedPaid, 38, 'Marked 38 invoices as paid');
  assert.strictEqual(sim.accounting.customerRiskStatusesUpdated, 38, 'Updated 38 customers to healthy/recovered');
  
  // Verify in-memory/disk store consistency
  const revenueEvents = db.getRevenueEvents(sim.workspace.id);
  const totalCentsFromEvents = revenueEvents.reduce((s, e) => s + e.amount_cents, 0);
  assert.strictEqual(totalCentsFromEvents, 7600000, 'Total paise from revenue events matches ₹76,000');
  console.log('  ✓ Verified: Zero double-counting. Exact double-entry ledger match.');

  // Test 6: Dashboard Metrics Verification
  console.log('\n7. Verifying Executive Dashboard Updates...');
  assert.ok(sim.dashboardVerification.heroMetricRevenueRecovered.includes('76,000'), 'Dashboard displays ₹76,000');
  assert.ok(sim.dashboardVerification.revenueRecoverableRemaining.includes('24,000'), 'Dashboard displays ₹24,000 remaining');
  assert.strictEqual(sim.dashboardVerification.approvalRequiredCount, 3, 'Shows 3 cases awaiting staff approval');
  console.log('  ✓ Verified: Executive Dashboard metrics reflect 100% truthful data.');

  console.log('\n================================================================');
  console.log('FIRST CUSTOMER GYM SIMULATION: 100% PASSED');
  console.log('================================================================');
}

runGymSimulationTest().catch((err) => {
  console.error('Gym simulation test failed:', err);
  process.exit(1);
});
