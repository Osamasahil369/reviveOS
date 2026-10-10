import assert from 'node:assert';
import { db } from '../server/store/db.js';
import {
  RevenueMissionEngine,
  MIN_MISSION_SAMPLE_THRESHOLD,
} from '../server/intelligence/revenueMissionEngine.js';

console.log('================================================================');
console.log('TEST SUITE: REVENUE MISSION ENGINE & LIFECYCLE');
console.log('================================================================');

async function runRevenueMissionEngineTests() {
  const wsEmpty = 'ws_mission_empty_test';
  const wsPopulated = 'ws_mission_pop_test';

  // 1. Mission Generation on Empty Workspace (Deterministic Zero-Hallucination)
  console.log('1. Testing mission generation on empty workspace...');
  const emptyMissions = await RevenueMissionEngine.generateMissions(wsEmpty);
  assert.strictEqual(emptyMissions.length, 0, 'Empty workspace must generate 0 missions');

  const emptyMetrics = await RevenueMissionEngine.calculateMissionMetrics(wsEmpty);
  assert.strictEqual(emptyMetrics.totalMissions, 0, '0 total missions');
  assert.strictEqual(emptyMetrics.hasSufficientData, false, 'Insufficient data flag true on empty');
  assert.strictEqual(emptyMetrics.successRateFormatted, 'Not enough mission data.');
  console.log('  ✓ Verified: Zero missions and zero fabricated claims on empty workspace.');

  // 2. Populate Workspace and Test Comprehensive Mission Generation
  console.log('2. Testing mission generation on populated workspace...');
  db.loadDemoWorkspace(wsPopulated, 'Mission Test SaaS');
  const missions = await RevenueMissionEngine.generateMissions(wsPopulated);

  assert.ok(missions.length > 0, 'Missions generated from demo workspace');
  console.log(`  ✓ Generated ${missions.length} total revenue missions.`);

  // Verify RECOVERY Missions
  const recoveryMissions = missions.filter((m) => m.missionType === 'RECOVERY');
  assert.ok(recoveryMissions.length > 0, 'Must have RECOVERY missions');
  const sampleRecovery = recoveryMissions[0];
  assert.ok(sampleRecovery.title.startsWith('Recover Payment From') || sampleRecovery.title.includes('Recover'), 'Title matches pattern');
  assert.ok(sampleRecovery.revenueAtRisk > 0, 'Revenue at risk is positive');
  assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(sampleRecovery.priority), 'Valid priority');
  assert.ok(
    ['NEW', 'ACTIVE', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'AWAITING_REVIEW', 'COMPLETED', 'FAILED'].includes(
      sampleRecovery.status
    ),
    'Valid status'
  );
  console.log(`  ✓ Sample RECOVERY Mission: "${sampleRecovery.title}" (${sampleRecovery.status}, Priority: ${sampleRecovery.priority})`);

  // Verify RETENTION Missions
  const retentionMissions = missions.filter((m) => m.missionType === 'RETENTION');
  if (retentionMissions.length > 0) {
    const sampleRetention = retentionMissions[0];
    assert.ok(sampleRetention.title.includes('Prevent Cancellation') || sampleRetention.title.includes('Retain'), 'Title matches retention pattern');
    assert.strictEqual(sampleRetention.missionType, 'RETENTION');
    console.log(`  ✓ Sample RETENTION Mission: "${sampleRetention.title}"`);
  }

  // Verify EXPANSION Missions
  const expansionMissions = missions.filter((m) => m.missionType === 'EXPANSION');
  if (expansionMissions.length > 0) {
    const sampleExpansion = expansionMissions[0];
    assert.ok(sampleExpansion.title.includes('Upgrade') || sampleExpansion.title.includes('Expand'), 'Title matches expansion pattern');
    assert.strictEqual(sampleExpansion.missionType, 'EXPANSION');
    console.log(`  ✓ Sample EXPANSION Mission: "${sampleExpansion.title}"`);
  }

  // 3. Revenue Mission Timeline Validation (Human-readable only)
  console.log('3. Validating Revenue Mission Timeline requirements...');
  const completedMissions = missions.filter((m) => m.status === 'COMPLETED' && m.missionType === 'RECOVERY');
  assert.ok(completedMissions.length > 0, 'Must have completed recovery missions');
  const completedSample = completedMissions[0];

  const timelineTitles = completedSample.timelineEvents.map((e) => e.title);
  assert.ok(timelineTitles.includes('Mission Created'), 'Must include "Mission Created"');
  assert.ok(timelineTitles.includes('Recovery Link Generated'), 'Must include "Recovery Link Generated"');
  assert.ok(timelineTitles.includes('Customer Updated Card'), 'Must include "Customer Updated Card"');
  assert.ok(timelineTitles.includes('Payment Recovered'), 'Must include "Payment Recovered"');
  assert.ok(timelineTitles.includes('Mission Completed'), 'Must include "Mission Completed"');

  // Verify NO technical internal codes are exposed in timeline titles or descriptions
  for (const event of completedSample.timelineEvents) {
    assert.strictEqual(
      event.title.includes('ev_') || event.title.includes('event_code') || event.title.includes('opp_'),
      false,
      `Event title "${event.title}" must not contain internal codes`
    );
    assert.strictEqual(
      event.description.includes('ev_') || event.description.includes('event_code'),
      false,
      `Event description "${event.description}" must not contain internal codes`
    );
  }
  console.log('  ✓ Verified: Revenue Mission Timeline is 100% human-readable with zero technical event codes.');

  // 4. Mission Status Transitions & Lifecycle
  console.log('4. Testing mission status transitions and lifecycle...');
  const activeMission = missions.find((m) => m.status === 'ACTIVE' || m.status === 'AWAITING_REVIEW') || missions[0];
  const initialTimelineCount = activeMission.timelineEvents.length;

  const transitioned = await RevenueMissionEngine.transitionMissionStatus(
    wsPopulated,
    activeMission.id,
    'IN_PROGRESS',
    'Automated retry cycle initiated'
  );
  assert.strictEqual(transitioned.status, 'IN_PROGRESS', 'Status updated to IN_PROGRESS');
  assert.strictEqual(transitioned.timelineEvents.length, initialTimelineCount + 1, 'Appended new timeline event');

  // Mark Completed
  const completed = await RevenueMissionEngine.transitionMissionStatus(
    wsPopulated,
    activeMission.id,
    'COMPLETED',
    'Customer cleared outstanding balance'
  );
  assert.strictEqual(completed.status, 'COMPLETED', 'Status updated to COMPLETED');
  assert.ok(completed.completedAt !== null, 'completedAt timestamp set');
  console.log('  ✓ Verified: Mission lifecycle transitions and audit trail updates work cleanly.');

  // 5. Action Execution
  console.log('5. Testing mission action execution...');
  const actionTarget = missions.find((m) => m.status === 'NEW' || m.status === 'ACTIVE') || missions[1];
  const executed = await RevenueMissionEngine.executeMissionAction(
    wsPopulated,
    actionTarget.id,
    'Send Payment Link'
  );
  assert.strictEqual(executed.status, 'AWAITING_CUSTOMER', 'Executing send link transitions to AWAITING_CUSTOMER');
  assert.ok(executed.completedActions.includes('Send Payment Link'), 'Action recorded in completedActions');
  console.log('  ✓ Verified: Executing action transitions mission state and records action.');

  // 6. Mission Performance Analytics & Thresholds
  console.log('6. Testing mission performance metrics & revenue aggregation...');
  const metrics = await RevenueMissionEngine.calculateMissionMetrics(wsPopulated);
  assert.ok(metrics.totalMissions >= 500, 'Hundreds of missions generated in demo');
  assert.ok(metrics.completedMissions > 0, 'Completed missions counted');
  assert.ok(metrics.hasSufficientData, 'Sample threshold satisfied');
  assert.ok(metrics.successRateFormatted.includes('%'), 'Success rate formatted as percentage');
  assert.ok(metrics.revenueRecovered > 0, 'Revenue recovered aggregated');
  console.log(`  ✓ Performance: Total=${metrics.totalMissions}, Completed=${metrics.completedMissions}, Rate=${metrics.successRateFormatted}`);
  console.log(`  ✓ Revenue Aggregation: Recovered=$${Math.round(metrics.revenueRecovered / 100).toLocaleString()}`);

  // 7. Multi-Tenant Isolation
  console.log('7. Testing multi-tenant isolation...');
  const isolatedMissions = await RevenueMissionEngine.generateMissions('ws_isolated_other_org');
  assert.strictEqual(isolatedMissions.length, 0, 'Other workspace cannot see demo missions');
  const isolatedGet = await RevenueMissionEngine.getMissionById('ws_isolated_other_org', activeMission.id);
  assert.strictEqual(isolatedGet, null, 'Cannot access mission across workspace boundary');
  console.log('  ✓ Multi-tenant isolation strictly verified.');

  console.log('================================================================');
  console.log('REVENUE MISSION ENGINE TESTS: 100% PASSED');
  console.log('================================================================');
}

runRevenueMissionEngineTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
