import './setupEnv.js';
import assert from 'assert';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { setStorageMode, isSupabaseAuthoritative } from '../server/db/storageMode.js';
import { supabaseService } from '../server/db/supabaseService.js';
import { AiOpportunityEngine } from '../server/intelligence/opportunityEngine.js';
import { CopilotOrchestrator } from '../server/copilot/copilotOrchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runFinalCorrectionsTests() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY OS: FINAL CORRECTIONS VALIDATION SUITE');
  console.log('======================================================\n');

  // A & B & C: recordAction and recordOutcome in authoritative mode and persistence failure propagation
  console.log('1. Testing Authoritative Action & Outcome Persistence & Propagation...');
  setStorageMode('supabase_production');
  assert.strictEqual(isSupabaseAuthoritative(), true);

  // Mock supabaseService methods to test failure propagation and success
  const origRecordAction = supabaseService.recordOpportunityAction;
  const origRecordOutcome = supabaseService.recordOpportunityOutcome;
  const origGetOpp = supabaseService.getRecoveryOpportunityById;

  supabaseService.getRecoveryOpportunityById = async (wsId: string, oppId: string) => ({
    id: oppId,
    workspace_id: wsId,
    customer_id: 'cust_1',
    amount_at_risk_cents: 15000,
    currency: 'USD',
    status: 'new',
    failure_category: 'insufficient_funds',
    current_step_number: 1,
    created_at: new Date().toISOString(),
  } as any);

  let actionCalled = false;
  supabaseService.recordOpportunityAction = async (action: any) => {
    actionCalled = true;
    assert.strictEqual(action.opportunity_id, 'opp_test_123');
    assert.strictEqual(action.action_type, 'smart_retry');
  };

  let outcomeCalled = false;
  supabaseService.recordOpportunityOutcome = async (outcome: any) => {
    outcomeCalled = true;
    assert.strictEqual(outcome.opportunity_id, 'opp_test_123');
    assert.strictEqual(outcome.outcome, 'recovered');
  };

  await AiOpportunityEngine.recordAction('ws_test', 'opp_test_123', {
    actionType: 'smart_retry',
    channel: 'gateway',
    executedBy: 'operator',
    notes: 'Test action',
  });
  assert.strictEqual(actionCalled, true, 'A. recordAction() writes to Supabase in authoritative mode');

  await AiOpportunityEngine.recordOutcome('ws_test', 'opp_test_123', {
    outcome: 'recovered',
    recoveredAmountCents: 15000,
    settlementMethod: 'stripe',
  });
  assert.strictEqual(outcomeCalled, true, 'B. recordOutcome() writes to Supabase in authoritative mode');

  // Test persistence failure propagation
  supabaseService.recordOpportunityAction = async () => {
    throw new Error('Database connection timeout');
  };

  let errorPropagated = false;
  try {
    await AiOpportunityEngine.recordAction('ws_test', 'opp_test_123', {
      actionType: 'smart_retry',
    });
  } catch (err: any) {
    if (err.message.includes('Database connection timeout')) {
      errorPropagated = true;
    }
  }
  assert.strictEqual(errorPropagated, true, 'C. Persistence failure propagates correctly');

  // Restore supabaseService methods
  supabaseService.recordOpportunityAction = origRecordAction;
  supabaseService.recordOpportunityOutcome = origRecordOutcome;
  supabaseService.getRecoveryOpportunityById = origGetOpp;
  setStorageMode('local_development');

  // D. Verify no invalid PostgREST relationship embeddings remain in source files
  console.log('2. Testing PostgREST Relationship Embeddings Audit...');
  const supabaseServiceContent = fs.readFileSync(path.join(__dirname, '../server/db/supabaseService.ts'), 'utf8');
  assert.strictEqual(supabaseServiceContent.includes('invoice:invoices(*)'), false, 'D. Invalid invoice:invoices(*) embedding removed from recovery queries');
  assert.strictEqual(supabaseServiceContent.includes('subscription:subscriptions(*)'), false, 'D. Invalid subscription:subscriptions(*) embedding removed from recovery queries');

  // E. Copilot log read failure does not silently fall back in production mode
  console.log('3. Testing Copilot Log Read Failure in Production Mode...');
  setStorageMode('supabase_production');
  const origGetLogs = supabaseService.getCopilotExecutionLogs;
  supabaseService.getCopilotExecutionLogs = async () => {
    throw new Error('Supabase table access denied');
  };

  let copilotErrorThrown = false;
  try {
    await CopilotOrchestrator.getExecutionLogs('ws_test', 'opp_test_123');
  } catch (err: any) {
    if (err.message.includes('Authoritative Copilot log read failed')) {
      copilotErrorThrown = true;
    }
  }
  assert.strictEqual(copilotErrorThrown, true, 'E. Copilot log read failure throws and does not silently fall back to memory logs in production mode');

  supabaseService.getCopilotExecutionLogs = origGetLogs;
  setStorageMode('local_development');

  console.log('======================================================');
  console.log('FINAL CORRECTIONS TESTS: ALL PASSED (100%)');
  console.log('======================================================\n');
}

runFinalCorrectionsTests().catch((err) => {
  console.error('❌ Final Corrections Test Failed:', err);
  process.exit(1);
});
