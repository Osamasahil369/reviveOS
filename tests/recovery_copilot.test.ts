import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { CopilotOrchestrator } from '../server/copilot/copilotOrchestrator.js';

async function runRecoveryCopilotTests() {
  console.log('🧪 Starting Recovery Copilot Intelligence Upgrade Automated Tests...');

  setStorageMode('local_development');
  db.resetToCleanSeed();

  const workspaces = db.getWorkspaces();
  assert.ok(workspaces.length > 0, 'Seed workspace exists');
  const wsId = workspaces[0].id;

  const opportunities = db.getOpportunities(wsId);
  assert.ok(opportunities.length > 0, 'Opportunities exist for testing copilot');
  const testOpp = opportunities[0];

  console.log(`1. Testing Plan Generation Quality & Enhanced Fields`);
  const plan = await CopilotOrchestrator.getOrGeneratePlan(wsId, testOpp.id);
  assert.strictEqual(plan.opportunityId, testOpp.id, 'Plan links to correct opportunity ID');
  assert.ok(plan.goal, 'Plan includes clear recovery goal');
  assert.ok(plan.why.length > 0, 'Plan includes explainable "Why" reasons');
  assert.ok(plan.recommendedSteps.length > 0, 'Plan includes structured recommended steps');
  assert.ok(plan.recoverySummary, 'Plan includes recovery summary');
  assert.ok(plan.whyThisMatters, 'Plan includes whyThisMatters');
  assert.ok(plan.recommendedActionSummary, 'Plan includes recommendedActionSummary');
  assert.ok(plan.alternativeActionsConsidered && plan.alternativeActionsConsidered.length > 0, 'Plan includes alternative actions considered');

  console.log(`2. Testing Timing Recommendations, Risk Assessment & Confidence Explanations`);
  assert.ok(plan.timingRecommendation && plan.timingRecommendation.timing, 'Plan includes timing recommendation');
  assert.ok(plan.riskAssessment && plan.riskAssessment.level, 'Plan includes risk assessment level');
  assert.ok(plan.confidenceExplanation && plan.confidenceExplanation.level, 'Plan includes confidence explanation level');
  assert.ok(plan.relevantHistoricalOutcomes, 'Plan includes relevant historical outcomes');

  console.log(`3. Testing Action History Awareness`);
  db.recordOpportunityAction({
    id: `act_${Date.now()}`,
    workspaceId: wsId,
    opportunityId: testOpp.id,
    actionType: 'send_email',
    executedBy: 'test_operator',
    executedAt: new Date().toISOString(),
    metadata: { reason: 'bounce' }
  });
  CopilotOrchestrator.clearCache();
  const planWithHistory = await CopilotOrchestrator.getOrGeneratePlan(wsId, testOpp.id);
  assert.ok(planWithHistory.why.some(w => w.includes('Action history indicates')), 'Plan acknowledges action history awareness');

  console.log(`4. Testing Outcome History Awareness`);
  db.recordOpportunityOutcome({
    id: `out_${Date.now()}`,
    workspaceId: wsId,
    opportunityId: testOpp.id,
    outcome: 'recovered',
    recoveredAmountCents: testOpp.amount_at_risk_cents,
    resolvedAt: new Date().toISOString()
  });
  CopilotOrchestrator.clearCache();
  const planWithOutcomes = await CopilotOrchestrator.getOrGeneratePlan(wsId, testOpp.id);
  assert.ok(planWithOutcomes.relevantHistoricalOutcomes, 'Plan includes outcome history awareness');

  console.log(`5. Testing Missing History & Missing Intelligence Resilience`);
  const freshOpp = opportunities[1] || testOpp;
  const missingHistoryPlan = await CopilotOrchestrator.getOrGeneratePlan(wsId, freshOpp.id);
  assert.ok(missingHistoryPlan, 'Generates plan successfully when history is missing');
  assert.ok(missingHistoryPlan.recommendedSteps.length > 0, 'Provides recommended steps with missing history');

  console.log(`6. Testing Tenant Isolation`);
  let tenantErrorThrown = false;
  try {
    await CopilotOrchestrator.getOrGeneratePlan('ws_malicious_attacker_999', testOpp.id);
  } catch (err: any) {
    if (err.status === 403 || err.message.includes('Unauthorized') || err.message.includes('not found')) {
      tenantErrorThrown = true;
    }
  }
  assert.strictEqual(tenantErrorThrown, true, 'Tenant isolation enforced: accessing opportunity across workspaces throws authorization error');

  console.log(`7. Testing Semi-Autonomous Recovery Approval & Execution Safety Workflow`);
  const approvalTestOpp = opportunities[1] || testOpp;
  CopilotOrchestrator.clearCache();
  const freshPlan = await CopilotOrchestrator.getOrGeneratePlan(wsId, approvalTestOpp.id);
  assert.strictEqual(freshPlan.approvalStatus, 'pending_approval', 'New plan starts in pending_approval state');

  // Test unapproved execution safety: attempting execution without approval must fail
  let unapprovedExecutionFailed = false;
  try {
    await CopilotOrchestrator.executeStep(wsId, approvalTestOpp.id, freshPlan.recommendedSteps[0].id, 'test_operator');
  } catch (err: any) {
    if (err.status === 400 || err.message.includes('must be explicitly approved')) {
      unapprovedExecutionFailed = true;
    }
  }
  assert.strictEqual(unapprovedExecutionFailed, true, 'Execution safety: Executing unapproved plan is strictly blocked');

  // Test Approval Flow
  const approvedPlan = await CopilotOrchestrator.approvePlan(wsId, approvalTestOpp.id, 'admin_operator');
  assert.strictEqual(approvedPlan.approvalStatus, 'approved', 'Plan status updates to approved');
  assert.strictEqual(approvedPlan.approvedBy, 'admin_operator', 'Approval records approver identity');
  assert.ok(approvedPlan.approvedAt, 'Approval records timestamp');

  // Test Duplicate Approval Prevention
  let duplicateApprovalFailed = false;
  try {
    await CopilotOrchestrator.approvePlan(wsId, approvalTestOpp.id, 'another_operator');
  } catch (err: any) {
    if (err.status === 400 || err.message.includes('already approved')) {
      duplicateApprovalFailed = true;
    }
  }
  assert.strictEqual(duplicateApprovalFailed, true, 'Duplicate approval prevention: Approving already approved plan throws error');

  console.log(`8. Testing Step Execution & Audit Logs for Approved Plan`);
  const firstStep = freshPlan.recommendedSteps[0];
  const executionResult = await CopilotOrchestrator.executeStep(wsId, approvalTestOpp.id, firstStep.id, 'admin_operator');
  assert.ok(executionResult.success !== undefined, 'Execution returns success boolean');
  assert.ok(executionResult.message, 'Execution returns status message');

  const logs = await CopilotOrchestrator.getExecutionLogs(wsId, approvalTestOpp.id);
  assert.ok(logs.length > 0, 'Execution logs recorded in audit trail');

  console.log(`9. Testing Rejection Flow`);
  const rejectOpp = opportunities[2] || testOpp;
  const rejectedPlan = await CopilotOrchestrator.rejectPlan(wsId, rejectOpp.id, 'admin_operator', 'Too high risk for automated execution');
  assert.strictEqual(rejectedPlan.approvalStatus, 'rejected', 'Plan status updates to rejected');
  assert.strictEqual(rejectedPlan.rejectedReason, 'Too high risk for automated execution', 'Rejection records reason');

  console.log(`10. Testing Phase 2 Sequential Workflow Engine & Outcome Recording`);
  const wfOpp = opportunities[3] || testOpp;
  CopilotOrchestrator.clearCache();
  const wfPlan = await CopilotOrchestrator.getOrGeneratePlan(wsId, wfOpp.id);

  // Test approval requirement for workflow
  let unapprovedWfFailed = false;
  try {
    await CopilotOrchestrator.executeWorkflow(wsId, wfOpp.id, 'admin_operator');
  } catch (err: any) {
    if (err.status === 400 || err.message.includes('without explicit operator approval')) {
      unapprovedWfFailed = true;
    }
  }
  assert.strictEqual(unapprovedWfFailed, true, 'Workflow safety: Executing unapproved workflow is strictly blocked');

  // Approve workflow plan
  await CopilotOrchestrator.approvePlan(wsId, wfOpp.id, 'admin_operator');

  // Test Workflow Execution
  const wfResult = await CopilotOrchestrator.executeWorkflow(wsId, wfOpp.id, 'admin_operator');
  assert.ok(wfResult.success !== undefined, 'Workflow execution returns success');
  assert.ok(wfResult.outcome, 'Workflow execution returns outcome');
  assert.ok(
    wfResult.plan.workflowStatus === 'success' || wfResult.plan.workflowStatus === 'partial_success',
    'Workflow completes with success or partial_success outcome'
  );

  // Test Duplicate Workflow Execution Prevention
  let duplicateWfFailed = false;
  try {
    await CopilotOrchestrator.executeWorkflow(wsId, wfOpp.id, 'admin_operator');
  } catch (err: any) {
    if (err.status === 400 || err.message.includes('already successfully completed')) {
      duplicateWfFailed = true;
    }
  }
  assert.strictEqual(duplicateWfFailed, true, 'Duplicate workflow execution prevention: Re-executing completed workflow throws error');

  // Test Outcome Recording
  const outcomes = db.getOpportunityOutcomes(wsId, wfOpp.id);
  assert.ok(outcomes.length > 0, 'Opportunity outcome recorded automatically upon workflow completion');

  // Test Tenant Isolation on Workflow Execution
  let tenantWfError = false;
  try {
    await CopilotOrchestrator.executeWorkflow('ws_malicious_attacker_999', wfOpp.id, 'attacker');
  } catch (err: any) {
    if (err.status === 403 || err.status === 404 || err.message.includes('Unauthorized') || err.message.includes('not found')) {
      tenantWfError = true;
    }
  }
  assert.strictEqual(tenantWfError, true, 'Tenant isolation strictly enforced during workflow execution');

  console.log('✅ All Recovery Copilot Phase 2 Workflow & Intelligence Tests Passed Successfully!');
}

runRecoveryCopilotTests().catch((err) => {
  console.error('❌ Recovery Copilot Test Failed:', err);
  process.exit(1);
});
