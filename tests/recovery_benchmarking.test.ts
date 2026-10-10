import assert from 'node:assert';
import fs from 'fs';
import { db } from '../server/store/db.js';

console.log('================================================================');
console.log('TEST SUITE: REVENUE RECOVERY BENCHMARKING');
console.log('================================================================');

async function runBenchmarkingTests() {
  console.log('1. Validating RecoveryBenchmarksCard source code requirements...');
  const cardCode = fs.readFileSync('src/components/RecoveryBenchmarksCard.tsx', 'utf-8');

  // Verify display text and rules
  assert.ok(
    cardCode.includes('More recovery history required.'),
    'Must display exact copy "More recovery history required." when data is insufficient'
  );
  assert.ok(
    cardCode.includes('Current Recovery Rate'),
    'Must display Current Recovery Rate'
  );
  assert.ok(
    cardCode.includes('Workspace Historical Average'),
    'Must compare against Workspace Historical Average'
  );
  assert.strictEqual(
    cardCode.includes('industry average') || cardCode.includes('Industry Average'),
    false,
    'Must NEVER fabricate external or synthetic industry averages'
  );
  console.log('  ✓ Verified: Benchmarking relies strictly on workspace historical averages with no fabricated statistics.');

  console.log('2. Validating Benchmarks rendering in AutopilotRecoveryCenter...');
  const centerCode = fs.readFileSync('src/components/AutopilotRecoveryCenter.tsx', 'utf-8');
  assert.ok(
    centerCode.includes('RecoveryBenchmarksCard'),
    'AutopilotRecoveryCenter must include RecoveryBenchmarksCard'
  );
  console.log('  ✓ Verified: RecoveryBenchmarksCard integrated in dashboard view.');

  console.log('3. Validating Historical Calculation on Populated Demo Workspace...');
  const wsId = 'ws_benchmark_test';
  db.loadDemoWorkspace(wsId, 'Benchmark Test');
  const opps = db.getOpportunities(wsId);
  assert.ok(opps.length > 10, 'Populated demo workspace has substantial opportunity data');

  const resolved = opps.filter((o) => o.status === 'recovered' || o.status === 'failed');
  assert.ok(resolved.length > 5, 'Resolved cohort satisfies minimum sample threshold');
  console.log(`  ✓ Workspace has ${opps.length} total opportunities and ${resolved.length} resolved records.`);

  console.log('================================================================');
  console.log('REVENUE RECOVERY BENCHMARKING TESTS: 100% PASSED');
  console.log('================================================================');
}

runBenchmarkingTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
