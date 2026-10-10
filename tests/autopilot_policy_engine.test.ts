import './setupEnv.js';
import assert from 'assert';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { AutopilotPolicyEngine } from '../server/services/autopilotPolicyEngine.js';
import { AutopilotService, DEFAULT_AUTOPILOT_SETTINGS } from '../server/services/autopilotService.js';
import { AutopilotDecision } from '../src/types/index.js';

async function runAutopilotPolicyEngineTests() {
  console.log('======================================================');
  console.log('REVENUE RECOVERY OS: AUTOPILOT POLICY ENGINE TEST SUITE');
  console.log('======================================================');

  setStorageMode('local_development');
  const timestamp = Date.now();

  // Setup test workspace
  const ws1 = db.createWorkspace(`Policy Tenant Alpha ${timestamp}`, 'saas', 'USD');
  const wsId1 = ws1.id;

  const ws2 = db.createWorkspace(`Policy Tenant Beta ${timestamp}`, 'saas', 'USD');
  const wsId2 = ws2.id;

  // -------------------------------------------------------------
  // Test 1: Fraud Always Blocked (Highest Priority Guardrail)
  // -------------------------------------------------------------
  console.log('1. Testing Fraud Always Blocked...');
  {
    // A. Explicit is_fraud: true
    const oppFraud = {
      id: `opp_fraud_${timestamp}`,
      amount_at_risk_cents: 2500, // Small $25 amount
      currency: 'USD',
      is_fraud: true,
      failure_category: 'fraud' as any,
    };
    const custStandard = {
      id: `cust_std_${timestamp}`,
      is_vip: false,
      is_enterprise: false,
    };
    const res1 = AutopilotPolicyEngine.evaluate(oppFraud, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(res1.decision, 'BLOCKED', 'Fraud flag must produce BLOCKED decision');
    assert.strictEqual(res1.rule_evaluated, 'BLOCKED_FRAUD');
    assert.ok(res1.reason.toLowerCase().includes('fraud'), 'Reason must explicitly state fraud was detected');

    // B. Fraud via failure message or code
    const oppFraudCode = {
      id: `opp_fraud_code_${timestamp}`,
      amount_at_risk_cents: 1000,
      payment_failure: {
        provider_failure_code: 'suspected_fraud',
        raw_error_message: 'High risk fraud score detected by issuer.',
      } as any,
    };
    const res2 = AutopilotPolicyEngine.evaluate(oppFraudCode, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(res2.decision, 'BLOCKED', 'Suspected fraud failure code must produce BLOCKED decision');
    assert.strictEqual(res2.rule_evaluated, 'BLOCKED_FRAUD');

    // C. Fraud on a VIP customer: Fraud ALWAYS takes precedence over VIP Manual Review
    const custVip = {
      id: `cust_vip_${timestamp}`,
      is_vip: true,
    };
    const resVipFraud = AutopilotPolicyEngine.evaluate(oppFraud, custVip, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resVipFraud.decision, 'BLOCKED', 'Fraud must always take precedence over VIP manual review');

    // D. Stolen card
    const oppStolen = {
      id: `opp_stolen_${timestamp}`,
      amount_at_risk_cents: 5000,
      payment_failure: { provider_failure_code: 'stolen_card' } as any,
    };
    const resStolen = AutopilotPolicyEngine.evaluate(oppStolen, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resStolen.decision, 'BLOCKED');
    assert.strictEqual(resStolen.rule_evaluated, 'BLOCKED_STOLEN_CARD');
    assert.ok(resStolen.reason.toLowerCase().includes('stolen'));

    // E. Lost card
    const oppLost = {
      id: `opp_lost_${timestamp}`,
      amount_at_risk_cents: 5000,
      payment_failure: { provider_failure_code: 'lost_card' } as any,
    };
    const resLost = AutopilotPolicyEngine.evaluate(oppLost, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resLost.decision, 'BLOCKED');
    assert.strictEqual(resLost.rule_evaluated, 'BLOCKED_LOST_CARD');
    assert.ok(resLost.reason.toLowerCase().includes('lost'));

    // F. Chargeback
    const oppChargeback = {
      id: `opp_cb_${timestamp}`,
      amount_at_risk_cents: 5000,
      is_chargeback: true,
    };
    const resCb = AutopilotPolicyEngine.evaluate(oppChargeback, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resCb.decision, 'BLOCKED');
    assert.strictEqual(resCb.rule_evaluated, 'BLOCKED_CHARGEBACK');
    assert.ok(resCb.reason.toLowerCase().includes('chargeback'));

    // G. Active Dispute
    const oppDispute = {
      id: `opp_disp_${timestamp}`,
      amount_at_risk_cents: 5000,
      has_active_dispute: true,
      dispute_status: 'active' as const,
    };
    const resDisp = AutopilotPolicyEngine.evaluate(oppDispute, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resDisp.decision, 'BLOCKED');
    assert.strictEqual(resDisp.rule_evaluated, 'BLOCKED_ACTIVE_DISPUTE');
    assert.strictEqual(resDisp.reason, 'Customer has active dispute.');

    console.log('✓ Fraud, stolen/lost card, chargeback, and dispute rules verified as ALWAYS BLOCKED.');
  }

  // -------------------------------------------------------------
  // Test 2: VIP Always Manual Review
  // -------------------------------------------------------------
  console.log('2. Testing VIP Customer Protection...');
  {
    const oppStandardSoft = {
      id: `opp_soft_${timestamp}`,
      amount_at_risk_cents: 4900, // $49 (well below $500 threshold)
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };

    // A. VIP via is_vip: true
    const custVip = {
      id: `cust_vip_${timestamp}`,
      name: 'Sarah Connor',
      is_vip: true,
    };
    const resVip = AutopilotPolicyEngine.evaluate(oppStandardSoft, custVip, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resVip.decision, 'MANUAL_REVIEW', 'VIP customer must require manual review');
    assert.strictEqual(resVip.rule_evaluated, 'MANUAL_REVIEW_VIP_CUSTOMER');
    assert.ok(resVip.reason.toLowerCase().includes('vip'));

    // B. VIP via tier
    const custTierVip = {
      id: `cust_tier_vip_${timestamp}`,
      tier: 'vip',
    };
    const resTierVip = AutopilotPolicyEngine.evaluate(oppStandardSoft, custTierVip, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resTierVip.decision, 'MANUAL_REVIEW');

    // C. VIP via tag
    const custTagVip = {
      id: `cust_tag_vip_${timestamp}`,
      tags: ['vip', 'key_account'],
    };
    const resTagVip = AutopilotPolicyEngine.evaluate(oppStandardSoft, custTagVip, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resTagVip.decision, 'MANUAL_REVIEW');

    // D. VIP Protection turned OFF in settings -> allows autonomous recovery
    const settingsNoVip = {
      ...DEFAULT_AUTOPILOT_SETTINGS,
      vip_customer_protection: false,
    };
    const resVipOff = AutopilotPolicyEngine.evaluate(oppStandardSoft, custVip, ws1, settingsNoVip);
    assert.strictEqual(resVipOff.decision, 'AUTONOMOUS', 'When VIP protection is OFF, soft declines should be autonomous');

    console.log('✓ VIP customer protection verified.');
  }

  // -------------------------------------------------------------
  // Test 3: Enterprise Account & High Risk Protections
  // -------------------------------------------------------------
  console.log('3. Testing Enterprise & High Risk Protections...');
  {
    const oppStandardSoft = {
      id: `opp_soft_ent_${timestamp}`,
      amount_at_risk_cents: 9900, // $99
      payment_failure: { provider_failure_code: 'card_declined' } as any,
    };

    // Enterprise customer
    const custEnt = {
      id: `cust_ent_${timestamp}`,
      is_enterprise: true,
      account_type: 'enterprise' as const,
    };
    const resEnt = AutopilotPolicyEngine.evaluate(oppStandardSoft, custEnt, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resEnt.decision, 'MANUAL_REVIEW');
    assert.strictEqual(resEnt.rule_evaluated, 'MANUAL_REVIEW_ENTERPRISE_ACCOUNT');
    assert.ok(resEnt.reason.toLowerCase().includes('enterprise'));

    // Enterprise protection turned OFF
    const settingsNoEnt = {
      ...DEFAULT_AUTOPILOT_SETTINGS,
      enterprise_account_protection: false,
    };
    const resEntOff = AutopilotPolicyEngine.evaluate(oppStandardSoft, custEnt, ws1, settingsNoEnt);
    assert.strictEqual(resEntOff.decision, 'AUTONOMOUS');

    // High risk account
    const custHighRisk = {
      id: `cust_risk_${timestamp}`,
      is_high_risk: true,
      risk_score: 85,
    };
    const resRisk = AutopilotPolicyEngine.evaluate(oppStandardSoft, custHighRisk, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resRisk.decision, 'MANUAL_REVIEW');
    assert.strictEqual(resRisk.rule_evaluated, 'MANUAL_REVIEW_HIGH_RISK_ACCOUNT');
    assert.ok(resRisk.reason.toLowerCase().includes('high risk'));

    console.log('✓ Enterprise and High Risk account protections verified.');
  }

  // -------------------------------------------------------------
  // Test 4: Thresholds Work Correctly ($100, $500, $1000, Custom)
  // -------------------------------------------------------------
  console.log('4. Testing Auto-Recover Up To Thresholds...');
  {
    const custStandard = { id: `cust_std_${timestamp}`, is_vip: false, is_enterprise: false };

    // Default threshold is $500 (50,000 cents)
    const oppUnder500 = {
      id: `opp_u500_${timestamp}`,
      amount_at_risk_cents: 49900, // $499
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };
    const resUnder500 = AutopilotPolicyEngine.evaluate(oppUnder500, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resUnder500.decision, 'AUTONOMOUS', 'Invoice under $500 threshold must be AUTONOMOUS');

    const oppAt500 = {
      id: `opp_at500_${timestamp}`,
      amount_at_risk_cents: 50000, // $500 exact
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };
    const resAt500 = AutopilotPolicyEngine.evaluate(oppAt500, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resAt500.decision, 'AUTONOMOUS', 'Invoice equal to $500 threshold must be AUTONOMOUS');

    const oppOver500 = {
      id: `opp_o500_${timestamp}`,
      amount_at_risk_cents: 50100, // $501
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };
    const resOver500 = AutopilotPolicyEngine.evaluate(oppOver500, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resOver500.decision, 'MANUAL_REVIEW', 'Invoice exceeding $500 threshold must require MANUAL_REVIEW');
    assert.strictEqual(resOver500.rule_evaluated, 'MANUAL_REVIEW_THRESHOLD_EXCEEDED');
    assert.strictEqual(resOver500.reason, 'Invoice exceeds automatic recovery limit.');

    // Preset $100 (10,000 cents)
    const settings100 = {
      ...DEFAULT_AUTOPILOT_SETTINGS,
      auto_recover_limit_cents: 10000,
      auto_recover_preset: '100' as const,
    };
    const opp120 = {
      id: `opp_120_${timestamp}`,
      amount_at_risk_cents: 12000, // $120
      payment_failure: { provider_failure_code: 'card_declined' } as any,
    };
    const res120 = AutopilotPolicyEngine.evaluate(opp120, custStandard, ws1, settings100);
    assert.strictEqual(res120.decision, 'MANUAL_REVIEW', '$120 invoice with $100 limit must require MANUAL_REVIEW');

    const opp80 = {
      id: `opp_80_${timestamp}`,
      amount_at_risk_cents: 8000, // $80
      payment_failure: { provider_failure_code: 'card_declined' } as any,
    };
    const res80 = AutopilotPolicyEngine.evaluate(opp80, custStandard, ws1, settings100);
    assert.strictEqual(res80.decision, 'AUTONOMOUS', '$80 invoice with $100 limit must be AUTONOMOUS');

    // Preset $1000 (100,000 cents)
    const settings1000 = {
      ...DEFAULT_AUTOPILOT_SETTINGS,
      auto_recover_limit_cents: 100000,
      auto_recover_preset: '1000' as const,
    };
    const opp750 = {
      id: `opp_750_${timestamp}`,
      amount_at_risk_cents: 75000, // $750
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };
    const res750 = AutopilotPolicyEngine.evaluate(opp750, custStandard, ws1, settings1000);
    assert.strictEqual(res750.decision, 'AUTONOMOUS', '$750 invoice with $1000 limit must be AUTONOMOUS');

    // Custom threshold $250 (25,000 cents)
    const settingsCustom = {
      ...DEFAULT_AUTOPILOT_SETTINGS,
      auto_recover_limit_cents: 25000,
      auto_recover_preset: 'custom' as const,
    };
    const opp260 = {
      id: `opp_260_${timestamp}`,
      amount_at_risk_cents: 26000, // $260
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };
    const res260 = AutopilotPolicyEngine.evaluate(opp260, custStandard, ws1, settingsCustom);
    assert.strictEqual(res260.decision, 'MANUAL_REVIEW');

    console.log('✓ Threshold rules ($100, $500, $1000, Custom) verified.');
  }

  // -------------------------------------------------------------
  // Test 5: Soft Declines Become Autonomous
  // -------------------------------------------------------------
  console.log('5. Testing Soft Declines Become Autonomous...');
  {
    const custStandard = { id: `cust_std_${timestamp}`, is_vip: false, is_enterprise: false };

    // A. Insufficient Funds
    const oppNsf = {
      id: `opp_nsf_${timestamp}`,
      amount_at_risk_cents: 4500,
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };
    const resNsf = AutopilotPolicyEngine.evaluate(oppNsf, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resNsf.decision, 'AUTONOMOUS');
    assert.strictEqual(resNsf.rule_evaluated, 'AUTONOMOUS_INSUFFICIENT_FUNDS');
    assert.strictEqual(resNsf.reason, 'Insufficient funds qualifies for automatic recovery.');

    // B. Temporary Provider Failure
    const oppTemp = {
      id: `opp_temp_${timestamp}`,
      amount_at_risk_cents: 4500,
      payment_failure: { provider_failure_code: 'temporary_failure' } as any,
    };
    const resTemp = AutopilotPolicyEngine.evaluate(oppTemp, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resTemp.decision, 'AUTONOMOUS');
    assert.strictEqual(resTemp.rule_evaluated, 'AUTONOMOUS_PROVIDER_FAILURE');
    assert.strictEqual(resTemp.reason, 'Temporary provider failure qualifies for automatic recovery.');

    // C. Generic Soft Decline
    const oppSoft = {
      id: `opp_soft_decl_${timestamp}`,
      amount_at_risk_cents: 4500,
      payment_failure: { provider_failure_code: 'soft_decline' } as any,
    };
    const resSoft = AutopilotPolicyEngine.evaluate(oppSoft, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resSoft.decision, 'AUTONOMOUS');
    assert.strictEqual(resSoft.rule_evaluated, 'AUTONOMOUS_SOFT_DECLINE');
    assert.strictEqual(resSoft.reason, 'Soft decline qualifies for automatic recovery.');

    // D. Standard customer below threshold
    const oppStd = {
      id: `opp_std_${timestamp}`,
      amount_at_risk_cents: 2900,
    };
    const resStd = AutopilotPolicyEngine.evaluate(oppStd, custStandard, ws1, DEFAULT_AUTOPILOT_SETTINGS);
    assert.strictEqual(resStd.decision, 'AUTONOMOUS');

    console.log('✓ Soft declines correctly classified as AUTONOMOUS.');
  }

  // -------------------------------------------------------------
  // Test 6: Multi-Tenant Isolation
  // -------------------------------------------------------------
  console.log('6. Testing Multi-Tenant Isolation...');
  {
    // Tenant 1 configures threshold = $100
    AutopilotService.updateSettings(wsId1, {
      auto_recover_limit_cents: 10000,
      auto_recover_preset: '100',
      vip_customer_protection: true,
    });

    // Tenant 2 configures threshold = $1000
    AutopilotService.updateSettings(wsId2, {
      auto_recover_limit_cents: 100000,
      auto_recover_preset: '1000',
      vip_customer_protection: false,
    });

    // Test Opportunity: $350 invoice
    const customer = { id: `cust_shared_${timestamp}`, is_vip: false };
    const opp350 = {
      id: `opp_350_${timestamp}`,
      amount_at_risk_cents: 35000, // $350
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };

    // Evaluated in Tenant 1 (limit $100) -> Exceeds threshold -> MANUAL_REVIEW
    const resTenant1 = AutopilotPolicyEngine.evaluate(opp350, customer, ws1, AutopilotService.getSettings(wsId1));
    assert.strictEqual(resTenant1.decision, 'MANUAL_REVIEW', 'Tenant 1 limit of $100 must flag $350 as MANUAL_REVIEW');

    // Evaluated in Tenant 2 (limit $1000) -> Under threshold -> AUTONOMOUS
    const resTenant2 = AutopilotPolicyEngine.evaluate(opp350, customer, ws2, AutopilotService.getSettings(wsId2));
    assert.strictEqual(resTenant2.decision, 'AUTONOMOUS', 'Tenant 2 limit of $1000 must classify $350 as AUTONOMOUS');

    // Audit logs recorded in Tenant 1 must never be returned in Tenant 2
    AutopilotPolicyEngine.recordAuditEntry(wsId1, {
      opportunity_id: opp350.id,
      customer_id: customer.id,
      rule_evaluated: resTenant1.rule_evaluated,
      decision: resTenant1.decision,
      reason: resTenant1.reason,
    });

    const logsT1 = AutopilotPolicyEngine.getAuditLogs(wsId1);
    const logsT2 = AutopilotPolicyEngine.getAuditLogs(wsId2);

    assert.ok(logsT1.some((l) => l.opportunity_id === opp350.id), 'Audit log must exist in Tenant 1');
    assert.ok(!logsT2.some((l) => l.opportunity_id === opp350.id), 'Audit log must NOT exist in Tenant 2');

    console.log('✓ Multi-tenant policy isolation strictly verified.');
  }

  // -------------------------------------------------------------
  // Test 7: Deterministic Behavior
  // -------------------------------------------------------------
  console.log('7. Testing Deterministic Behavior...');
  {
    const opp = {
      id: `opp_det_${timestamp}`,
      amount_at_risk_cents: 15000,
      payment_failure: { provider_failure_code: 'insufficient_funds' } as any,
    };
    const cust = { id: `cust_det_${timestamp}` };

    const baseline = AutopilotPolicyEngine.evaluate(opp, cust, ws1, DEFAULT_AUTOPILOT_SETTINGS);

    // Repeat 20 times — verify bit-for-bit deterministic output
    for (let i = 0; i < 20; i++) {
      const res = AutopilotPolicyEngine.evaluate(opp, cust, ws1, DEFAULT_AUTOPILOT_SETTINGS);
      assert.strictEqual(res.decision, baseline.decision);
      assert.strictEqual(res.reason, baseline.reason);
      assert.strictEqual(res.rule_evaluated, baseline.rule_evaluated);
    }

    console.log('✓ 100% deterministic decision consistency verified.');
  }

  // -------------------------------------------------------------
  // Test 8: End-to-End Opportunity Ingestion & Decision Persistence
  // -------------------------------------------------------------
  console.log('8. Testing Opportunity Ingestion & Policy Evaluation...');
  {
    // Create customer and failed invoice in Tenant 1
    const testCust = db.createCustomer(wsId1, {
      name: 'Michael Corleone',
      email: `michael_${timestamp}@example.com`,
      country: 'US',
      currency: 'USD',
      provider_type: 'stripe',
    });

    const failureRes = db.createManualFailedInvoice(wsId1, {
      customerId: testCust.id,
      amountCents: 15000, // $150
      currency: 'USD',
      providerFailureCode: 'insufficient_funds',
      rawErrorMessage: 'Insufficient balance on card account.',
    });

    assert.ok(failureRes.opportunity, 'Failed invoice must generate opportunity');

    // Run evaluateAndLog
    const evaluated = AutopilotPolicyEngine.evaluateAndLog(wsId1, failureRes.opportunity.id);
    assert.ok(evaluated, 'Policy evaluation must return result');

    // Verify stored opportunity has policy_decision attached
    const storedOpp = db.getOpportunityById(failureRes.opportunity.id, wsId1);
    assert.ok(storedOpp?.policy_decision, 'Stored opportunity must retain policy_decision');
    assert.strictEqual(storedOpp?.policy_decision?.rule_evaluated, evaluated.rule_evaluated);

    // Verify policy audit log entry is recorded
    const auditLogs = AutopilotPolicyEngine.getAuditLogs(wsId1, failureRes.opportunity.id);
    assert.ok(auditLogs.length >= 1, 'Policy audit log must contain entry for the opportunity');
    assert.strictEqual(auditLogs[0].rule_evaluated, evaluated.rule_evaluated);
    assert.strictEqual(auditLogs[0].decision, evaluated.decision);
    assert.strictEqual(auditLogs[0].reason, evaluated.reason);
    assert.ok(auditLogs[0].timestamp, 'Policy audit entry must include ISO timestamp');

    console.log('✓ End-to-end policy evaluation and audit log persistence verified.');
  }

  console.log('======================================================');
  console.log('ALL AUTOPILOT POLICY ENGINE TESTS PASSED (100%)');
  console.log('======================================================');
}

runAutopilotPolicyEngineTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
