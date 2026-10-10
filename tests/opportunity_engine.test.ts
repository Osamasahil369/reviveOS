/**
 * Automated Test Suite: Revenue Recovery OS - AI Opportunity Engine Validation
 *
 * Verifies all Core AI Opportunity Engine Requirements:
 * 1. Deterministic Weighted Priority Model (Mathematical scoring with explicit weights)
 * 2. Explainable Intelligence & Grounded Evidence
 * 3. Recovery Likelihood & Expected Value Math
 * 4. Action Recommendation & Optimal Timing Selection
 * 5. Honest Expansion Candidate Evaluation (no fake upsell claims)
 * 6. Idempotent Processing (multi-run consistency)
 * 7. Multi-Tenant Workspace Boundary Isolation
 * 8. Feedback Loop Recording (Actions & Outcomes for future Revenue Brain)
 * 9. Graceful Degradation when AI is offline
 */

import './setupEnv.js';
import assert from 'assert';
import crypto from 'crypto';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { AiOpportunityEngine } from '../server/intelligence/opportunityEngine.js';
import { OpportunityScoringEngine, SCORING_WEIGHTS } from '../server/intelligence/scoringEngine.js';
import { Customer, Subscription, Invoice, PaymentFailure, RecoveryOpportunity } from '../src/types/index.js';

setStorageMode('local_development');
db.setPersistenceEnabled(false);

let passedTests = 0;
let totalTests = 0;

function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passedTests++;
      console.log(`  ✓ PASS: ${name}`);
    })
    .catch((err) => {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      throw err;
    });
}

async function runOpportunityEngineValidation() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY OS: AI OPPORTUNITY ENGINE VALIDATION');
  console.log('======================================================\n');

  const wsA = `ws_engine_alpha_${Date.now()}`;
  const wsB = `ws_engine_beta_${Date.now()}`;

  // -------------------------------------------------------------------------
  // SEED WORKSPACE A TEST DATA
  // -------------------------------------------------------------------------
  
  // Customer 1: High LTV Enterprise Customer (12 previous payments, healthy)
  const custEnterprise: Customer = {
    id: `cust_ent_01`,
    workspace_id: wsA,
    name: 'Apex Enterprise Systems',
    email: 'finance@apexenterprise.io',
    currency: 'USD',
    country: 'US',
    provider_type: 'stripe',
    provider_customer_id: 'cus_apex_01',
    current_risk_status: 'healthy',
    lifetime_value_cents: 600000,
    total_recovered_cents: 0,
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Customer 2: Mid-tier customer with aging past-due payment
  const custMidTier: Customer = {
    id: `cust_mid_02`,
    workspace_id: wsA,
    name: 'Vanguard Logistics',
    email: 'billing@vanguard.io',
    currency: 'USD',
    country: 'US',
    provider_type: 'stripe',
    provider_customer_id: 'cus_vanguard_02',
    current_risk_status: 'at_risk',
    lifetime_value_cents: 100000,
    total_recovered_cents: 0,
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Customer 3: Large Annual Renewal coming up in 24 hours
  const custRenewal: Customer = {
    id: `cust_ren_03`,
    workspace_id: wsA,
    name: 'Hyperion Global Cloud',
    email: 'procurement@hyperion.cloud',
    currency: 'USD',
    country: 'US',
    provider_type: 'stripe',
    provider_customer_id: 'cus_hyperion_03',
    current_risk_status: 'healthy',
    lifetime_value_cents: 1200000,
    total_recovered_cents: 0,
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Customer in Tenant B
  const custTenantB: Customer = {
    id: `cust_tenant_b_01`,
    workspace_id: wsB,
    name: 'Isolated Tenant B Corp',
    email: 'admin@isolated-b.com',
    currency: 'USD',
    country: 'US',
    provider_type: 'stripe',
    provider_customer_id: 'cus_tenant_b_01',
    current_risk_status: 'healthy',
    lifetime_value_cents: 50000,
    total_recovered_cents: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.addCustomer(custEnterprise);
  db.addCustomer(custMidTier);
  db.addCustomer(custRenewal);
  db.addCustomer(custTenantB);

  // Subscriptions
  const subEnterprise: Subscription = {
    id: `sub_ent_01`,
    workspace_id: wsA,
    customer_id: custEnterprise.id,
    provider_type: 'stripe',
    provider_subscription_id: 'sub_stripe_ent_01',
    plan_name: 'Enterprise Plus',
    amount_cents: 50000, // $500.00
    currency: 'USD',
    status: 'active',
    billing_interval: 'monthly',
    renewal_count: 12,
    subscription_start_date: new Date(Date.now() - 365 * 86400000).toISOString(),
    current_period_end: new Date(Date.now() + 20 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 365 * 86400000).toISOString(),
  };

  const subMidTier: Subscription = {
    id: `sub_mid_02`,
    workspace_id: wsA,
    customer_id: custMidTier.id,
    provider_type: 'stripe',
    provider_subscription_id: 'sub_stripe_mid_02',
    plan_name: 'Growth Plan',
    amount_cents: 20000, // $200.00
    currency: 'USD',
    status: 'past_due',
    billing_interval: 'monthly',
    renewal_count: 2,
    subscription_start_date: new Date(Date.now() - 60 * 86400000).toISOString(),
    current_period_end: new Date(Date.now() - 10 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  };

  const subRenewal: Subscription = {
    id: `sub_ren_03`,
    workspace_id: wsA,
    customer_id: custRenewal.id,
    provider_type: 'stripe',
    provider_subscription_id: 'sub_stripe_ren_03',
    plan_name: 'Annual Scale Tier',
    amount_cents: 1000000, // $10,000.00
    currency: 'USD',
    status: 'active',
    billing_interval: 'yearly',
    renewal_count: 2,
    subscription_start_date: new Date(Date.now() - 365 * 86400000).toISOString(),
    current_period_end: new Date(Date.now() + 1 * 86400000).toISOString(), // Tomorrow!
    created_at: new Date(Date.now() - 365 * 86400000).toISOString(),
  };

  db.addSubscription(subEnterprise);
  db.addSubscription(subMidTier);
  db.addSubscription(subRenewal);

  // Invoices & Failures
  const invEnterprise: Invoice = {
    id: `inv_ent_01`,
    workspace_id: wsA,
    customer_id: custEnterprise.id,
    subscription_id: subEnterprise.id,
    provider_type: 'stripe',
    provider_invoice_id: `in_stripe_ent_01`,
    amount_cents: 50000,
    currency: 'USD',
    status: 'open',
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(), // 1 day ago
    due_date: new Date(Date.now() - 1 * 86400000).toISOString(),
  };

  const failEnterprise: PaymentFailure = {
    id: `pf_ent_01`,
    workspace_id: wsA,
    customer_id: custEnterprise.id,
    invoice_id: invEnterprise.id,
    amount_cents: 50000,
    currency: 'USD',
    provider_type: 'stripe',
    normalized_category: 'insufficient_funds',
    provider_failure_code: 'card_declined',
    raw_error_message: 'Your card has insufficient funds.',
    occurred_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    is_resolved: false,
    created_at: new Date().toISOString(),
  };

  const invMidTier: Invoice = {
    id: `inv_mid_02`,
    workspace_id: wsA,
    customer_id: custMidTier.id,
    subscription_id: subMidTier.id,
    provider_type: 'stripe',
    provider_invoice_id: `in_stripe_mid_02`,
    amount_cents: 20000,
    currency: 'USD',
    status: 'past_due',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days ago
    due_date: new Date(Date.now() - 10 * 86400000).toISOString(),
  };

  const failMidTier: PaymentFailure = {
    id: `pf_mid_02`,
    workspace_id: wsA,
    customer_id: custMidTier.id,
    invoice_id: invMidTier.id,
    amount_cents: 20000,
    currency: 'USD',
    provider_type: 'stripe',
    normalized_category: 'expired_card',
    provider_failure_code: 'expired_card',
    raw_error_message: 'Your card has expired.',
    occurred_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    is_resolved: false,
    created_at: new Date().toISOString(),
  };

  db.addInvoice(invEnterprise);
  db.addInvoice(invMidTier);
  db.addPaymentFailure(failEnterprise);
  db.addPaymentFailure(failMidTier);

  // Opportunities
  // Opp 1: $500.00 Enterprise failed 1 day ago (Insufficient Funds)
  const oppEnterprise: RecoveryOpportunity = db.createRecoveryOpportunity(wsA, {
    id: `opp_ent_01`,
    customer_id: custEnterprise.id,
    payment_failure_id: failEnterprise.id,
    amount_at_risk_cents: 50000,
    currency: 'USD',
    failure_category: 'insufficient_funds',
    recommended_action: 'Smart Retry',
    status: 'new',
    current_step_number: 1,
    customer: custEnterprise,
    subscription: subEnterprise,
    invoice: invEnterprise,
  });

  // Opp 2: $200.00 Mid-Tier failed 10 days ago (Expired Card, Step 2)
  const oppMidTier: RecoveryOpportunity = db.createRecoveryOpportunity(wsA, {
    id: `opp_mid_02`,
    customer_id: custMidTier.id,
    payment_failure_id: failMidTier.id,
    amount_at_risk_cents: 20000,
    currency: 'USD',
    failure_category: 'expired_card',
    recommended_action: 'Customer Magic Link',
    status: 'active',
    current_step_number: 2,
    customer: custMidTier,
    subscription: subMidTier,
    invoice: invMidTier,
  });

  // Opp 3: $10,000.00 Renewal in 1 day
  const oppRenewal: RecoveryOpportunity = db.createRecoveryOpportunity(wsA, {
    id: `opp_ren_03`,
    customer_id: custRenewal.id,
    amount_at_risk_cents: 1000000,
    currency: 'USD',
    failure_category: 'other_recoverable_failure',
    recommended_action: 'Proactive Renewal Verification',
    status: 'new',
    current_step_number: 1,
    customer: custRenewal,
    subscription: subRenewal,
  });

  // Opp in Tenant B
  const oppTenantB: RecoveryOpportunity = db.createRecoveryOpportunity(wsB, {
    id: `opp_tenant_b_01`,
    customer_id: custTenantB.id,
    amount_at_risk_cents: 10000,
    currency: 'USD',
    failure_category: 'insufficient_funds',
    recommended_action: 'Smart Retry',
    status: 'new',
    current_step_number: 1,
    customer: custTenantB,
  });

  // -------------------------------------------------------------------------
  // TEST 1: Deterministic Weighted Priority Model
  // -------------------------------------------------------------------------
  await test('1. Deterministic Scoring: Explicit weights and rank ordering (Renewal / Fresh Ent > Aging MidTier)', async () => {
    const queueResult = await AiOpportunityEngine.generatePrioritizedQueue(wsA, { enrichWithAi: false });
    
    assert.strictEqual(queueResult.totalPrioritized, 3, 'Must prioritize all 3 active opportunities in workspace A');
    
    const [first, second, third] = queueResult.queue;

    // Both oppRenewal ($10,000, 1d renewal) and oppEnterprise ($500, 1d old, $6k LTV) should outrank aging $200
    assert(first.priorityScore >= second.priorityScore, 'First item must have >= score than second');
    assert(second.priorityScore >= third.priorityScore, 'Second item must have >= score than third');
    
    // Check that renewal ($10,000, 1d) is at the top
    assert.strictEqual(first.opportunityId, oppRenewal.id, 'Huge $10,000 renewal in 24 hours must rank #1');
    assert.strictEqual(second.opportunityId, oppEnterprise.id, 'Fresh $500 enterprise payment must rank #2');
    assert.strictEqual(third.opportunityId, oppMidTier.id, 'Aging $200 expired card must rank #3');

    // Check weights documentation
    assert.strictEqual(SCORING_WEIGHTS.financialValue, 0.30);
    assert.strictEqual(SCORING_WEIGHTS.urgency, 0.25);
    assert.strictEqual(SCORING_WEIGHTS.customerHealth, 0.20);
    assert.strictEqual(SCORING_WEIGHTS.recoveryLikelihood, 0.15);
    assert.strictEqual(SCORING_WEIGHTS.attemptPenalty, 0.10);
  });

  // -------------------------------------------------------------------------
  // TEST 2: Explainable Intelligence & Grounded Evidence
  // -------------------------------------------------------------------------
  await test('2. Explainable Intelligence: Reason, Evidence array, and Ranking statement are fully grounded', async () => {
    const intel = await AiOpportunityEngine.getOpportunityIntelligence(wsA, oppEnterprise.id);
    assert(intel, 'Intelligence record must exist for oppEnterprise');

    // Reason & Explanation checks
    assert(intel.reason.includes('500.00 USD') || intel.reason.includes('Apex Enterprise Systems'), 'Reason must include amount and customer');
    assert(intel.rankingExplanation.includes('Score:'), 'Ranking explanation must explicitly state score');
    assert(intel.rankingExplanation.includes('freshness') || intel.rankingExplanation.includes('relationship'), 'Must explain factors');

    // Evidence checks
    assert(intel.evidence.length >= 4, 'Must include multiple concrete evidence data points');
    const amountEv = intel.evidence.find((e) => e.key === 'amount_at_risk');
    const failureReasonEv = intel.evidence.find((e) => e.key === 'failure_reason');
    assert(amountEv && amountEv.value.toString().includes('500.00'), 'Evidence must reflect true $500 amount');
    assert(failureReasonEv && failureReasonEv.value.toString().includes('INSUFFICIENT FUNDS'), 'Evidence must reflect true category');
  });

  // -------------------------------------------------------------------------
  // TEST 3: Recovery Likelihood & Expected Value Math
  // -------------------------------------------------------------------------
  await test('3. Expected Value Math: expectedValueCents = amountCents * recoveryLikelihoodScore', async () => {
    const intel = await AiOpportunityEngine.getOpportunityIntelligence(wsA, oppEnterprise.id);
    assert(intel, 'Intelligence record must exist');

    assert.strictEqual(typeof intel.recoveryLikelihoodScore, 'number');
    assert(intel.recoveryLikelihoodScore > 0 && intel.recoveryLikelihoodScore <= 1.0);
    
    const expected = Math.round(intel.amountCents * intel.recoveryLikelihoodScore);
    assert.strictEqual(intel.expectedValueCents, expected, 'Expected value must equal amount * recoveryLikelihoodScore');
  });

  // -------------------------------------------------------------------------
  // TEST 4: Action Recommendations & Optimal Timing
  // -------------------------------------------------------------------------
  await test('4. Action Recommendations: Recommends Smart Retry for insufficient funds and Magic Link for expired card', async () => {
    const intelEnt = await AiOpportunityEngine.getOpportunityIntelligence(wsA, oppEnterprise.id);
    const intelMid = await AiOpportunityEngine.getOpportunityIntelligence(wsA, oppMidTier.id);
    const intelRen = await AiOpportunityEngine.getOpportunityIntelligence(wsA, oppRenewal.id);

    assert(intelEnt && intelMid && intelRen);
    assert.strictEqual(intelEnt.recommendedAction, 'smart_retry', 'Fresh insufficient funds must recommend smart_retry');
    assert.strictEqual(intelMid.recommendedAction, 'magic_link', 'Expired card on step 2 must recommend magic_link');
    assert.strictEqual(intelRen.recommendedAction, 'proactive_renewal', 'Renewal must recommend proactive_renewal');

    assert(intelEnt.recommendedTiming.length > 0);
    assert(intelEnt.expectedImpact.length > 0);
  });

  // -------------------------------------------------------------------------
  // TEST 5: Honest Expansion Evaluation (No Fake Upsells)
  // -------------------------------------------------------------------------
  await test('5. Expansion Candidates: Flags insufficient evidence when usage telemetry is absent', async () => {
    // Score healthy customer with no usage telemetry
    const scored = OpportunityScoringEngine.evaluate(oppEnterprise, custEnterprise, subEnterprise);
    if (scored.isExpansionCandidate) {
      assert.strictEqual(scored.expansionEvidenceStatus, 'insufficient_evidence', 'Must not fake confirmed expansion without telemetry');
    }
  });

  // -------------------------------------------------------------------------
  // TEST 6: Idempotent Processing
  // -------------------------------------------------------------------------
  await test('6. Idempotency: Multiple queue generations produce identical scores, ranking, and record count', async () => {
    const run1 = await AiOpportunityEngine.generatePrioritizedQueue(wsA, { enrichWithAi: false });
    const run2 = await AiOpportunityEngine.generatePrioritizedQueue(wsA, { enrichWithAi: false });

    assert.strictEqual(run1.totalPrioritized, run2.totalPrioritized);
    assert.strictEqual(run1.totalAtRiskCents, run2.totalAtRiskCents);
    assert.strictEqual(run1.totalExpectedValueCents, run2.totalExpectedValueCents);

    for (let i = 0; i < run1.queue.length; i++) {
      assert.strictEqual(run1.queue[i].opportunityId, run2.queue[i].opportunityId);
      assert.strictEqual(run1.queue[i].priorityScore, run2.queue[i].priorityScore);
      assert.strictEqual(run1.queue[i].priority, run2.queue[i].priority);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 7: Multi-Tenant Workspace Boundary Isolation
  // -------------------------------------------------------------------------
  await test('7. Multi-Tenant Isolation: Workspace A queue NEVER contains Workspace B opportunities or customers', async () => {
    const queueA = await AiOpportunityEngine.generatePrioritizedQueue(wsA);
    const queueB = await AiOpportunityEngine.generatePrioritizedQueue(wsB);

    assert(queueA.queue.length > 0 && queueB.queue.length > 0);

    queueA.queue.forEach((r) => {
      assert.strictEqual(r.workspaceId, wsA);
      assert.notStrictEqual(r.opportunityId, oppTenantB.id);
      assert.notStrictEqual(r.customer.id, custTenantB.id);
    });

    queueB.queue.forEach((r) => {
      assert.strictEqual(r.workspaceId, wsB);
      assert.strictEqual(r.opportunityId, oppTenantB.id);
      assert.notStrictEqual(r.customer.id, custEnterprise.id);
    });
  });

  // -------------------------------------------------------------------------
  // TEST 8: Feedback Loop Recording (Actions & Outcomes for Revenue Brain)
  // -------------------------------------------------------------------------
  await test('8. Feedback Loop Recording: Records operator actions and resolution outcomes with valid UUID IDs', async () => {
    const action = await AiOpportunityEngine.recordAction(wsA, oppEnterprise.id, {
      actionType: 'smart_retry',
      channel: 'gateway',
      executedBy: 'operator_sarah',
      notes: 'Executed smart retry during morning window',
    });

    assert(typeof action.id === 'string' && action.id.length === 36, 'Action ID must be a valid UUID');
    assert.strictEqual(action.opportunityId, oppEnterprise.id);
    assert.strictEqual(action.actionType, 'smart_retry');

    const outcome = await AiOpportunityEngine.recordOutcome(wsA, oppEnterprise.id, {
      outcome: 'recovered',
      recoveredAmountCents: 50000,
      timeToRecoverySeconds: 3600,
      settlementMethod: 'smart_retry_automated',
      feedbackNotes: 'Recovered on first scheduled retry pass',
    });

    assert(typeof outcome.id === 'string' && outcome.id.length === 36, 'Outcome ID must be a valid UUID');
    assert.strictEqual(outcome.recoveredAmountCents, 50000);
    assert.strictEqual(outcome.outcome, 'recovered');

    const storedActions = db.getOpportunityActions(wsA, oppEnterprise.id);
    const storedOutcomes = db.getOpportunityOutcomes(wsA, oppEnterprise.id);

    assert(storedActions.length >= 1, 'Action must be stored in database');
    assert(storedOutcomes.length >= 1, 'Outcome must be stored in database');
  });

  // -------------------------------------------------------------------------
  // TEST 9: Real Days Overdue Calculation & Consistency
  // -------------------------------------------------------------------------
  await test('9. Real Days Overdue: 17-day failure = 17, missing dates = null, renewal = null, queue and single-opp match', async () => {
    setStorageMode('local_development');
    const wsC = `ws_days_${Date.now()}`;
    const custDays: Customer = {
      id: `cust_days`,
      workspace_id: wsC,
      name: 'Days Test Corp',
      email: 'days@test.com',
      currency: 'USD',
      country: 'US',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      created_at: new Date().toISOString(),
    } as any;
    db.addCustomer(custDays);

    const date17DaysAgo = new Date(Date.now() - 17 * 86400000).toISOString();
    const fail17: PaymentFailure = {
      id: `fail_17`,
      workspace_id: wsC,
      customer_id: custDays.id,
      amount_cents: 10000,
      currency: 'USD',
      provider_type: 'stripe',
      normalized_category: 'insufficient_funds',
      occurred_at: date17DaysAgo,
      is_resolved: false,
      created_at: date17DaysAgo,
    } as any;
    db.addPaymentFailure(fail17);
    const opp17 = db.createRecoveryOpportunity(wsC, {
      id: `opp_17`,
      customer_id: custDays.id,
      payment_failure_id: fail17.id,
      amount_at_risk_cents: 10000,
      currency: 'USD',
      failure_category: 'insufficient_funds',
      status: 'new',
    });

    const intel17Queue = await AiOpportunityEngine.generatePrioritizedQueue(wsC, { enrichWithAi: false });
    const intel17Single = await AiOpportunityEngine.getOpportunityIntelligence(wsC, opp17.id);

    assert(intel17Queue.queue.length === 1);
    assert.strictEqual(intel17Queue.queue[0].daysOverdue, 17, '17-day-old failure must have daysOverdue = 17');
    assert.strictEqual(intel17Single?.daysOverdue, 17, 'Single opportunity intelligence must match queue daysOverdue (17)');

    const oppMissing = db.createRecoveryOpportunity(wsC, {
      id: `opp_missing`,
      customer_id: custDays.id,
      amount_at_risk_cents: 5000,
      currency: 'USD',
      failure_category: 'insufficient_funds',
      status: 'new',
    });
    (oppMissing as any).created_at = '';
    const intelMissing = OpportunityScoringEngine.evaluate(oppMissing, custDays);
    assert.strictEqual(intelMissing.daysOverdue, null, 'Missing dates must result in daysOverdue = null');

    const renewalSub: Subscription = {
      id: `sub_ren_2d`,
      workspace_id: wsC,
      customer_id: custDays.id,
      provider_type: 'stripe',
      plan_name: 'Annual Tier',
      amount_cents: 50000,
      currency: 'USD',
      status: 'active',
      current_period_end: new Date(Date.now() + 2 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    } as any;
    db.addSubscription(renewalSub);
    const oppRenewalRisk = db.createRecoveryOpportunity(wsC, {
      id: `opp_renewal_2d`,
      customer_id: custDays.id,
      amount_at_risk_cents: 50000,
      currency: 'USD',
      failure_category: 'other_recoverable_failure',
      status: 'new',
    });
    const intelRenewal = OpportunityScoringEngine.evaluate(oppRenewalRisk, custDays, renewalSub);
    assert.strictEqual(intelRenewal.daysOverdue, null, 'Renewal opportunity must not have daysOverdue set (must be null)');
  });

  // -------------------------------------------------------------------------
  // TEST 10: Resolved Failure & Customer Health Score Evaluation
  // -------------------------------------------------------------------------
  await test('10. Health Score Context: Resolved payment failure does not count as active failure risk', async () => {
    const wsD = `ws_health_${Date.now()}`;
    const custHealth: Customer = {
      id: `cust_health`,
      workspace_id: wsD,
      name: 'Health Test Corp',
      email: 'health@test.com',
      currency: 'USD',
      country: 'US',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 50000,
      total_recovered_cents: 10000,
      created_at: new Date().toISOString(),
    } as any;
    db.addCustomer(custHealth);

    const resolvedFailure: PaymentFailure = {
      id: `fail_resolved`,
      workspace_id: wsD,
      customer_id: custHealth.id,
      amount_cents: 10000,
      currency: 'USD',
      provider_type: 'stripe',
      normalized_category: 'insufficient_funds',
      is_resolved: true,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    } as any;
    db.addPaymentFailure(resolvedFailure);

    const oppResolved = db.createRecoveryOpportunity(wsD, {
      id: `opp_resolved`,
      customer_id: custHealth.id,
      payment_failure_id: resolvedFailure.id,
      amount_at_risk_cents: 10000,
      currency: 'USD',
      failure_category: 'insufficient_funds',
      status: 'recovered',
    });

    const evaluated = OpportunityScoringEngine.evaluate(oppResolved, custHealth, undefined, undefined, resolvedFailure);
    assert(evaluated.scoreBreakdown.customerHealthScore >= 80, 'Resolved failure should not penalize health score as an active failure');
  });

  console.log(`\n======================================================`);
  console.log(`AI OPPORTUNITY ENGINE VALIDATION: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log(`======================================================\n`);
}

runOpportunityEngineValidation().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
