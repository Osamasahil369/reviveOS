import assert from 'node:assert';
import fs from 'fs';
import { db } from '../server/store/db.js';
import { RevenueMissionEngine } from '../server/intelligence/revenueMissionEngine.js';

console.log('================================================================');
console.log('TEST SUITE: REVENUE OPERATIONS AGENT');
console.log('================================================================');

async function runRevenueOperationsAgentTests() {
  const wsTest = 'ws_agent_ops_test';

  // 1. Validate Component Source
  console.log('1. Validating RevenueOperationsAgent source code...');
  const agentCode = fs.readFileSync('src/components/RevenueOperationsAgent.tsx', 'utf-8');

  assert.ok(agentCode.includes('Revenue Operations Agent'), 'Displays component title');
  assert.ok(agentCode.includes('Today ReviveOS recovered'), 'Includes "Today ReviveOS recovered" pattern');
  assert.ok(agentCode.includes('updated payment methods'), 'Includes "updated payment methods" pattern');
  assert.ok(agentCode.includes('failed payment'), 'Includes "failed payment" pattern');
  assert.ok(agentCode.includes('remain at risk') || agentCode.includes('remains at risk'), 'Includes "remain at risk" pattern');
  assert.ok(agentCode.includes('Next recommended focus:'), 'Includes "Next recommended focus:" callout');
  console.log('  ✓ Verified: RevenueOperationsAgent source includes all required fact summaries and next recommended focus.');

  // 2. Test Engine Output on Real Demo Workspace
  console.log('2. Testing deterministic fact generation on populated workspace...');
  db.loadDemoWorkspace(wsTest, 'Agent Ops Demo SaaS');
  const summary = await RevenueMissionEngine.getRevenueOperationsSummary(wsTest);

  assert.strictEqual(summary.workspaceId, wsTest, 'Workspace ID matches');
  assert.ok(summary.todayRecoveredCents >= 0, 'Today recovered is valid number');
  assert.ok(typeof summary.paymentMethodsUpdatedCount === 'number', 'Card updates count is number');
  assert.ok(typeof summary.failedPaymentsRecoveredCount === 'number', 'Recovered payments count is number');
  assert.ok(typeof summary.customersAtRiskCount === 'number', 'Customers at risk count is number');
  assert.ok(summary.nextRecommendedFocus !== null, 'Identifies next recommended focus');
  assert.ok(summary.factSummaries.length >= 3, 'Produces factual summaries');

  console.log(`  ✓ Fact 1: ${summary.factSummaries[0]}`);
  console.log(`  ✓ Fact 2: ${summary.factSummaries[1]}`);
  console.log(`  ✓ Next Focus: "${summary.nextRecommendedFocus?.title}" (${summary.nextRecommendedFocus?.targetName})`);

  // 3. Test Integration in AutopilotRecoveryCenter
  console.log('3. Validating RevenueOperationsAgent integration in AutopilotRecoveryCenter...');
  const dashboardCode = fs.readFileSync('src/components/AutopilotRecoveryCenter.tsx', 'utf-8');
  assert.ok(dashboardCode.includes('RevenueOperationsAgent'), 'AutopilotRecoveryCenter renders RevenueOperationsAgent');
  console.log('  ✓ Verified: RevenueOperationsAgent embedded directly on executive dashboard.');

  console.log('================================================================');
  console.log('REVENUE OPERATIONS AGENT TESTS: 100% PASSED');
  console.log('================================================================');
}

runRevenueOperationsAgentTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
