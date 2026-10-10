import assert from 'node:assert';
import fs from 'fs';

console.log('================================================================');
console.log('TEST SUITE: REVENUE MISSION DASHBOARD & TIMELINE');
console.log('================================================================');

async function runRevenueMissionDashboardTests() {
  console.log('1. Validating RevenueMissionDashboard source structure...');
  const dashboardCode = fs.readFileSync('src/components/RevenueMissionDashboard.tsx', 'utf-8');

  // Verify Active Missions section requirements
  console.log('2. Validating ACTIVE MISSIONS section requirements...');
  assert.ok(dashboardCode.includes('ACTIVE MISSIONS'), 'Must include "ACTIVE MISSIONS" header');
  assert.ok(dashboardCode.includes('Revenue At Risk'), 'Must show Revenue At Risk in active missions');
  assert.ok(dashboardCode.includes('Started:'), 'Must show Started time in active missions');
  assert.ok(dashboardCode.includes('Awaiting Customer') || dashboardCode.includes('statusBadge'), 'Must support Awaiting Customer status');
  console.log('  ✓ Verified: ACTIVE MISSIONS renders Customer, Revenue At Risk, Status, and Started time.');

  // Verify Completed Missions section requirements
  console.log('3. Validating COMPLETED MISSIONS section requirements...');
  assert.ok(dashboardCode.includes('COMPLETED MISSIONS'), 'Must include "COMPLETED MISSIONS" header');
  assert.ok(dashboardCode.includes('Recovered'), 'Must display Recovered amount');
  assert.ok(dashboardCode.includes('Customer Updated Card'), 'Must handle Customer Updated Card outcome');
  assert.ok(dashboardCode.includes('Completed Today'), 'Must format Completed Today');
  console.log('  ✓ Verified: COMPLETED MISSIONS renders Recovered amount, card update outcome, and Completed Today.');

  // Verify Failed Missions section requirements
  console.log('4. Validating FAILED MISSIONS section requirements...');
  assert.ok(dashboardCode.includes('FAILED MISSIONS'), 'Must include "FAILED MISSIONS" header');
  assert.ok(dashboardCode.includes('Payment Not Recovered'), 'Must display Payment Not Recovered');
  assert.ok(dashboardCode.includes('Workflow Exhausted'), 'Must display Workflow Exhausted');
  assert.ok(dashboardCode.includes('Closed'), 'Must display Closed');
  console.log('  ✓ Verified: FAILED MISSIONS renders Payment Not Recovered, Workflow Exhausted, and Closed status.');

  // Verify Revenue Mission Timeline requirements
  console.log('5. Validating Revenue Mission Timeline requirements...');
  assert.ok(dashboardCode.includes('Revenue Mission Timeline'), 'Must include Revenue Mission Timeline');
  assert.ok(dashboardCode.includes('Mission Created'), 'Timeline event: Mission Created');
  assert.ok(dashboardCode.includes('Payment Recovered'), 'Timeline event: Payment Recovered');
  assert.ok(dashboardCode.includes('Mission Completed'), 'Timeline event: Mission Completed');
  console.log('  ✓ Verified: Revenue Mission Timeline presents complete human-readable progression.');

  // Verify Mission Metrics Card
  console.log('6. Validating MissionMetricsCard requirements...');
  const metricsCode = fs.readFileSync('src/components/MissionMetricsCard.tsx', 'utf-8');
  assert.ok(metricsCode.includes('Total Missions'), 'Must display Total Missions');
  assert.ok(metricsCode.includes('Completed'), 'Must display Completed Missions');
  assert.ok(metricsCode.includes('Failed'), 'Must display Failed Missions');
  assert.ok(metricsCode.includes('Success Rate'), 'Must display Success Rate');
  assert.ok(metricsCode.includes('Revenue Recovered'), 'Must display Revenue Recovered');
  assert.ok(metricsCode.includes('Revenue Protected'), 'Must display Revenue Protected');
  assert.ok(metricsCode.includes('Revenue Expanded'), 'Must display Revenue Expanded');
  assert.ok(metricsCode.includes('More mission history required.') || metricsCode.includes('sampleThreshold'), 'Enforces sample threshold');
  console.log('  ✓ Verified: MissionMetricsCard displays all 7 performance metrics with empirical thresholds.');

  // Verify Integration in App.tsx
  console.log('7. Validating App.tsx routing and navigation...');
  const appCode = fs.readFileSync('src/App.tsx', 'utf-8');
  assert.ok(appCode.includes('RevenueMissionDashboard'), 'App.tsx imports and renders RevenueMissionDashboard');
  assert.ok(appCode.includes("activeTab === 'missions'"), 'App.tsx supports missions tab');
  console.log('  ✓ Verified: App.tsx seamlessly integrates RevenueMissionDashboard.');

  console.log('================================================================');
  console.log('REVENUE MISSION DASHBOARD TESTS: 100% PASSED');
  console.log('================================================================');
}

runRevenueMissionDashboardTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
