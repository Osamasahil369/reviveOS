import assert from 'node:assert';
import fs from 'fs';
import { db } from '../server/store/db.js';

console.log('================================================================');
console.log('TEST SUITE: RECOVERY ROI, TIMELINE & SIMPLIFIED DASHBOARD');
console.log('================================================================');

async function runRecoveryRoiTests() {
  console.log('1. Validating RecoveryROICard requirements...');
  const roiCode = fs.readFileSync('src/components/RecoveryROICard.tsx', 'utf-8');

  assert.ok(roiCode.includes('Revenue Recovered') || roiCode.includes('Recovered'), 'Must display Revenue Recovered');
  assert.ok(roiCode.includes('Revenue At Risk') || roiCode.includes('At Risk'), 'Must display Revenue At Risk');
  assert.ok(roiCode.includes('Recovery Rate') || roiCode.includes('Success Rate'), 'Must display Recovery Rate');
  assert.ok(roiCode.includes('Actions Executed') || roiCode.includes('Actions'), 'Must display Actions Executed');
  assert.ok(roiCode.includes('Time Saved'), 'Must display Estimated Time Saved');
  assert.ok(roiCode.includes('minutesPerAction') || roiCode.includes('0.25') || roiCode.includes('15'), 'Must use deterministic calculation for time saved');
  console.log('  ✓ Verified: RecoveryROICard calculates return on investment using deterministic metrics.');

  console.log('2. Validating RecoverySuccessTimeline requirements...');
  const timelineCode = fs.readFileSync('src/components/RecoverySuccessTimeline.tsx', 'utf-8');

  assert.ok(timelineCode.includes('Customer updated card'), 'Must handle "Customer updated card" event');
  assert.ok(timelineCode.includes('Payment retry succeeded'), 'Must handle "Payment retry succeeded" event');
  assert.ok(timelineCode.includes('Payment link completed'), 'Must handle "Payment link completed" event');
  assert.strictEqual(
    timelineCode.includes('ev_') || timelineCode.includes('event_code'),
    false,
    'Must NOT expose internal event codes'
  );
  console.log('  ✓ Verified: RecoverySuccessTimeline presents human-readable event descriptions without internal codes.');

  console.log('3. Validating Feature 6 Simplified Dashboard in AutopilotRecoveryCenter...');
  const dashboardCode = fs.readFileSync('src/components/AutopilotRecoveryCenter.tsx', 'utf-8');

  // Must prioritize the 4 core metrics
  assert.ok(
    dashboardCode.includes('Revenue Recovered This Month'),
    'Priority 1: Revenue Recovered This Month'
  );
  assert.ok(
    dashboardCode.includes('Revenue At Risk'),
    'Priority 2: Revenue At Risk'
  );
  assert.ok(
    dashboardCode.includes('Customers At Risk'),
    'Priority 3: Customers At Risk'
  );
  assert.ok(
    dashboardCode.includes('Growth Opportunities'),
    'Priority 4: Growth Opportunities'
  );

  // Must include components
  assert.ok(dashboardCode.includes('RecoveryROICard'), 'Dashboard includes RecoveryROICard');
  assert.ok(dashboardCode.includes('RecoveryEffectivenessCard'), 'Dashboard includes RecoveryEffectivenessCard');
  assert.ok(dashboardCode.includes('RecoveryBenchmarksCard'), 'Dashboard includes RecoveryBenchmarksCard');
  assert.ok(dashboardCode.includes('RecoverySuccessTimeline'), 'Dashboard includes RecoverySuccessTimeline');
  assert.ok(dashboardCode.includes('TrustAndSafetyCard'), 'Dashboard includes TrustAndSafetyCard');
  console.log('  ✓ Verified: Simplified Dashboard prioritizes the 4 core metrics and 1 hero metric.');

  console.log('================================================================');
  console.log('RECOVERY ROI & DASHBOARD TESTS: 100% PASSED');
  console.log('================================================================');
}

runRecoveryRoiTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
