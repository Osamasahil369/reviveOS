import { strict as assert } from 'assert';
import { ErrorMonitoringService } from '../server/services/errorMonitoring.js';
import { db } from '../server/store/db.js';

async function runSystemHealthTests() {
  console.log('🚀 [TEST SUITE] Starting System Health & Error Monitoring Verification');

  // Disable persistence during tests
  db.setPersistenceEnabled(false);
  ErrorMonitoringService.clearErrors();

  // 1. Test error logging and severity levels
  console.log('\n--- 1. Verifying Error Logging & Severity Levels ---');
  ErrorMonitoringService.log('info', 'System started successfully', null, 'startup', 'ws_test_1');
  ErrorMonitoringService.log('warning', 'High memory usage detected', null, 'performance', 'ws_test_1');
  ErrorMonitoringService.log('error', 'Database query timeout', new Error('Timeout'), 'database', 'ws_test_2');
  ErrorMonitoringService.log('critical', 'Payment webhook signature verification failed', null, 'security', 'ws_test_1');

  const counts = ErrorMonitoringService.getErrorCounts();
  assert.strictEqual(counts.info, 1);
  assert.strictEqual(counts.warning, 1);
  assert.strictEqual(counts.error, 1);
  assert.strictEqual(counts.critical, 1);
  console.log('  ✓ Error counts correctly tallied across severity levels.');

  // 2. Test filtering recent errors by workspace and severity
  console.log('\n--- 2. Verifying Tenant Isolation & Filtering ---');
  const ws1Errors = ErrorMonitoringService.getRecentErrors(10, undefined, 'ws_test_1');
  assert.strictEqual(ws1Errors.length, 3, 'Workspace 1 should have 3 errors/logs');
  
  const criticalErrors = ErrorMonitoringService.getRecentErrors(10, 'critical');
  assert.strictEqual(criticalErrors.length, 1, 'Should have exactly 1 critical error');
  console.log('  ✓ Tenant isolation and severity filtering verified.');

  // 3. Test uptime and health metrics
  console.log('\n--- 3. Verifying Uptime & System Health ---');
  const uptime = ErrorMonitoringService.getUptimeSeconds();
  assert.ok(uptime >= 0, 'Uptime must be a non-negative number');
  console.log(`  ✓ System uptime verified (${uptime}s).`);

  console.log('\n=============================================================');
  console.log('🎉 ALL SYSTEM HEALTH & ERROR MONITORING TESTS PASSED (100%)!');
  console.log('=============================================================');
}

runSystemHealthTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
