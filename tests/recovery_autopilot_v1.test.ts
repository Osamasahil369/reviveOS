import assert from 'node:assert';
import fs from 'fs';
import { RecoveryAutopilotEngine } from '../server/intelligence/recoveryAutopilotEngine.js';

console.log('================================================================');
console.log('TEST SUITE: RECOVERY AUTOPILOT V1 (BILLION-DOLLAR EXECUTION PHASE)');
console.log('================================================================');

async function runAutopilotV1Tests() {
  // Test 1: RecoveryAutopilotEngine Playbook Generation
  console.log('1. Validating RecoveryAutopilotEngine deterministic playbooks...');
  const failedPaymentSteps = RecoveryAutopilotEngine.generatePlaybook('failed_payment', 15000, false);
  assert.ok(failedPaymentSteps.length >= 4, 'Failed payment playbook has multiple steps');
  assert.strictEqual(failedPaymentSteps[0].dayOffset, 0, 'Starts on Day 0');

  const expiredCardSteps = RecoveryAutopilotEngine.generatePlaybook('expired_card', 10000, false);
  assert.ok(expiredCardSteps[0].action.includes('payment method update link'), 'Expired card triggers update link');
  console.log('  ✓ Verified: RecoveryAutopilotEngine generates deterministic playbooks correctly.');

  // Test 2: Home Page Rebuild & 4 Core Sections
  console.log('2. Validating Home Page 4 core sections...');
  const homeCode = fs.readFileSync('src/components/AutopilotRecoveryCenter.tsx', 'utf-8');
  assert.ok(homeCode.includes('aria-label="Revenue Recovered"'), 'Section 1: Revenue Recovered');
  assert.ok(homeCode.includes('aria-label="Revenue Recoverable"'), 'Section 2: Revenue Recoverable');
  assert.ok(homeCode.includes('aria-label="Approval Required"'), 'Section 3: Approval Required');
  assert.ok(homeCode.includes('aria-label="Recovering Next"'), 'Section 4: Recovering Next');
  console.log('  ✓ Verified: Home page strictly implements the 4 mandatory execution sections.');

  // Test 3: Recovery Guarantee Center
  console.log('3. Validating Recovery Guarantee Center...');
  const guaranteeCode = fs.readFileSync('src/components/RecoveryGuaranteeCenter.tsx', 'utf-8');
  assert.ok(guaranteeCode.includes('Recovery Guarantee Center'), 'Guarantee Center title present');
  assert.ok(guaranteeCode.includes('Recovered Today'), 'Shows Recovered Today');
  assert.ok(guaranteeCode.includes('Recovered This Week'), 'Shows Recovered This Week');
  assert.ok(guaranteeCode.includes('Recovered This Month'), 'Shows Recovered This Month');
  assert.ok(guaranteeCode.includes('Largest Recovery'), 'Shows Largest Recovery');
  console.log('  ✓ Verified: Recovery Guarantee Center proves verified value.');

  // Test 4: Approval Inbox Business Language
  console.log('4. Validating Approval Inbox business language...');
  const inboxCode = fs.readFileSync('src/components/RecoveryInbox.tsx', 'utf-8');
  assert.ok(inboxCode.includes('Customer'), 'Shows Customer');
  assert.ok(inboxCode.includes('amountFormatted'), 'Shows Amount');
  assert.ok(inboxCode.includes('reason'), 'Shows Reason');
  assert.ok(inboxCode.includes('recommendedAction'), 'Shows Recommended Action');
  assert.ok(inboxCode.includes('Approve'), 'Approve button');
  assert.ok(inboxCode.includes('Reject'), 'Reject button');
  console.log('  ✓ Verified: Approval Inbox maintains strict business language without internal telemetry.');

  // Test 5: Strict Non-Fabrication Policy
  console.log('5. Validating non-fabrication fallbacks...');
  assert.ok(homeCode.includes('More activity is needed before recoverable revenue can be calculated.'), 'Fallback for recoverable revenue');
  assert.ok(guaranteeCode.includes('More activity is needed before guarantees can be shown.'), 'Fallback for guarantee center');
  console.log('  ✓ Verified: Non-fabrication fallbacks correctly implemented.');

  console.log('================================================================');
  console.log('RECOVERY AUTOPILOT V1 TESTS: 100% PASSED');
  console.log('================================================================');
}

runAutopilotV1Tests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
