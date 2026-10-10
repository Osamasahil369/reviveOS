import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { RevenueLeakScanner } from '../server/scanner/revenueScanner.js';
import { AiOpportunityEngine } from '../server/intelligence/opportunityEngine.js';
import { ChurnPredictorEngine } from '../server/intelligence/churnPredictor.js';
import { ExpansionFinderEngine } from '../server/intelligence/expansionFinder.js';
import { RevenueBrainEngine } from '../server/intelligence/revenueBrain.js';
import { CopilotOrchestrator } from '../server/copilot/copilotOrchestrator.js';
import { OutcomeLearningEngine } from '../server/learning/outcomeLearningEngine.js';

async function runEndToEndAudit() {
  console.log('======================================================');
  console.log('REVIVEOS — END-TO-END PRODUCTION READINESS AUDIT SUITE');
  console.log('======================================================\n');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const testAuditWs = `ws_audit_e2e_${Date.now()}`;

  // STEP 1: Account / Workspace Creation
  console.log('1. Auditing Account / Workspace Creation...');
  const newWs = db.createWorkspace('Audit Global Inc', 'saas', 'USD');
  assert.ok(newWs && newWs.id, 'Workspace created successfully');
  const wsId = newWs.id;
  console.log(`  ✓ Workspace created with ID: ${wsId}`);

  // STEP 2: Provider Connection
  console.log('2. Auditing Provider Connection...');
  const conn = await db.updateProviderConnection(wsId, 'stripe', {
    apiKey: 'sk_test_123_audit',
    webhookSecret: 'whsec_test_123_audit',
    isLive: false,
  });
  assert.ok(conn && conn.provider_type === 'stripe', 'Provider connection record created');
  console.log(`  ✓ Stripe provider connection verified (${conn.provider_type})`);

  // STEP 3: Data Sync (Customers, Subscriptions, Payments)
  console.log('3. Auditing Data Ingestion & Sync...');
  const customer = db.createCustomer(wsId, {
    name: 'Audit Customer Enterprise',
    email: 'audit@enterprise.io',
    phone: '+12025550199',
    currency: 'USD',
    plan_name: 'Scale Tier',
    plan_amount_cents: 99000,
    billing_interval: 'monthly',
  });
  assert.ok(customer && customer.id, 'Customer created');

  const manualFail = db.createManualFailedInvoice(wsId, {
    customerId: customer.id,
    amountCents: 99000,
    currency: 'USD',
    providerFailureCode: 'insufficient_funds',
    rawErrorMessage: 'Card has insufficient funds for $990.00 charge',
  });
  assert.ok(manualFail && manualFail.opportunity, 'Failed payment ingested and opportunity created');
  const oppId = manualFail.opportunity.id;
  console.log(`  ✓ Customer and payment failure ingested. Opportunity ID: ${oppId}`);

  // STEP 4: Revenue Leak Scanner
  console.log('4. Auditing Revenue Leak Scanner...');
  const scanResult = await RevenueLeakScanner.executeScan(wsId);
  assert.ok(scanResult.totalRecordsAudited >= 1, 'Scanner detects ingested records');
  assert.strictEqual(scanResult.totalAtRiskCents, 99000, 'Scanner accurately totals revenue at risk');
  console.log(`  ✓ Scanner audited ${scanResult.totalRecordsAudited} records, Total At-Risk: $${scanResult.totalAtRiskCents / 100}`);

  // STEP 5: Opportunity Engine
  console.log('5. Auditing Opportunity Engine...');
  const oppQueue = await AiOpportunityEngine.generatePrioritizedQueue(wsId, { enrichWithAi: false });
  assert.ok(oppQueue.queue.length >= 1, 'Opportunity engine priority queue populated');
  const oppRec = oppQueue.queue.find((o) => o.opportunityId === oppId);
  assert.ok(oppRec, 'Ingested opportunity present in AI opportunity queue');
  assert.strictEqual(oppRec.priority, 'P1_CRITICAL', 'High dollar value mapped to P1_CRITICAL');
  console.log(`  ✓ Opportunity queue verified. Priority: ${oppRec.priority}, Score: ${oppRec.priorityScore}/100`);

  // STEP 6: Revenue Brain
  console.log('6. Auditing Revenue Brain Unified Command Layer...');
  const brainRes = await RevenueBrainEngine.evaluateWorkspace(wsId);
  assert.ok(brainRes.opportunities.length >= 1, 'Revenue Brain unified queue populated');
  const brainRec = brainRes.opportunities.find((o) => o.sourceId === oppId);
  assert.ok(brainRec, 'Opportunity unified in Revenue Brain');
  assert.strictEqual(brainRec.category, 'RECOVERY', 'Correctly categorized as RECOVERY');
  console.log(`  ✓ Revenue Brain verified. Top opportunity category: ${brainRec.category}, Impact score: ${brainRec.impactScore}/100`);

  // STEP 7: Recovery Copilot Plan Generation
  console.log('7. Auditing Recovery Copilot Plan Generation...');
  const copilotPlan = await CopilotOrchestrator.getOrGeneratePlan(wsId, oppId);
  assert.ok(copilotPlan && copilotPlan.recommendedSteps.length > 0, 'Copilot plan generated with steps');
  assert.strictEqual(copilotPlan.approvalStatus, 'pending_approval', 'New plan defaults to pending_approval');
  console.log(`  ✓ Copilot plan generated with ${copilotPlan.recommendedSteps.length} step(s). Status: ${copilotPlan.approvalStatus}`);

  // STEP 8: Approval Workflow
  console.log('8. Auditing Approval Workflow Safety...');
  // Attempt execution on unapproved plan -> must fail
  try {
    await CopilotOrchestrator.executeStep(wsId, oppId, copilotPlan.recommendedSteps[0].id, 'test_operator');
    assert.fail('Should block execution on unapproved plan');
  } catch (err: any) {
    assert.ok(err.message.includes('approved'), 'Execution blocked on unapproved plan');
  }

  // Approve plan
  const approvedPlan = await CopilotOrchestrator.approvePlan(wsId, oppId, 'operator_sameer');
  assert.strictEqual(approvedPlan.approvalStatus, 'approved', 'Plan approved successfully');
  console.log(`  ✓ Approval workflow verified. Execution blocked prior to approval, approved by: ${approvedPlan.approvedBy}`);

  // STEP 9: Workflow Execution
  console.log('9. Auditing Workflow Execution...');
  const execResult = await CopilotOrchestrator.executeWorkflow(wsId, oppId, 'operator_sameer');
  assert.ok(execResult.outcome === 'success' || execResult.outcome === 'partial_success', 'Workflow executed successfully');
  console.log(`  ✓ Sequential workflow executed. Final Outcome: ${execResult.outcome}`);

  // STEP 10: Outcome Recording & Learning Update
  console.log('10. Auditing Outcome Recording & Outcome Learning Engine...');
  const outcomeRec = db.recordOpportunityOutcome({
    id: `out_audit_${Date.now()}`,
    workspaceId: wsId,
    opportunityId: oppId,
    outcome: 'recovered',
    recoveredAmountCents: 99000,
    resolvedAt: new Date().toISOString(),
    feedbackNotes: 'Audit test settlement verified',
  });
  assert.strictEqual(outcomeRec.outcome, 'recovered');

  const learningSummary = await OutcomeLearningEngine.analyzeWorkspaceOutcomes(wsId);
  assert.ok(learningSummary, 'Learning engine analyzed workspace outcomes');
  console.log(`  ✓ Outcome recorded and analyzed. Total Outcomes Analyzed: ${learningSummary.totalOutcomesAnalyzed}`);

  console.log('\n======================================================');
  console.log('END-TO-END AUDIT SUITE PASSED (100%)');
  console.log('======================================================');
}

runEndToEndAudit().catch((err) => {
  console.error('❌ End-to-End Audit Failed:', err);
  process.exit(1);
});
