/**
 * Automated Test Suite: Revenue Recovery OS - Revenue Leak Scanner Financial Model Validation
 *
 * Implements the 20 Mandatory Validation Tests:
 * 1. payment failure + same invoice = counted once
 * 2. multiple payment failures on same invoice = counted once
 * 3. existing recovery opportunity does not increase totalAtRisk
 * 4. repeated-failure vector does not add duplicate financial exposure
 * 5. normal upcoming renewal is NOT a revenue leak
 * 6. failed renewal can become confirmed risk when evidence exists
 * 7. churn risk does not inflate totalAtRisk
 * 8. expansion does not inflate totalAtRisk
 * 9. expansion never appears as recovered/recoverable billing loss
 * 10. invoice-only leak does not create invalid recovery_opportunity row
 * 11. payment-failure opportunity contains valid payment_failure_id
 * 12. scanner is idempotent across repeated runs
 * 13. workspace isolation
 * 14. dry-run produces no writes
 * 15. no Math.random in financial calculations
 * 16. currency totals remain correct for mixed currencies
 * 17. Supabase persistence rejects invalid relationships
 * 18. partial processing does not silently lose records
 * 19. scanner totals are deterministic
 * 20. empty workspace returns honest zero/insufficient-data state
 */

import './setupEnv.js';
import assert from 'assert';
import fs from 'fs';
import { db } from '../server/store/db.js';
import { setStorageMode } from '../server/db/storageMode.js';
import { setSupabaseServerClientOverride } from '../server/db/supabaseClient.js';
import { supabaseService } from '../server/db/supabaseService.js';
import { RevenueLeakScanner } from '../server/scanner/revenueScanner.js';
import { ExpansionFinderEngine } from '../server/intelligence/expansionFinder.js';
import { calculateCanonicalFinancials } from '../server/scanner/canonicalFinancials.js';
import { Customer, Subscription, Invoice, PaymentFailure, RecoveryOpportunity } from '../src/types/index.js';

setStorageMode('local_development');
db.setPersistenceEnabled(false);

let passedTests = 0;
let totalTests = 0;

function createTestPaymentFailure(
  data: Partial<PaymentFailure> & { id: string; workspace_id: string; customer_id: string; amount_cents: number; currency: string }
): PaymentFailure {
  return {
    provider_type: 'stripe',
    normalized_category: 'insufficient_funds',
    provider_failure_code: 'card_declined',
    raw_error_message: 'Payment failed',
    occurred_at: new Date().toISOString(),
    is_resolved: false,
    created_at: new Date().toISOString(),
    ...data,
  };
}

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

async function runScannerValidation() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY OS: REVENUE LEAK SCANNER VALIDATION');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Payment failure + same invoice = counted once
  // -------------------------------------------------------------------------
  await test('1. Payment failure + same invoice = counted once (no double counting)', async () => {
    const wsId = `ws_t1_${Date.now()}`;
    db.addCustomer({
      id: `cust_t1`,
      workspace_id: wsId,
      name: 'Alpha Ltd',
      email: 'alpha@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const invoice: Invoice = {
      id: `inv_t1`,
      workspace_id: wsId,
      customer_id: `cust_t1`,
      provider_type: 'stripe',
      provider_invoice_id: `in_t1_123`,
      amount_cents: 5000,
      currency: 'USD',
      status: 'past_due',
      created_at: new Date().toISOString(),
      due_date: new Date().toISOString(),
    };
    db.addInvoice(invoice);

    const paymentFailure = createTestPaymentFailure({
      id: `pf_t1`,
      workspace_id: wsId,
      customer_id: `cust_t1`,
      invoice_id: invoice.id,
      amount_cents: 5000,
      currency: 'USD',
    });
    db.addPaymentFailure(paymentFailure);

    const res = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(res.totalAtRiskCents, 5000, 'Must count canonical obligation exactly once as 5000, not 10000');
    assert.strictEqual(res.vectors[0].amountAtRiskCents, 5000, 'Vector 1 amount at risk must be 5000');
    assert.strictEqual(res.vectors[0].detectedCount, 1, 'Only 1 canonical leak detected');
  });

  // -------------------------------------------------------------------------
  // TEST 2: Multiple payment failures on same invoice = counted once
  // -------------------------------------------------------------------------
  await test('2. Multiple payment failures on same invoice = counted once', async () => {
    const wsId = `ws_t2_${Date.now()}`;
    db.addCustomer({
      id: `cust_t2`,
      workspace_id: wsId,
      name: 'Beta Ltd',
      email: 'beta@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t2',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const invoice: Invoice = {
      id: `inv_t2`,
      workspace_id: wsId,
      customer_id: `cust_t2`,
      provider_type: 'stripe',
      provider_invoice_id: `in_t2_123`,
      amount_cents: 7500,
      currency: 'USD',
      status: 'past_due',
      created_at: new Date().toISOString(),
      due_date: new Date().toISOString(),
    };
    db.addInvoice(invoice);

    // Three consecutive failed attempts on the same invoice
    for (let i = 1; i <= 3; i++) {
      db.addPaymentFailure(
        createTestPaymentFailure({
          id: `pf_t2_${i}`,
          workspace_id: wsId,
          customer_id: `cust_t2`,
          invoice_id: invoice.id,
          amount_cents: 7500,
          currency: 'USD',
          normalized_category: 'payment_method_declined',
          raw_error_message: 'Declined',
          occurred_at: new Date(Date.now() - (4 - i) * 3600000).toISOString(),
        })
      );
    }

    const res = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(res.totalAtRiskCents, 7500, 'Must not sum 3 failures of 7500 on same invoice into 22500');
    assert.strictEqual(res.vectors[0].detectedCount, 1, 'Only 1 canonical leak detected');
  });

  // -------------------------------------------------------------------------
  // TEST 3: Existing recovery opportunity does not increase totalAtRisk
  // -------------------------------------------------------------------------
  await test('3. Existing recovery opportunity does not increase totalAtRisk', async () => {
    const wsId = `ws_t3_${Date.now()}`;
    db.addCustomer({
      id: `cust_t3`,
      workspace_id: wsId,
      name: 'Gamma Ltd',
      email: 'gamma@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 20000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t3',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const pf = createTestPaymentFailure({
      id: `pf_t3`,
      workspace_id: wsId,
      customer_id: `cust_t3`,
      amount_cents: 9900,
      currency: 'USD',
    });
    db.addPaymentFailure(pf);

    // Initial scan creates opportunity
    const res1 = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(res1.totalAtRiskCents, 9900, 'First scan total is 9900');
    assert.strictEqual(res1.newOpportunitiesCreated, 1, 'First scan creates 1 opportunity');

    // Second scan with the existing active opportunity in place
    const res2 = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(res2.totalAtRiskCents, 9900, 'TotalAtRisk must remain 9900, not double to 19800');
    assert.strictEqual(res2.newOpportunitiesCreated, 0, 'No duplicate opportunities created');
    assert.strictEqual(res2.existingOpportunitiesMaintained, 1, 'Maintained existing opportunity');
  });

  // -------------------------------------------------------------------------
  // TEST 4: Repeated-failure vector does not add duplicate financial exposure
  // -------------------------------------------------------------------------
  await test('4. Repeated-failure vector does not add duplicate financial exposure', async () => {
    const wsId = `ws_t4_${Date.now()}`;
    db.addCustomer({
      id: `cust_t4`,
      workspace_id: wsId,
      name: 'Delta Ltd',
      email: 'delta@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 50000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t4',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_t4_1`,
        workspace_id: wsId,
        customer_id: `cust_t4`,
        amount_cents: 3000,
        currency: 'USD',
        normalized_category: 'payment_method_declined',
      })
    );
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_t4_2`,
        workspace_id: wsId,
        customer_id: `cust_t4`,
        amount_cents: 3000,
        currency: 'USD',
        normalized_category: 'payment_method_declined',
      })
    );

    const res = await RevenueLeakScanner.executeScan(wsId);
    const vec2 = res.vectors.find((v) => v.vectorId === 'vec_repeated_failures')!;
    assert.strictEqual(vec2.detectedCount, 1, 'Vector 2 detects customer with >= 2 failures');
    assert.strictEqual(vec2.amountAtRiskCents, 0, 'Vector 2 amount at risk must be 0 to avoid duplicate exposure');
    assert.strictEqual(res.riskSignalsCount >= 1, true, 'Repeated failure counts as risk signal');
  });

  // -------------------------------------------------------------------------
  // TEST 5: Normal upcoming renewal is NOT a revenue leak
  // -------------------------------------------------------------------------
  await test('5. Normal upcoming renewal is NOT a revenue leak', async () => {
    const wsId = `ws_t5_${Date.now()}`;
    db.addCustomer({
      id: `cust_t5`,
      workspace_id: wsId,
      name: 'Epsilon Ltd',
      email: 'eps@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 100000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t5',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Active subscription renewing in 4 days with zero failures and healthy status
    db.addSubscription({
      id: `sub_t5`,
      workspace_id: wsId,
      customer_id: `cust_t5`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_t5_1',
      plan_name: 'Pro',
      amount_cents: 4900,
      currency: 'USD',
      status: 'active',
      billing_interval: 'monthly',
      renewal_count: 5,
      subscription_start_date: new Date(Date.now() - 60 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() + 4 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const res = await RevenueLeakScanner.executeScan(wsId);
    const vec3 = res.vectors.find((v) => v.vectorId === 'vec_renewal_risks')!;
    assert.strictEqual(vec3.detectedCount, 0, 'Normal renewal without failure evidence must not be detected as leak');
    assert.strictEqual(res.totalAtRiskCents, 0, 'TotalAtRisk must be 0');
    assert.strictEqual(res.newOpportunitiesCreated, 0, 'Must create 0 opportunities');
  });

  // -------------------------------------------------------------------------
  // TEST 6: Failed renewal can become confirmed risk when evidence exists
  // -------------------------------------------------------------------------
  await test('6. Failed renewal can become confirmed risk when evidence exists', async () => {
    const wsId = `ws_t6_${Date.now()}`;
    db.addCustomer({
      id: `cust_t6`,
      workspace_id: wsId,
      name: 'Zeta Ltd',
      email: 'zeta@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'at_risk',
      lifetime_value_cents: 80000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t6',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addSubscription({
      id: `sub_t6`,
      workspace_id: wsId,
      customer_id: `cust_t6`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_t6_1',
      plan_name: 'Enterprise',
      amount_cents: 12000,
      currency: 'USD',
      status: 'active',
      billing_interval: 'monthly',
      renewal_count: 2,
      subscription_start_date: new Date(Date.now() - 30 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() + 2 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_t6`,
        workspace_id: wsId,
        customer_id: `cust_t6`,
        amount_cents: 12000,
        currency: 'USD',
        normalized_category: 'expired_card',
      })
    );

    const res = await RevenueLeakScanner.executeScan(wsId);
    const vec3 = res.vectors.find((v) => v.vectorId === 'vec_renewal_risks')!;
    assert.strictEqual(vec3.detectedCount, 1, 'Renewal with failed payment evidence is detected');
    assert.strictEqual(res.totalAtRiskCents, 12000, 'Confirmed risk counted once');
  });

  // -------------------------------------------------------------------------
  // TEST 7: Churn risk does not inflate totalAtRisk
  // -------------------------------------------------------------------------
  await test('7. Churn risk does not inflate totalAtRisk', async () => {
    const wsId = `ws_t7_${Date.now()}`;
    db.addCustomer({
      id: `cust_t7`,
      workspace_id: wsId,
      name: 'Eta Ltd',
      email: 'eta@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'at_risk', // Low health
      lifetime_value_cents: 200000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t7',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addSubscription({
      id: `sub_t7`,
      workspace_id: wsId,
      customer_id: `cust_t7`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_t7_1',
      plan_name: 'Business',
      amount_cents: 30000,
      currency: 'USD',
      status: 'active',
      billing_interval: 'monthly',
      renewal_count: 6,
      subscription_start_date: new Date(Date.now() - 90 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() + 25 * 86400000).toISOString(), // Not renewing soon
      created_at: new Date().toISOString(),
    });

    const res = await RevenueLeakScanner.executeScan(wsId);
    const vec4 = res.vectors.find((v) => v.vectorId === 'vec_churn_signals')!;
    assert.strictEqual(vec4.detectedCount, 1, 'Churn signal detected for at-risk customer');
    assert.strictEqual(vec4.amountAtRiskCents, 0, 'Vector 4 amount at risk is 0');
    assert.strictEqual(res.totalAtRiskCents, 0, 'Churn signal does not inflate totalAtRiskCents with MRR/LTV');
    assert.strictEqual(res.riskSignalsCount >= 1, true, 'Categorized as risk signal');
  });

  // -------------------------------------------------------------------------
  // TEST 8: Expansion does not inflate totalAtRisk & healthy customer without verified expansion data produces 0 cents
  // -------------------------------------------------------------------------
  await test('8. Expansion does not inflate totalAtRisk & healthy customer produces 0 cents without verified data', async () => {
    const wsId = `ws_t8_${Date.now()}`;
    db.addCustomer({
      id: `cust_t8`,
      workspace_id: wsId,
      name: 'Theta Ltd',
      email: 'theta@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 500000,
      total_recovered_cents: 60000,
      country: 'US',
      provider_customer_id: 'cus_t8',
      created_at: new Date(Date.now() - 100 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addSubscription({
      id: `sub_t8`,
      workspace_id: wsId,
      customer_id: `cust_t8`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_t8_1',
      plan_name: 'Growth',
      amount_cents: 20000,
      currency: 'USD',
      status: 'active',
      billing_interval: 'monthly',
      renewal_count: 4,
      subscription_start_date: new Date(Date.now() - 100 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() + 20 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const res = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(res.totalAtRiskCents, 0, 'Expansion candidate must NEVER contribute to totalAtRiskCents');
    // Regression test: Healthy customer with only subscription/LTV/recovery history does NOT produce an expansion signal or invented amount.
    assert.strictEqual(res.expansionOpportunityCents, 0, 'Healthy customer without explicit verified telemetry produces 0 cents expansion amount');
    assert.strictEqual(res.vectors[4].detectedCount, 0, 'Healthy/LTV/recovered history alone does not become an expansion signal');

    // Now test with verified explicit expansion amount
    db.addCustomer({
      id: `cust_t8_exp`,
      workspace_id: wsId,
      name: 'Theta Exp Ltd',
      email: 'theta_exp@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 500000,
      total_recovered_cents: 60000,
      country: 'US',
      provider_customer_id: 'cus_t8_exp',
      metadata: { expansion_amount_cents: 50000 },
      created_at: new Date(Date.now() - 100 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    db.addSubscription({
      id: `sub_t8_exp`,
      workspace_id: wsId,
      customer_id: `cust_t8_exp`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_t8_exp_1',
      plan_name: 'Growth',
      amount_cents: 20000,
      currency: 'USD',
      status: 'active',
      billing_interval: 'monthly',
      renewal_count: 4,
      subscription_start_date: new Date(Date.now() - 100 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() + 20 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const resWithExp = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(resWithExp.totalAtRiskCents, 0, 'TotalAtRisk remains 0 even with verified expansion amount');
    assert.strictEqual(resWithExp.expansionOpportunityCents, 50000, 'Explicit verified expansion amount is correctly quantified');
  });

  // -------------------------------------------------------------------------
  // TEST 9: Expansion never appears as recovered/recoverable billing loss
  // -------------------------------------------------------------------------
  await test('9. Expansion never appears as recovered/recoverable billing loss', async () => {
    const wsId = `ws_t9_${Date.now()}`;
    db.addCustomer({
      id: `cust_t9`,
      workspace_id: wsId,
      name: 'Iota Ltd',
      email: 'iota@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 300000,
      total_recovered_cents: 70000,
      country: 'US',
      provider_customer_id: 'cus_t9',
      created_at: new Date(Date.now() - 120 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addSubscription({
      id: `sub_t9`,
      workspace_id: wsId,
      customer_id: `cust_t9`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_t9_1',
      plan_name: 'Growth',
      amount_cents: 10000,
      currency: 'USD',
      status: 'active',
      billing_interval: 'monthly',
      renewal_count: 5,
      subscription_start_date: new Date(Date.now() - 120 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() + 20 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const res = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(res.totalRecoverableRevenueCents, 0, 'Expansion never contributes to totalRecoverableRevenueCents');
    assert.strictEqual(res.totalAtRiskCents, 0, 'TotalAtRisk remains 0');
  });

  // -------------------------------------------------------------------------
  // TEST 10: Invoice-only leak does not create invalid recovery_opportunity row
  // -------------------------------------------------------------------------
  await test('10. Invoice-only leak does not create invalid recovery_opportunity row (payment_failure_id required)', async () => {
    const wsId = `ws_t10_${Date.now()}`;
    db.addCustomer({
      id: `cust_t10`,
      workspace_id: wsId,
      name: 'Kappa Ltd',
      email: 'kappa@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t10',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Unpaid invoice with NO payment failure
    db.addInvoice({
      id: `inv_t10_only`,
      workspace_id: wsId,
      customer_id: `cust_t10`,
      provider_type: 'stripe',
      provider_invoice_id: `in_t10_99`,
      amount_cents: 6000,
      currency: 'USD',
      status: 'past_due',
      created_at: new Date().toISOString(),
      due_date: new Date().toISOString(),
    });

    const res = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(res.totalAtRiskCents, 6000, 'Invoice-only leak is included in totalAtRisk reporting');
    assert.strictEqual(res.newOpportunitiesCreated, 0, 'Must NOT create recovery_opportunity row lacking payment_failure_id');

    const oppsInDb = db.getOpportunities(wsId);
    assert.strictEqual(oppsInDb.length, 0, 'No invalid rows inserted into DB');
  });

  // -------------------------------------------------------------------------
  // TEST 11: Payment-failure opportunity contains valid payment_failure_id
  // -------------------------------------------------------------------------
  await test('11. Payment-failure opportunity contains valid payment_failure_id', async () => {
    const wsId = `ws_t11_${Date.now()}`;
    db.addCustomer({
      id: `cust_t11`,
      workspace_id: wsId,
      name: 'Lambda Ltd',
      email: 'lambda@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t11',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const realFailureId = `pf_valid_12345`;
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: realFailureId,
        workspace_id: wsId,
        customer_id: `cust_t11`,
        amount_cents: 4500,
        currency: 'USD',
      })
    );

    const res = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(res.newOpportunitiesCreated, 1, 'Creates opportunity for real payment failure');
    const createdOpp = res.createdOpportunities[0];
    assert.strictEqual(createdOpp.payment_failure_id, realFailureId, 'Contains the authentic payment_failure_id');
  });

  // -------------------------------------------------------------------------
  // TEST 12: Scanner is idempotent across repeated runs
  // -------------------------------------------------------------------------
  await test('12. Scanner is idempotent across repeated runs', async () => {
    const wsId = `ws_t12_${Date.now()}`;
    db.addCustomer({
      id: `cust_t12`,
      workspace_id: wsId,
      name: 'Mu Ltd',
      email: 'mu@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 20000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t12',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_t12`,
        workspace_id: wsId,
        customer_id: `cust_t12`,
        amount_cents: 8000,
        currency: 'USD',
      })
    );

    const pass1 = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(pass1.newOpportunitiesCreated, 1, 'Pass 1 creates 1 opp');
    assert.strictEqual(pass1.totalAtRiskCents, 8000, 'Pass 1 totalAtRisk = 8000');

    const pass2 = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(pass2.newOpportunitiesCreated, 0, 'Pass 2 creates 0 new opps');
    assert.strictEqual(pass2.totalAtRiskCents, 8000, 'Pass 2 totalAtRisk remains 8000');

    const pass3 = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(pass3.newOpportunitiesCreated, 0, 'Pass 3 creates 0 new opps');
    assert.strictEqual(pass3.totalAtRiskCents, 8000, 'Pass 3 totalAtRisk remains 8000');
  });

  // -------------------------------------------------------------------------
  // TEST 13: Workspace boundary isolation
  // -------------------------------------------------------------------------
  await test('13. Workspace boundary isolation strictly enforced', async () => {
    const wsA = `ws_iso_a_${Date.now()}`;
    const wsB = `ws_iso_b_${Date.now()}`;

    db.addCustomer({
      id: `cust_iso_a`,
      workspace_id: wsA,
      name: 'Tenant A',
      email: 'a@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_iso_a`,
        workspace_id: wsA,
        customer_id: `cust_iso_a`,
        amount_cents: 1000,
        currency: 'USD',
      })
    );

    db.addCustomer({
      id: `cust_iso_b`,
      workspace_id: wsB,
      name: 'Tenant B',
      email: 'b@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 20000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_b',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_iso_b`,
        workspace_id: wsB,
        customer_id: `cust_iso_b`,
        amount_cents: 9000,
        currency: 'USD',
      })
    );

    const resA = await RevenueLeakScanner.executeScan(wsA);
    const resB = await RevenueLeakScanner.executeScan(wsB);

    assert.strictEqual(resA.totalAtRiskCents, 1000, 'Tenant A total = 1000');
    assert.strictEqual(resB.totalAtRiskCents, 9000, 'Tenant B total = 9000');
  });

  // -------------------------------------------------------------------------
  // TEST 14: Dry-run produces no writes
  // -------------------------------------------------------------------------
  await test('14. Dry-run produces no database writes', async () => {
    const wsId = `ws_dry_${Date.now()}`;
    db.addCustomer({
      id: `cust_dry`,
      workspace_id: wsId,
      name: 'Dry Customer',
      email: 'dry@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_dry',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_dry`,
        workspace_id: wsId,
        customer_id: `cust_dry`,
        amount_cents: 3500,
        currency: 'USD',
      })
    );

    const dryResult = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });
    assert.strictEqual(dryResult.totalAtRiskCents, 3500, 'Calculates exposure during dry-run');
    assert.strictEqual(dryResult.createdOpportunities.length, 0, '0 opportunities returned in dry-run');
    assert.strictEqual(db.getOpportunities(wsId).length, 0, 'Database has 0 opportunities persisted');
  });

  // -------------------------------------------------------------------------
  // TEST 15: No Math.random in financial calculations
  // -------------------------------------------------------------------------
  await test('15. Zero Math.random in financial calculations', async () => {
    const scannerCode = fs.readFileSync('server/scanner/revenueScanner.ts', 'utf8');
    assert.strictEqual(scannerCode.includes('Math.random()'), false, 'RevenueLeakScanner must contain 0 Math.random calls');
  });

  // -------------------------------------------------------------------------
  // TEST 16: Currency totals remain correct for mixed currencies
  // -------------------------------------------------------------------------
  await test('16. Currency totals remain correct for mixed currencies without blending cents', async () => {
    const wsId = `ws_mixed_curr_${Date.now()}`;
    db.addCustomer({
      id: `cust_usd`,
      workspace_id: wsId,
      name: 'US Customer',
      email: 'us@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_usd',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_usd`,
        workspace_id: wsId,
        customer_id: `cust_usd`,
        amount_cents: 5000, // $50.00
        currency: 'USD',
      })
    );

    db.addCustomer({
      id: `cust_inr`,
      workspace_id: wsId,
      name: 'IN Customer',
      email: 'in@test.com',
      currency: 'INR',
      provider_type: 'razorpay',
      current_risk_status: 'healthy',
      lifetime_value_cents: 200000,
      total_recovered_cents: 0,
      country: 'IN',
      provider_customer_id: 'cus_inr',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_inr`,
        workspace_id: wsId,
        customer_id: `cust_inr`,
        amount_cents: 250000, // ₹2,500.00
        currency: 'INR',
        provider_type: 'razorpay',
      })
    );

    const res = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(Boolean(res.totalsByCurrency), true, 'Provides totalsByCurrency');
    assert.strictEqual(res.totalsByCurrency['USD'].totalAtRiskCents, 5000, 'USD total is exactly 5000');
    assert.strictEqual(res.totalsByCurrency['INR'].totalAtRiskCents, 250000, 'INR total is exactly 250000');
  });

  // -------------------------------------------------------------------------
  // TEST 17: Supabase persistence rejects invalid relationships
  // -------------------------------------------------------------------------
  await test('17. Supabase persistence rejects invalid relationships', async () => {
    setStorageMode('supabase_production');
    let rejected = false;

    const mockSupabaseClient = {
      from(tableName: string) {
        if (tableName === 'customers') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        if (tableName === 'subscriptions') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        if (tableName === 'invoices') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        if (tableName === 'payment_failures') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        if (tableName === 'recovery_opportunities') {
          return {
            select: () => ({ eq: async () => ({ data: [], error: null }) }),
            insert: (row: any) => {
              if (!row.payment_failure_id || row.payment_failure_id === 'invalid_fake_id') {
                return {
                  select: () => ({
                    single: async () => ({
                      data: null,
                      error: { message: 'violates foreign key constraint recovery_opportunities_payment_failure_id_fkey' },
                    }),
                  }),
                };
              }
              return { select: () => ({ single: async () => ({ data: { id: 'opp_ok', ...row }, error: null }) }) };
            },
          };
        }
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      },
    };

    setSupabaseServerClientOverride(mockSupabaseClient as any);

    try {
      await supabaseService.createRecoveryOpportunity('ws_test', {
        payment_failure_id: 'invalid_fake_id',
        customer_id: 'cust_01',
      });
    } catch (err: any) {
      rejected = err.message.includes('foreign key constraint');
    } finally {
      setSupabaseServerClientOverride(null);
      setStorageMode('local_development');
    }

    assert.strictEqual(rejected, true, 'Supabase client properly rejects invalid payment_failure_id foreign keys');
  });

  // -------------------------------------------------------------------------
  // TEST 18: Partial processing does not silently lose records
  // -------------------------------------------------------------------------
  await test('18. Partial processing does not silently lose records', async () => {
    const wsId = `ws_t18_${Date.now()}`;
    db.addCustomer({
      id: `cust_t18`,
      workspace_id: wsId,
      name: 'Record Retention Test',
      email: 'retention@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t18',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_t18_valid`,
        workspace_id: wsId,
        customer_id: `cust_t18`,
        amount_cents: 4000,
        currency: 'USD',
      })
    );

    // Unpaid invoice without payment failure
    db.addInvoice({
      id: `inv_t18_unlinked`,
      workspace_id: wsId,
      customer_id: `cust_t18`,
      provider_type: 'stripe',
      provider_invoice_id: `in_unlinked_99`,
      amount_cents: 6000,
      currency: 'USD',
      status: 'past_due',
      created_at: new Date().toISOString(),
      due_date: new Date().toISOString(),
    });

    const res = await RevenueLeakScanner.executeScan(wsId);
    // Both are retained in totalAtRisk reporting!
    assert.strictEqual(res.totalAtRiskCents, 10000, 'Both valid failure (4000) and unlinked invoice (6000) are audited (total 10000)');
    assert.strictEqual(res.vectors[0].detectedCount, 2, 'Both detected as canonical leaks');
  });

  // -------------------------------------------------------------------------
  // TEST 19: Scanner totals are deterministic
  // -------------------------------------------------------------------------
  await test('19. Scanner totals are deterministic across multiple executions', async () => {
    const wsId = `ws_t19_${Date.now()}`;
    db.addCustomer({
      id: `cust_t19`,
      workspace_id: wsId,
      name: 'Deterministic Test',
      email: 'det@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 50000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_t19',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_t19`,
        workspace_id: wsId,
        customer_id: `cust_t19`,
        amount_cents: 8800,
        currency: 'USD',
      })
    );

    const r1 = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });
    const r2 = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });
    const r3 = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });

    assert.strictEqual(r1.totalAtRiskCents, r2.totalAtRiskCents, 'Run 1 and 2 match');
    assert.strictEqual(r2.totalAtRiskCents, r3.totalAtRiskCents, 'Run 2 and 3 match');
    assert.strictEqual(r1.totalRecoverableRevenueCents, r3.totalRecoverableRevenueCents, 'Recoverable revenue matches');
    assert.strictEqual(r1.riskSignalsCount, r3.riskSignalsCount, 'Risk signals count matches');
  });

  // -------------------------------------------------------------------------
  // TEST 20: Empty workspace returns honest zero/insufficient-data state
  // -------------------------------------------------------------------------
  await test('20. Empty workspace returns honest zero/insufficient-data state', async () => {
    const emptyWsId = `ws_empty_${Date.now()}`;
    const res = await RevenueLeakScanner.executeScan(emptyWsId);

    assert.strictEqual(res.totalRecordsAudited, 0, '0 records audited');
    assert.strictEqual(res.totalAtRiskCents, 0, '0 totalAtRisk');
    assert.strictEqual(res.totalRecoverableRevenueCents, 0, '0 totalRecoverable');
    assert.strictEqual(res.riskSignalsCount, 0, '0 riskSignals');
    assert.strictEqual(res.expansionOpportunityCents, 0, '0 expansionOpportunity');
    assert.strictEqual(res.newOpportunitiesCreated, 0, '0 new opportunities');
    assert.strictEqual(res.existingOpportunitiesMaintained, 0, '0 maintained');
    assert.strictEqual(res.vectors.every((v) => v.status === 'insufficient_data'), true, 'All vectors have insufficient_data status');
  });

  // -------------------------------------------------------------------------
  // TEST 21: getMetrics() uses canonical scanner accounting (no opportunity summation inflation)
  // -------------------------------------------------------------------------
  await test('21. getMetrics() uses canonical scanner accounting and matches scanner totalAtRiskCents', async () => {
    const wsId = `ws_metrics_canonical_${Date.now()}`;
    db.addCustomer({
      id: `cust_m1`,
      workspace_id: wsId,
      name: 'Canonical Metrics Account',
      email: 'canonical@metrics.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 80000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_m1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 1 Invoice for $120
    db.addInvoice({
      id: `inv_m1`,
      workspace_id: wsId,
      customer_id: `cust_m1`,
      provider_type: 'stripe',
      provider_invoice_id: `in_m1_120`,
      amount_cents: 12000,
      currency: 'USD',
      status: 'past_due',
      created_at: new Date().toISOString(),
      due_date: new Date().toISOString(),
    });

    // 2 duplicate payment failures for this single invoice ($120 each)
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_m1_a`,
        workspace_id: wsId,
        customer_id: `cust_m1`,
        invoice_id: `inv_m1`,
        amount_cents: 12000,
        currency: 'USD',
      })
    );
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_m1_b`,
        workspace_id: wsId,
        customer_id: `cust_m1`,
        invoice_id: `inv_m1`,
        amount_cents: 12000,
        currency: 'USD',
      })
    );

    // Existing active opportunity for $120
    db.createRecoveryOpportunity(wsId, {
      customer_id: `cust_m1`,
      payment_failure_id: `pf_m1_a`,
      amount_at_risk_cents: 12000,
      status: 'active',
      currency: 'USD',
      failure_category: 'payment_method_declined',
      recommended_action: 'Smart retry',
    });

    // Execute scanner
    const scanResult = await RevenueLeakScanner.executeScan(wsId);
    // Directly query db.getMetrics
    const metricsResult = db.getMetrics(wsId);

    // Canonical accounting guarantees: 1 invoice + 2 failures + 1 existing opportunity = 12000 cents (never 24000 or 36000)
    assert.strictEqual(scanResult.totalAtRiskCents, 12000, 'Scanner calculates exactly 12000 cents');
    assert.strictEqual(metricsResult.revenue_at_risk_cents, 12000, 'getMetrics() uses canonical scanner accounting (12000 cents)');
    assert.strictEqual(metricsResult.revenue_at_risk_cents, scanResult.totalAtRiskCents, 'getMetrics() and scanner totalAtRiskCents are identical');
  });

  // -------------------------------------------------------------------------
  // TEST 22: InteractiveScannerSequence UI static assertions against fabricated data
  // -------------------------------------------------------------------------
  await test('22. InteractiveScannerSequence UI has no hardcoded animation counts and uses business language', () => {
    const scannerUiCode = fs.readFileSync('src/components/InteractiveScannerSequence.tsx', 'utf-8');

    // Reject hardcoded fake counts
    assert.strictEqual(scannerUiCode.includes('count: 1420'), false, 'Must not contain hardcoded count 1420');
    assert.strictEqual(scannerUiCode.includes('count: 8'), false, 'Must not contain hardcoded count 8');
    assert.strictEqual(scannerUiCode.includes('count: 6'), false, 'Must not contain hardcoded count 6');
    assert.strictEqual(scannerUiCode.includes('count: 7'), false, 'Must not contain hardcoded count 7');
    assert.strictEqual(scannerUiCode.includes('count: 3'), false, 'Must not contain hardcoded count 3');
    assert.strictEqual(scannerUiCode.includes('SYNTHESIZING AUTONOMOUS RECOVERY VECTORS'), false, 'Must not make exaggerated claims');

    // Reject hardcoded probability fallbacks
    assert.strictEqual(scannerUiCode.includes('|| 0.8'), false, 'Must not contain hardcoded 0.8 probability fallback');
    assert.strictEqual(scannerUiCode.includes('80% Win Prob'), false, 'Must not contain fabricated 80% Win Prob text');

    // Confirm real business language stages
    assert(scannerUiCode.includes('Auditing billing activity'), 'Must contain stage: Auditing billing activity');
    assert(scannerUiCode.includes('Checking failed payments'), 'Must contain stage: Checking failed payments');
    assert(scannerUiCode.includes('Checking overdue invoices'), 'Must contain stage: Checking overdue invoices');
    assert(scannerUiCode.includes('Evaluating customer risk'), 'Must contain stage: Evaluating customer risk');
    assert(scannerUiCode.includes('Finding recovery opportunities'), 'Must contain stage: Finding recovery opportunities');
  });

  // -------------------------------------------------------------------------
  // TEST 23: UI components do not use opportunity sums as workspace Revenue At Risk
  // -------------------------------------------------------------------------
  await test('23. UI components do not use opportunity sums as workspace Revenue At Risk', () => {
    const homeUiCode = fs.readFileSync('src/components/RevenueCommandCenter.tsx', 'utf-8');
    const scannerUiCode = fs.readFileSync('src/components/InteractiveScannerSequence.tsx', 'utf-8');
    const revenueUiCode = fs.readFileSync('src/components/RevenuePage.tsx', 'utf-8');

    // RevenueCommandCenter must not fall back to unrecovered.reduce for total at risk
    assert.strictEqual(
      homeUiCode.includes('unrecovered.reduce'),
      false,
      'RevenueCommandCenter must not use unrecovered.reduce fallback for Revenue At Risk'
    );

    // InteractiveScannerSequence must not fall back to opportunities.reduce for total at risk
    assert.strictEqual(
      scannerUiCode.includes('opportunities.reduce'),
      false,
      'InteractiveScannerSequence must not use opportunities.reduce fallback'
    );

    // RevenuePage must not call filtered opportunity sum "Revenue At Risk"
    assert(
      revenueUiCode.includes('Filtered Opportunity Value'),
      'RevenuePage must label filtered opportunity sum as Filtered Opportunity Value'
    );
    assert(
      revenueUiCode.includes('canonicalRevenueAtRiskCents'),
      'RevenuePage must derive workspace Revenue At Risk from canonical metrics'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 24: categoryFilter in RevenueLeakScanner accurately filters findings
  // -------------------------------------------------------------------------
  await test('24. categoryFilter in RevenueLeakScanner accurately filters findings', async () => {
    const wsId = `ws_cat_filter_${Date.now()}`;
    db.addCustomer({
      id: `cust_cf_1`,
      workspace_id: wsId,
      name: 'Category Filter Test Cust',
      email: 'cf@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 50000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_cf_1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Failure 1: insufficient_funds ($50)
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_cf_funds`,
        workspace_id: wsId,
        customer_id: `cust_cf_1`,
        amount_cents: 5000,
        currency: 'USD',
        normalized_category: 'insufficient_funds',
      })
    );

    // Failure 2: expired_card ($70)
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_cf_card`,
        workspace_id: wsId,
        customer_id: `cust_cf_1`,
        amount_cents: 7000,
        currency: 'USD',
        normalized_category: 'expired_card',
      })
    );

    // Unfiltered scan sees both (total $120)
    const allScan = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });
    assert.strictEqual(allScan.totalAtRiskCents, 12000, 'Unfiltered scan includes both failures');

    // Filtered by insufficient_funds sees only $50
    const fundsScan = await RevenueLeakScanner.executeScan(wsId, { dryRun: true, categoryFilter: 'insufficient_funds' });
    assert.strictEqual(fundsScan.totalAtRiskCents, 5000, 'Category filtered scan includes only insufficient_funds');

    // Filtered by expired_card sees only $70
    const cardScan = await RevenueLeakScanner.executeScan(wsId, { dryRun: true, categoryFilter: 'expired_card' });
    assert.strictEqual(cardScan.totalAtRiskCents, 7000, 'Category filtered scan includes only expired_card');
  });

  // -------------------------------------------------------------------------
  // TEST 25: Resolved payment failures are excluded from current Revenue At Risk
  // -------------------------------------------------------------------------
  await test('25. Resolved payment failures are excluded from current Revenue At Risk', async () => {
    const wsId = `ws_resolved_test_${Date.now()}`;
    db.addCustomer({
      id: `cust_res_1`,
      workspace_id: wsId,
      name: 'Resolved Fail Customer',
      email: 'res@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 60000,
      total_recovered_cents: 10000,
      country: 'US',
      provider_customer_id: 'cus_res_1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 1 Resolved failure ($100)
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_res_resolved`,
        workspace_id: wsId,
        customer_id: `cust_res_1`,
        amount_cents: 10000,
        currency: 'USD',
        is_resolved: true,
      })
    );

    // 1 Active unresolved failure ($45)
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_res_active`,
        workspace_id: wsId,
        customer_id: `cust_res_1`,
        amount_cents: 4500,
        currency: 'USD',
        is_resolved: false,
      })
    );

    const res = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });
    assert.strictEqual(res.totalAtRiskCents, 4500, 'Must ONLY include the active unresolved failure ($45), excluding resolved ($100)');
    assert.strictEqual(res.vectors[0].detectedCount, 1, 'Only 1 active leak detected');
  });

  // -------------------------------------------------------------------------
  // TEST 26: Paid and void linked invoices are not current financial exposure
  // -------------------------------------------------------------------------
  await test('26. Paid and void linked invoices are not current financial exposure', async () => {
    const wsId = `ws_paid_void_${Date.now()}`;
    db.addCustomer({
      id: `cust_pv_1`,
      workspace_id: wsId,
      name: 'Paid Void Customer',
      email: 'pv@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 90000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_pv_1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Invoice 1: Paid ($80) with a linked payment failure that wasn't resolved flag yet
    db.addInvoice({
      id: `inv_pv_paid`,
      workspace_id: wsId,
      customer_id: `cust_pv_1`,
      provider_type: 'stripe',
      provider_invoice_id: `in_pv_paid`,
      amount_cents: 8000,
      currency: 'USD',
      status: 'paid',
      created_at: new Date().toISOString(),
      due_date: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_pv_for_paid`,
        workspace_id: wsId,
        customer_id: `cust_pv_1`,
        invoice_id: `inv_pv_paid`,
        amount_cents: 8000,
        currency: 'USD',
        is_resolved: false,
      })
    );

    // Invoice 2: Void ($60) with a linked payment failure
    db.addInvoice({
      id: `inv_pv_void`,
      workspace_id: wsId,
      customer_id: `cust_pv_1`,
      provider_type: 'stripe',
      provider_invoice_id: `in_pv_void`,
      amount_cents: 6000,
      currency: 'USD',
      status: 'void',
      created_at: new Date().toISOString(),
      due_date: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_pv_for_void`,
        workspace_id: wsId,
        customer_id: `cust_pv_1`,
        invoice_id: `inv_pv_void`,
        amount_cents: 6000,
        currency: 'USD',
        is_resolved: false,
      })
    );

    // Invoice 3: Open / past_due ($30) with a linked payment failure
    db.addInvoice({
      id: `inv_pv_open`,
      workspace_id: wsId,
      customer_id: `cust_pv_1`,
      provider_type: 'stripe',
      provider_invoice_id: `in_pv_open`,
      amount_cents: 3000,
      currency: 'USD',
      status: 'past_due',
      created_at: new Date().toISOString(),
      due_date: new Date().toISOString(),
    });
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_pv_for_open`,
        workspace_id: wsId,
        customer_id: `cust_pv_1`,
        invoice_id: `inv_pv_open`,
        amount_cents: 3000,
        currency: 'USD',
        is_resolved: false,
      })
    );

    const res = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });
    assert.strictEqual(res.totalAtRiskCents, 3000, 'Must ONLY include the unpaid past_due invoice failure ($30), ignoring paid and void');
    assert.strictEqual(res.vectors[0].detectedCount, 1, 'Only 1 active leak detected');
  });

  // -------------------------------------------------------------------------
  // TEST 27: Repeated-failure, renewal, and churn signals ignore resolved failures
  // -------------------------------------------------------------------------
  await test('27. Repeated-failure, renewal, and churn signals ignore resolved failures', async () => {
    const wsId = `ws_signals_resolved_${Date.now()}`;
    db.addCustomer({
      id: `cust_sig_res_1`,
      workspace_id: wsId,
      name: 'Resolved Signals Customer',
      email: 'sigres@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 120000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_sig_res_1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Customer has 2 resolved failures in historical records
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_sig_res_1`,
        workspace_id: wsId,
        customer_id: `cust_sig_res_1`,
        amount_cents: 5000,
        currency: 'USD',
        is_resolved: true,
      })
    );
    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_sig_res_2`,
        workspace_id: wsId,
        customer_id: `cust_sig_res_1`,
        amount_cents: 5000,
        currency: 'USD',
        is_resolved: true,
      })
    );

    // Active subscription renewing in 5 days
    db.addSubscription({
      id: `sub_sig_res_1`,
      workspace_id: wsId,
      customer_id: `cust_sig_res_1`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_sig_res_1',
      plan_name: 'Pro',
      amount_cents: 5000,
      currency: 'USD',
      status: 'active',
      billing_interval: 'monthly',
      current_period_end: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    } as any);

    const res = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });

    // Vector 2 (repeated failures) must ignore resolved failures (detected = 0)
    assert.strictEqual(res.vectors[1].detectedCount, 0, 'Vector 2 must be 0 because both failures are resolved');

    // Vector 3 (upcoming renewals) must treat renewal as normal because all past failures are resolved
    assert.strictEqual(res.vectors[2].detectedCount, 0, 'Vector 3 must be 0 because account has zero active unresolved failures');

    // Vector 4 (behavioral churn) must not trigger churn risk on resolved failures
    assert.strictEqual(res.vectors[3].detectedCount, 0, 'Vector 4 must be 0 because resolved failures do not penalize healthy accounts');
  });

  // -------------------------------------------------------------------------
  // TEST 28: Healthy/LTV/recovered history alone does not become an expansion signal
  // -------------------------------------------------------------------------
  await test('28. Healthy/LTV/recovered history alone does not become an expansion signal', async () => {
    const wsId = `ws_exp_health_alone_${Date.now()}`;
    db.addCustomer({
      id: `cust_healthy_only`,
      workspace_id: wsId,
      name: 'Super Healthy Cust',
      email: 'healthy@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 500000,
      total_recovered_cents: 80000,
      health_score: 98,
      country: 'US',
      provider_customer_id: 'cus_healthy_only',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addSubscription({
      id: `sub_healthy_only`,
      workspace_id: wsId,
      customer_id: `cust_healthy_only`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_h1',
      plan_name: 'Enterprise',
      amount_cents: 50000,
      currency: 'USD',
      status: 'active',
      billing_interval: 'monthly',
      created_at: new Date().toISOString(),
    } as any);

    const res = await RevenueLeakScanner.executeScan(wsId, { dryRun: true });
    // Vector 5 should be 0 because there is no explicit expansion signal telemetry
    assert.strictEqual(res.vectors[4].detectedCount, 0, 'Vector 5 detected count must be 0 without explicit telemetry');
    assert.strictEqual(res.expansionOpportunityCents, 0, 'Expansion opportunity cents must be 0');
  });

  // -------------------------------------------------------------------------
  // TEST 29: Expansion Finder uses actual billing intervals when calculating current ARR
  // -------------------------------------------------------------------------
  await test('29. Expansion Finder uses actual billing intervals when calculating current ARR', async () => {
    const wsId = `ws_arr_intervals_${Date.now()}`;

    // Cust 1: Yearly subscription for $1,200 ($120,000 cents). ARR should be $1,200 (not $14,400)
    db.addCustomer({
      id: `cust_yearly`,
      workspace_id: wsId,
      name: 'Yearly Sub Cust',
      email: 'yearly@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 240000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_yearly',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addSubscription({
      id: `sub_yearly`,
      workspace_id: wsId,
      customer_id: `cust_yearly`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_y1',
      plan_name: 'Annual Enterprise',
      amount_cents: 120000,
      currency: 'USD',
      billing_interval: 'yearly',
      created_at: new Date().toISOString(),
    } as any);

    // Cust 2: Quarterly subscription for $300 ($30,000 cents). ARR should be $1,200 ($120,000 cents)
    db.addCustomer({
      id: `cust_quarterly`,
      workspace_id: wsId,
      name: 'Quarterly Sub Cust',
      email: 'quarterly@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 120000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_quarterly',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addSubscription({
      id: `sub_quarterly`,
      workspace_id: wsId,
      customer_id: `cust_quarterly`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_q1',
      plan_name: 'Quarterly Growth',
      amount_cents: 30000,
      currency: 'USD',
      billing_interval: 'quarterly',
      created_at: new Date().toISOString(),
    } as any);

    // Cust 3: Monthly subscription for $100 ($10,000 cents). ARR should be $1,200 ($120,000 cents)
    db.addCustomer({
      id: `cust_monthly`,
      workspace_id: wsId,
      name: 'Monthly Sub Cust',
      email: 'monthly@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'healthy',
      lifetime_value_cents: 100000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_monthly',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.addSubscription({
      id: `sub_monthly`,
      workspace_id: wsId,
      customer_id: `cust_monthly`,
      provider_type: 'stripe',
      provider_subscription_id: 'sub_m1',
      plan_name: 'Monthly Starter',
      amount_cents: 10000,
      currency: 'USD',
      billing_interval: 'monthly',
      created_at: new Date().toISOString(),
    } as any);

    const expQueue = await ExpansionFinderEngine.evaluateWorkspace(wsId);
    const recYearly = expQueue.queue.find((r) => r.customerId === 'cust_yearly')!;
    const recQuarterly = expQueue.queue.find((r) => r.customerId === 'cust_quarterly')!;
    const recMonthly = expQueue.queue.find((r) => r.customerId === 'cust_monthly')!;

    // In all three cases, the annual value is $1,200 = 120,000 cents
    assert.strictEqual(recYearly.currentArrCents, 120000, 'Yearly $1,200 sub has currentArrCents = 120,000 (not 1,440,000)');
    assert.strictEqual(recQuarterly.currentArrCents, 120000, 'Quarterly $300 sub has currentArrCents = 120,000');
    assert.strictEqual(recMonthly.currentArrCents, 120000, 'Monthly $100 sub has currentArrCents = 120,000');
  });

  // -------------------------------------------------------------------------
  // TEST 30: Workspace currency overrides customer currency
  // -------------------------------------------------------------------------
  await test('30. Workspace currency overrides customer currency as authoritative primary currency', async () => {
    const ws = db.createWorkspace(`Workspace INR ${Date.now()}`, 'saas', 'INR');
    const wsId = ws.id;

    // First customer currency is USD
    db.addCustomer({
      id: `cust_usd_first`,
      workspace_id: wsId,
      name: 'USD First Customer',
      email: 'usd@test.com',
      currency: 'USD',
      provider_type: 'stripe',
      current_risk_status: 'at_risk',
      lifetime_value_cents: 10000,
      total_recovered_cents: 0,
      country: 'US',
      provider_customer_id: 'cus_usd_1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addCustomer({
      id: `cust_inr_second`,
      workspace_id: wsId,
      name: 'INR Second Customer',
      email: 'inr@test.com',
      currency: 'INR',
      provider_type: 'razorpay',
      current_risk_status: 'at_risk',
      lifetime_value_cents: 50000,
      total_recovered_cents: 0,
      country: 'IN',
      provider_customer_id: 'cus_inr_1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    db.addPaymentFailure(
      createTestPaymentFailure({
        id: `pf_inr_exp`,
        workspace_id: wsId,
        customer_id: `cust_inr_second`,
        amount_cents: 50000, // ₹500.00
        currency: 'INR',
        provider_type: 'razorpay',
      })
    );

    const scanResult = await RevenueLeakScanner.executeScan(wsId);
    assert.strictEqual(scanResult.currency, 'INR', 'Scanner primary currency must be workspace INR, not first customer USD');
    assert.strictEqual(scanResult.totalAtRiskCents, 50000, 'INR exposure correctly calculated');
  });

  // -------------------------------------------------------------------------
  // TEST 31: INR workspace + USD-only exposure
  // -------------------------------------------------------------------------
  await test('31. Canonical calculation: INR workspace + USD-only exposure preserves zero INR exposure', async () => {
    const ws = db.createWorkspace(`Workspace INR Only ${Date.now()}`, 'saas', 'INR');
    const wsId = ws.id;

    const pfUsd = createTestPaymentFailure({
      id: `pf_usd_only`,
      workspace_id: wsId,
      customer_id: `cust_usd_only`,
      amount_cents: 5000, // $50.00
      currency: 'USD',
      provider_type: 'stripe',
    });

    const canonical = calculateCanonicalFinancials({
      paymentFailures: [pfUsd],
      invoices: [],
      defaultCurrency: 'INR',
    });

    assert.strictEqual(canonical.primaryCurrency, 'INR', 'Primary currency is INR');
    assert.strictEqual(canonical.totalAtRiskCents, 0, 'INR total at risk is 0 when only USD exposure exists');
    assert.strictEqual(canonical.totalsByCurrency['USD'].totalAtRiskCents, 5000, 'USD total at risk is 5000 in totalsByCurrency');
    assert.strictEqual(canonical.totalsByCurrency['INR'].totalAtRiskCents, 0, 'INR total at risk is 0 in totalsByCurrency');
  });

  // -------------------------------------------------------------------------
  // TEST 32: USD workspace + EUR-only exposure
  // -------------------------------------------------------------------------
  await test('32. Canonical calculation: USD workspace + EUR-only exposure preserves zero USD exposure', async () => {
    const ws = db.createWorkspace(`Workspace USD EUR ${Date.now()}`, 'saas', 'USD');
    const wsId = ws.id;

    const pfEur = createTestPaymentFailure({
      id: `pf_eur_only`,
      workspace_id: wsId,
      customer_id: `cust_eur_only`,
      amount_cents: 7000, // €70.00
      currency: 'EUR',
      provider_type: 'stripe',
    });

    const canonical = calculateCanonicalFinancials({
      paymentFailures: [pfEur],
      invoices: [],
      defaultCurrency: 'USD',
    });

    assert.strictEqual(canonical.primaryCurrency, 'USD', 'Primary currency is USD');
    assert.strictEqual(canonical.totalAtRiskCents, 0, 'USD total at risk is 0 when only EUR exposure exists');
    assert.strictEqual(canonical.totalsByCurrency['EUR'].totalAtRiskCents, 7000, 'EUR total at risk is 7000 in totalsByCurrency');
    assert.strictEqual(canonical.totalsByCurrency['USD'].totalAtRiskCents, 0, 'USD total at risk is 0 in totalsByCurrency');
  });

  // -------------------------------------------------------------------------
  // TEST 33: Multi-currency (INR + USD + EUR exposure)
  // -------------------------------------------------------------------------
  await test('33. Canonical calculation: multi-currency (INR + USD + EUR) maintains complete currency isolation', async () => {
    const ws = db.createWorkspace(`Workspace Tri-Currency ${Date.now()}`, 'saas', 'INR');
    const wsId = ws.id;

    const failures = [
      createTestPaymentFailure({
        id: `pf_inr_33`,
        workspace_id: wsId,
        customer_id: `c1`,
        amount_cents: 250000,
        currency: 'INR',
        provider_type: 'razorpay',
      }),
      createTestPaymentFailure({
        id: `pf_usd_33`,
        workspace_id: wsId,
        customer_id: `c2`,
        amount_cents: 10000,
        currency: 'USD',
        provider_type: 'stripe',
      }),
      createTestPaymentFailure({
        id: `pf_eur_33`,
        workspace_id: wsId,
        customer_id: `c3`,
        amount_cents: 8000,
        currency: 'EUR',
        provider_type: 'stripe',
      }),
    ];

    const canonical = calculateCanonicalFinancials({
      paymentFailures: failures,
      invoices: [],
      defaultCurrency: 'INR',
    });

    assert.strictEqual(canonical.primaryCurrency, 'INR', 'Primary currency remains INR');
    assert.strictEqual(canonical.totalAtRiskCents, 250000, 'Primary total reflects only INR exposure');
    assert.strictEqual(canonical.totalsByCurrency['INR'].totalAtRiskCents, 250000);
    assert.strictEqual(canonical.totalsByCurrency['USD'].totalAtRiskCents, 10000);
    assert.strictEqual(canonical.totalsByCurrency['EUR'].totalAtRiskCents, 8000);
  });

  // -------------------------------------------------------------------------
  // TEST 34: Empty workspace handling
  // -------------------------------------------------------------------------
  await test('34. Canonical calculation: empty workspace returns clean zero totals with default currency', async () => {
    const canonical = calculateCanonicalFinancials({
      paymentFailures: [],
      invoices: [],
      defaultCurrency: 'EUR',
    });

    assert.strictEqual(canonical.primaryCurrency, 'EUR');
    assert.strictEqual(canonical.totalAtRiskCents, 0);
    assert.strictEqual(canonical.totalRecoverableRevenueCents, 0);
    assert.strictEqual(canonical.canonicalLeaks.length, 0);
    assert.strictEqual(canonical.totalsByCurrency['EUR'].totalAtRiskCents, 0);
  });

  console.log(`\n======================================================`);
  console.log(`REVENUE LEAK SCANNER: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log(`======================================================\n`);
}

runScannerValidation().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
