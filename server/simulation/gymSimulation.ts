import { db } from '../store/db.js';
import { AutopilotPolicyEngine } from '../services/autopilotPolicyEngine.js';
import { AutopilotService } from '../services/autopilotService.js';
import { AutonomousRecoveryEngine } from '../services/autonomousRecoveryEngine.js';
import { RecoveryDispatchEngine } from '../services/recoveryDispatchEngine.js';
import { Customer, RecoveryOpportunity, RevenueEvent, Workspace } from '../../src/types/index.js';

export interface GymSimulationResult {
  workspace: Workspace;
  totalMembers: number;
  monthlyFeeInr: number;
  totalAtRiskInr: number;
  failedPaymentsCount: number;
  detection: {
    failuresDetected: number;
    opportunitiesCreated: number;
    failureCategories: Record<string, number>;
  };
  policyArbitration: {
    autonomousCount: number;
    manualReviewCount: number;
    blockedCount: number;
  };
  recoveryActions: {
    linksGenerated: number;
    communicationsDispatched: number;
    channelsUsed: Record<string, number>;
  };
  paymentRecovery: {
    paymentsRecovered: number;
    recoveredAmountInr: number;
    unrecoveredAmountInr: number;
    recoveryRatePercent: number;
  };
  accounting: {
    revenueEventsLogged: number;
    invoicesMarkedPaid: number;
    customerRiskStatusesUpdated: number;
    auditLogsRecorded: number;
  };
  dashboardVerification: {
    heroMetricRevenueRecovered: string;
    revenueRecoverableRemaining: string;
    approvalRequiredCount: number;
    activeWorkflowsCount: number;
  };
}

export class GymSimulationEngine {
  /**
   * Executes the turnkey simulation for a subscription gym business.
   * - 1000 members
   * - ₹2,000 / month recurring membership
   * - 50 payment failures
   * - Full end-to-end recovery pipeline
   */
  public static async runSimulation(): Promise<GymSimulationResult> {
    // Disable disk persistence during bulk member creation to avoid synchronous disk thrashing
    db.setPersistenceEnabled(false);
    try {
      const wsId = `ws_gym_${Date.now()}`;
      const workspace = db.createWorkspace(
        `PulseFit Health & Fitness Club ${Date.now()}`,
        'fitness_gym_subscription',
        'INR',
        false
      );

    const MONTHLY_FEE_CENTS = 200000; // ₹2,000 in paise
    const TOTAL_MEMBERS = 1000;
    const FAILED_PAYMENTS_COUNT = 50;

    // 1. Generate 1,000 gym members with active subscriptions
    const firstNames = [
      'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
      'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Pari', 'Anika', 'Navya', 'Angel', 'Myra', 'Sara',
      'Rohan', 'Vikram', 'Sameer', 'Pooja', 'Neha', 'Rahul', 'Karan', 'Priya', 'Amit', 'Sunita',
      'Deepak', 'Meera', 'Rajesh', 'Suresh', 'Swati', 'Gaurav', 'Manish', 'Alok', 'Sneha', 'Tanvi'
    ];
    const lastNames = [
      'Sharma', 'Verma', 'Patel', 'Reddy', 'Mehta', 'Nair', 'Iyer', 'Chatterjee', 'Gupta', 'Singh',
      'Kumar', 'Joshi', 'Bhat', 'Deshmukh', 'Kulkarni', 'Chopra', 'Kapoor', 'Malhotra', 'Bose', 'Menon'
    ];

    const generatedCustomers: Customer[] = [];

    for (let i = 1; i <= TOTAL_MEMBERS; i++) {
      const fn = firstNames[(i - 1) % firstNames.length];
      const ln = lastNames[Math.floor((i - 1) / firstNames.length) % lastNames.length];
      const memberName = `${fn} ${ln}`;
      const memberEmail = `member.${i}.${fn.toLowerCase()}.${ln.toLowerCase()}@pulsefit.in`;
      const isVip = i === 46; // Member 46 is VIP executive member
      const isCorporate = i === 47 || i === 48; // Members 47 & 48 are Corporate gym partnerships

      const custId = `cust_gym_${i}_${Date.now()}`;
      const cust: Customer = {
        id: custId,
        workspace_id: workspace.id,
        name: memberName,
        email: memberEmail,
        phone: `+9198${(10000000 + i).toString().slice(-8)}`,
        currency: 'INR',
        country: 'IN',
        provider_type: 'razorpay',
        provider_customer_id: `cust_rzp_${i}`,
        current_risk_status: 'healthy',
        lifetime_value_cents: MONTHLY_FEE_CENTS * 12,
        total_recovered_cents: 0,
        is_vip: isVip,
        is_enterprise: isCorporate,
        created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      } as any;

      db.addCustomer(cust);
      generatedCustomers.push(cust);

      // Add active subscription
      db.addSubscription({
        id: `sub_gym_${i}_${Date.now()}`,
        workspace_id: workspace.id,
        customer_id: cust.id,
        provider_type: 'razorpay',
        plan_name: isCorporate ? 'Corporate Fitness Annual Pass' : 'Standard Monthly Membership',
        amount_cents: MONTHLY_FEE_CENTS,
        currency: 'INR',
        billing_interval: 'month',
        status: 'active',
        created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    }

    // 2. Select 50 members to experience realistic payment failures
    // - 35 soft declines (insufficient funds, bank downtime, authentication required)
    // - 10 expired cards
    // - 3 VIP / corporate group memberships (flagged for staff review)
    // - 2 dispute / chargeback fraud risks (flagged as blocked)
    const failureScenarios = [
      ...Array(25).fill({ category: 'insufficient_funds', code: 'INSUFFICIENT_FUNDS', msg: 'Account balance insufficient for subscription debit' }),
      ...Array(10).fill({ category: 'expired_card', code: 'CARD_EXPIRED', msg: 'Card validity expired on billing cycle' }),
      ...Array(10).fill({ category: 'bank_related_failure', code: 'BANK_DOWNTIME', msg: 'Issuer bank network temporarily unavailable' }),
      { category: 'payment_method_declined', code: 'HIGH_VALUE_VIP', msg: 'VIP executive membership recurring charge declined', isVipCase: true },
      { category: 'payment_method_declined', code: 'CORPORATE_REVIEW', msg: 'Corporate account billing authorization pending review', isCorporateCase: true },
      { category: 'payment_method_declined', code: 'CORPORATE_REVIEW', msg: 'Corporate team member gym pass billing issue', isCorporateCase: true },
      { category: 'fraud_risk', code: 'DISPUTE_SUSPECTED', msg: 'Payment stopped due to cardholder dispute claim', isDispute: true },
      { category: 'fraud_risk', code: 'CHARGEBACK_SUSPECTED', msg: 'Unauthorized charge report flagged by bank', isFraud: true },
    ];

    const failureCategories: Record<string, number> = {};
    const createdOpportunities: RecoveryOpportunity[] = [];

    for (let i = 0; i < FAILED_PAYMENTS_COUNT; i++) {
      const scenario = failureScenarios[i];
      const customer = generatedCustomers[i];

      failureCategories[scenario.category] = (failureCategories[scenario.category] || 0) + 1;

      // Ingest failed invoice
      const invoiceResult = db.createManualFailedInvoice(workspace.id, {
        customerId: customer.id,
        amountCents: MONTHLY_FEE_CENTS,
        currency: 'INR',
        providerFailureCode: scenario.code,
        rawErrorMessage: scenario.msg,
        failureCategory: scenario.category as any,
        planName: customer.is_enterprise ? 'Corporate Fitness Annual Pass' : 'Standard Monthly Membership',
      });

      const opp = invoiceResult.opportunity;

      if (scenario.isDispute) {
        opp.has_active_dispute = true;
        opp.dispute_status = 'active';
      }
      if (scenario.isFraud) {
        opp.is_fraud = true;
      }

      createdOpportunities.push(opp);
    }

    // 3. Run Policy Engine Arbitration
    let autonomousCount = 0;
    let manualReviewCount = 0;
    let blockedCount = 0;
    const settings = AutopilotService.getSettings(workspace.id);

    for (const opp of createdOpportunities) {
      const cust = db.getCustomerById(opp.customer_id, workspace.id)!;
      const decision = AutopilotPolicyEngine.evaluate(opp, cust, workspace, settings);
      opp.policy_decision = decision;

      if (decision.decision === 'AUTONOMOUS') {
        autonomousCount++;
      } else if (decision.decision === 'MANUAL_REVIEW') {
        manualReviewCount++;
      } else {
        blockedCount++;
      }
    }

    // 4. Autonomous Recovery Actions: Generate links & dispatch outreach
    let linksGenerated = 0;
    let communicationsDispatched = 0;
    const channelsUsed: Record<string, number> = {};

    for (const opp of createdOpportunities) {
      if (opp.policy_decision?.decision === 'AUTONOMOUS') {
        // Ensure 1-click recovery link
        const linkInfo = AutopilotService.ensureOpportunityRecoveryLink(workspace.id, opp);
        linksGenerated++;

        // Process autonomous workflow
        const autoProcess = await AutonomousRecoveryEngine.processOpportunity(workspace.id, opp.id);
        if (autoProcess.executed && autoProcess.workflow) {
          const dispatchRes = await RecoveryDispatchEngine.dispatchWorkflow(workspace.id, autoProcess.workflow.id);
          if (dispatchRes.executed && dispatchRes.dispatch) {
            communicationsDispatched++;
            const ch = dispatchRes.dispatch.channel;
            channelsUsed[ch] = (channelsUsed[ch] || 0) + 1;
          }
        }
      }
    }

    // 5. Payment Recovery Execution:
    // Out of 45 autonomous communications, 38 members successfully settle within the recovery cycle.
    const autonomousOpps = createdOpportunities.filter((o) => o.policy_decision?.decision === 'AUTONOMOUS');
    const SUCCESSFUL_RECOVERIES = 38;
    let paymentsRecovered = 0;

    for (let i = 0; i < SUCCESSFUL_RECOVERIES; i++) {
      const opp = autonomousOpps[i];
      const providerPaymentId = `pay_rzp_rec_${Date.now()}_${i + 1}`;

      // Simulate customer updating card / smart retry clearing
      const settleResult = db.settleRecoveryPayment(
        opp.id,
        {
          amountCents: MONTHLY_FEE_CENTS,
          providerPaymentId,
          method: i % 2 === 0 ? 'customer_self_service_link' : 'smart_retry_upi',
        },
        workspace.id
      );

      if (settleResult.success) {
        paymentsRecovered++;
      }
    }

    // 6. Compute Accounting & Ledger Results
    const recoveredAmountCents = paymentsRecovered * MONTHLY_FEE_CENTS;
    const unrecoveredAmountCents = (FAILED_PAYMENTS_COUNT - paymentsRecovered) * MONTHLY_FEE_CENTS;
    const recoveryRatePercent = Math.round((paymentsRecovered / FAILED_PAYMENTS_COUNT) * 100);

    const revenueEvents = db.getRevenueEvents(workspace.id);
    const updatedMetrics = db.getMetrics(workspace.id);

    return {
      workspace,
      totalMembers: TOTAL_MEMBERS,
      monthlyFeeInr: MONTHLY_FEE_CENTS / 100,
      totalAtRiskInr: (FAILED_PAYMENTS_COUNT * MONTHLY_FEE_CENTS) / 100,
      failedPaymentsCount: FAILED_PAYMENTS_COUNT,
      detection: {
        failuresDetected: FAILED_PAYMENTS_COUNT,
        opportunitiesCreated: createdOpportunities.length,
        failureCategories,
      },
      policyArbitration: {
        autonomousCount,
        manualReviewCount,
        blockedCount,
      },
      recoveryActions: {
        linksGenerated,
        communicationsDispatched,
        channelsUsed,
      },
      paymentRecovery: {
        paymentsRecovered,
        recoveredAmountInr: recoveredAmountCents / 100,
        unrecoveredAmountInr: unrecoveredAmountCents / 100,
        recoveryRatePercent,
      },
      accounting: {
        revenueEventsLogged: revenueEvents.length,
        invoicesMarkedPaid: paymentsRecovered,
        customerRiskStatusesUpdated: paymentsRecovered,
        auditLogsRecorded: db.getAuditLogs(workspace.id).length,
      },
      dashboardVerification: {
        heroMetricRevenueRecovered: `₹${(recoveredAmountCents / 100).toLocaleString('en-IN')}`,
        revenueRecoverableRemaining: `₹${(unrecoveredAmountCents / 100).toLocaleString('en-IN')}`,
        approvalRequiredCount: manualReviewCount,
        activeWorkflowsCount: autonomousCount - paymentsRecovered,
      },
    };
    } finally {
      db.setPersistenceEnabled(true);
      db.persist();
    }
  }
}
