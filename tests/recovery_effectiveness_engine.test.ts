import assert from 'node:assert';
import { db } from '../server/store/db.js';
import {
  RecoveryEffectivenessEngine,
  MIN_EFFECTIVENESS_SAMPLE_THRESHOLD,
} from '../server/intelligence/recoveryEffectivenessEngine.js';

console.log('================================================================');
console.log('TEST SUITE: RECOVERY EFFECTIVENESS ENGINE & LAB');
console.log('================================================================');

async function runRecoveryEffectivenessTests() {
  const wsEmpty = 'ws_effectiveness_empty_test';
  const wsPopulated = 'ws_effectiveness_pop_test';

  // Test 1: Empty workspace must enforce minimum sample threshold
  console.log('1. Testing minimum sample threshold enforcement on empty workspace...');
  const emptyReport = RecoveryEffectivenessEngine.analyzeWorkspaceEffectiveness(wsEmpty);
  assert.strictEqual(emptyReport.hasSufficientOverallData, false, 'Empty workspace must report insufficient data');
  assert.strictEqual(
    emptyReport.overallHistoricalRateFormatted,
    'Not enough historical data.',
    'Must display exact copy "Not enough historical data."'
  );
  assert.strictEqual(emptyReport.topPerformingAction, null, 'No top performing action when data is insufficient');

  for (const action of emptyReport.actionMetrics) {
    assert.strictEqual(action.hasSufficientData, false, `${action.actionName} must not claim sufficient data`);
    assert.strictEqual(
      action.recoveryRateFormatted,
      'Not enough historical data.',
      `${action.actionName} must output "Not enough historical data."`
    );
  }
  console.log('  ✓ Verified: Minimum sample threshold strictly enforced, zero fabricated statistics.');

  // Test 2: Seed workspace with real verified data and verify calculations
  console.log('2. Testing historical effectiveness calculation on populated workspace...');
  db.loadDemoWorkspace(wsPopulated, 'Effectiveness Test Workspace');
  const popReport = RecoveryEffectivenessEngine.analyzeWorkspaceEffectiveness(wsPopulated);

  assert.strictEqual(popReport.workspaceId, wsPopulated, 'Workspace boundary matches');
  assert.ok(popReport.totalHistoricalAttempts >= MIN_EFFECTIVENESS_SAMPLE_THRESHOLD, 'Attempts exceed threshold');
  assert.ok(popReport.totalHistoricalRecoveries > 0, 'Successful recoveries recorded');
  assert.ok(popReport.hasSufficientOverallData, 'Reports sufficient data');
  assert.notStrictEqual(popReport.overallHistoricalRateFormatted, 'Not enough historical data.');
  assert.ok(popReport.overallHistoricalRateFormatted.includes('%'), 'Includes percentage when sufficient data exists');
  assert.ok(popReport.topPerformingAction !== null, 'Identifies top performing action');
  console.log(`  ✓ Overall Historical Rate: ${popReport.overallHistoricalRateFormatted} across ${popReport.totalHistoricalAttempts} attempts`);
  console.log(`  ✓ Top Performing Action: ${popReport.topPerformingAction?.actionName} (${popReport.topPerformingAction?.recoveryRateFormatted})`);

  // Test 3: Failure category effectiveness mapping
  console.log('3. Testing failure category effectiveness mapping...');
  assert.ok(popReport.categoryEffectiveness.length > 0, 'Category breakdown populated');
  const fundsCategory = popReport.categoryEffectiveness.find((c) => c.failureCategory === 'insufficient_funds');
  assert.ok(fundsCategory, 'Insufficient funds category tracked');
  assert.ok(fundsCategory.highestPerformingAction !== null, 'Identified highest performing action for category');
  console.log(`  ✓ Insufficient Funds top action: ${fundsCategory.highestPerformingAction?.actionName} (${fundsCategory.highestPerformingAction?.successRateFormatted})`);

  // Test 4: Recommendation Enhancement
  console.log('4. Testing smart action recommendation enhancement...');
  const enhanced = RecoveryEffectivenessEngine.enhanceRecommendation(
    wsPopulated,
    'retry_payment',
    'Retry Payment',
    'insufficient_funds'
  );
  assert.ok(enhanced.hasEvidence, 'Enhancement finds real evidence');
  assert.ok(enhanced.enhancedLabel.startsWith('Retry Payment — historically recovered'), 'Evidence formatted with exact pattern');
  assert.ok(enhanced.enhancedLabel.includes('%'), 'Includes real historical percentage');
  console.log(`  ✓ Enhanced Recommendation: "${enhanced.enhancedLabel}"`);

  // Test 5: Deterministic enhancement fallback when insufficient sample
  console.log('5. Testing deterministic fallback when sample size is insufficient...');
  const unenhanced = RecoveryEffectivenessEngine.enhanceRecommendation(
    wsEmpty,
    'retry_payment',
    'Retry Payment',
    'insufficient_funds'
  );
  assert.strictEqual(unenhanced.hasEvidence, false, 'No evidence claimed on empty workspace');
  assert.strictEqual(unenhanced.enhancedLabel, 'Retry Payment', 'Never overrides base deterministic label');
  console.log('  ✓ Verified: Deterministic logic preserved, no statistical claims without evidence.');

  // Test 6: Tenant Isolation
  console.log('6. Testing multi-tenant isolation...');
  const isolatedReport = RecoveryEffectivenessEngine.analyzeWorkspaceEffectiveness('ws_isolated_unrelated');
  assert.strictEqual(isolatedReport.totalHistoricalAttempts, 0, 'Isolated workspace has 0 attempts');
  assert.strictEqual(isolatedReport.hasSufficientOverallData, false, 'Isolated workspace has insufficient data');
  console.log('  ✓ Multi-tenant isolation verified.');

  console.log('================================================================');
  console.log('RECOVERY EFFECTIVENESS ENGINE TESTS: 100% PASSED');
  console.log('================================================================');
}

runRecoveryEffectivenessTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
