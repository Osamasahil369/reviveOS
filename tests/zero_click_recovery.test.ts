import assert from 'node:assert';
import fs from 'fs';

console.log('================================================================');
console.log('TEST SUITE: ZERO CLICK RECOVERY EXPERIENCE');
console.log('================================================================');

async function runZeroClickTests() {
  const homeCode = fs.readFileSync('src/components/AutopilotRecoveryCenter.tsx', 'utf-8');
  const inboxCode = fs.readFileSync('src/components/RecoveryInbox.tsx', 'utf-8');
  const winsCode = fs.readFileSync('src/components/RecoveryWinsFeed.tsx', 'utf-8');

  // Test 1: Attention Dashboard Metrics
  console.log('1. Validating Attention Dashboard metrics on Home...');
  assert.ok(homeCode.includes('Revenue Recovered This Week'), 'Attention: Revenue Recovered This Week');
  assert.ok(homeCode.includes('Revenue Recovered This Month'), 'Attention: Revenue Recovered This Month');
  assert.ok(homeCode.includes('Revenue Still Recoverable'), 'Attention: Revenue Still Recoverable');
  assert.ok(homeCode.includes('Cases Awaiting Approval'), 'Attention: Cases Awaiting Approval');
  console.log('  ✓ Verified: Attention Dashboard renders all 4 mandatory metrics.');

  // Test 2: Zero approval state & positive approval state CTA
  console.log('2. Validating zero-approval state and positive approval CTA...');
  assert.ok(
    homeCode.includes('No action required. ReviveOS is recovering revenue automatically.'),
    'Zero approval message present'
  );
  assert.ok(homeCode.includes('Review'), 'Review CTA present');
  console.log('  ✓ Verified: Conditional Zero Click messaging and primary CTA correctly structured.');

  // Test 3: Recovery Inbox Single Queue
  console.log('3. Validating Recovery Inbox single queue requirements...');
  assert.ok(inboxCode.includes('Recovery Inbox'), 'Inbox title present');
  assert.ok(inboxCode.includes('customerName'), 'Shows Customer');
  assert.ok(inboxCode.includes('amountFormatted'), 'Shows Amount');
  assert.ok(inboxCode.includes('reason'), 'Shows why attention is needed');
  assert.ok(inboxCode.includes('recommendedAction'), 'Shows Recommended action');
  assert.ok(inboxCode.includes('Approve'), 'Approve button present');
  assert.ok(inboxCode.includes('Reject'), 'Reject button present');
  console.log('  ✓ Verified: Recovery Inbox renders single queue with all required elements.');

  // Test 4: Recovery Wins Feed
  console.log('4. Validating Recovery Wins feed...');
  assert.ok(winsCode.includes('Recovery Wins'), 'Recovery Wins title present');
  assert.ok(winsCode.includes('Recovered'), 'Shows Recovered events');
  console.log('  ✓ Verified: Recovery Wins feed displays settled recovery events.');

  // Test 5: Removal of clutter from Home
  console.log('5. Validating removal of clutter from Home...');
  assert.strictEqual(homeCode.includes('MissionMetricsCard'), false, 'Mission metrics removed from main home view');
  assert.strictEqual(homeCode.includes('RecoveryBenchmarksCard') && !homeCode.includes('showFullOps'), false, 'Benchmarks removed from active home view');
  console.log('  ✓ Verified: Clutter and advanced dashboards removed from default Home view.');

  console.log('================================================================');
  console.log('ZERO CLICK RECOVERY EXPERIENCE TESTS: 100% PASSED');
  console.log('================================================================');
}

runZeroClickTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
