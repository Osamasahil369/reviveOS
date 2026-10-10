import {
  Workspace,
  Customer,
  Subscription,
  Invoice,
  Payment,
  PaymentFailure,
  RecoveryOpportunity,
  RecoveryEvent,
  RevenueEvent,
  CustomerTimelineEvent,
  AutonomousRecoveryWorkflow,
  AutonomousRetrySchedule,
  PolicyAuditEntry,
  RecoveryDispatchRecord,
  ProviderConnection,
  FailureCategory,
  RecoveryStatus,
} from '../../src/types/index.js';
import crypto from 'crypto';

// Comprehensive realistic name lists
const FIRST_NAMES = [
  'Alex', 'Sarah', 'David', 'Elena', 'Marcus', 'Emily', 'James', 'Maya', 'Liam', 'Sophia',
  'Noah', 'Olivia', 'Ethan', 'Ava', 'Lucas', 'Mia', 'Benjamin', 'Amelia', 'Oliver', 'Harper',
  'William', 'Evelyn', 'Henry', 'Abigail', 'Sebastian', 'Emily', 'Jack', 'Ella', 'Alexander', 'Elizabeth',
  'Daniel', 'Camila', 'Matthew', 'Luna', 'Samuel', 'Sofia', 'Joseph', 'Avery', 'Jackson', 'Mila',
  'Mateo', 'Aria', 'David', 'Scarlett', 'John', 'Penelope', 'Owen', 'Layla', 'Julian', 'Chloe',
  'Rohan', 'Priya', 'Vikram', 'Ananya', 'Arjun', 'Meera', 'Karan', 'Sneha', 'Aditya', 'Neha',
  'Hiroshi', 'Yuki', 'Kenji', 'Hana', 'Takashi', 'Aoi', 'Daiki', 'Sakura', 'Ren', 'Yuna',
  'Jean', 'Camille', 'Antoine', 'Claire', 'Mathieu', 'Chloe', 'Julien', 'Manon', 'Nicolas', 'Emma',
  'Lukas', 'Hannah', 'Maximilian', 'Sophie', 'Felix', 'Marie', 'Paul', 'Laura', 'Leon', 'Anna',
];

const LAST_NAMES = [
  'Vance', 'Chen', 'Miller', 'Rostova', 'Sterling', 'Hayes', 'Mercer', 'Patel', 'Kim', 'O\'Connor',
  'Dubois', 'Schmidt', 'Takahashi', 'Zhang', 'Silva', 'Rossi', 'Larsson', 'Novak', 'Santos', 'Kowalski',
  'Johansson', 'Nielsen', 'Fischer', 'Moreau', 'Gomez', 'Rodriguez', 'Fernandez', 'Lopez', 'Martinez', 'Perez',
  'Sharma', 'Verma', 'Gupta', 'Mehta', 'Kapoor', 'Singh', 'Reddy', 'Nair', 'Iyer', 'Chatterjee',
  'Tanaka', 'Sato', 'Suzuki', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida',
  'Blackwood', 'Sinclair', 'Abernathy', 'Kensington', 'Montgomery', 'Wellington', 'Hawthorne', 'Beaumont',
];

const COMPANIES = [
  'Apex Systems', 'Vanguard Data', 'Linear Labs', 'Stripe Ventures', 'Datadog Engine',
  'Cloudflare Edge', 'Retool Stack', 'Figma Cloud', 'Ramp Capital', 'Supabase Hub',
  'Vercel Compute', 'Snowflake Analytics', 'Postgres Corp', 'Scale AI Labs', 'Brex Financial',
  'Notion Workspace', 'Mercury Banking', 'Loom Video API', 'Webflow Engine', 'Miro Boards',
  'Algolia Search', 'Segment Stream', 'Databricks ML', 'LaunchDarkly Flags', 'Sentry Logs',
  'Auth0 Identity', 'Twilio Communications', 'Fastly CDN', 'MongoDB Atlas', 'Redis Cloud',
  'Grafana Metrics', 'PagerDuty OnCall', 'Asana Tasks', 'Monday Workflows', 'ClickUp SaaS',
  'HubSpot Growth', 'Gong Intelligence', 'Apollo Revenue', 'Klaviyo Campaigns', 'Intercom Chat',
  'Zendesk Support', 'Front Inbox', 'HelpScout Desk', 'Drift Conversational', 'Chorus Audio',
  'Fivetran Pipeline', 'dbt Labs Cloud', 'Astronomer Airflow', 'Temporal Orchestration', 'HashiCorp Vault',
  'Confluent Kafka', 'Elasticsearch Search', 'CockroachDB Scale', 'Pinecone Vector', 'Weaviate ML',
  'Chroma Embeddings', 'LangChain Agents', 'Cohere Language', 'Mistral Models', 'Anthropic Hub',
];

const DOMAINS = [
  'io', 'ai', 'cloud', 'dev', 'tech', 'com', 'app', 'co', 'so', 'security', 'saas', 'net',
];

const COUNTRIES = [
  { code: 'US', currency: 'USD', weight: 40 },
  { code: 'GB', currency: 'USD', weight: 15 },
  { code: 'DE', currency: 'USD', weight: 10 },
  { code: 'FR', currency: 'USD', weight: 8 },
  { code: 'IN', currency: 'USD', weight: 10 },
  { code: 'CA', currency: 'USD', weight: 5 },
  { code: 'AU', currency: 'USD', weight: 5 },
  { code: 'SG', currency: 'USD', weight: 4 },
  { code: 'JP', currency: 'USD', weight: 3 },
];

const FAILURE_CATEGORIES: FailureCategory[] = [
  'insufficient_funds',
  'expired_card',
  'bank_related_failure',
  'authentication_required',
  'payment_method_declined',
  'temporary_provider_failure',
];

export interface DemoWorkspaceDataset {
  workspace: Workspace;
  connections: ProviderConnection[];
  customers: Customer[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  payments: Payment[];
  paymentFailures: PaymentFailure[];
  recoveryOpportunities: RecoveryOpportunity[];
  recoveryEvents: RecoveryEvent[];
  revenueEvents: RevenueEvent[];
  customerTimelineEvents: CustomerTimelineEvent[];
  autonomousWorkflows: AutonomousRecoveryWorkflow[];
  autonomousRetrySchedules: AutonomousRetrySchedule[];
  policyAuditLogs: PolicyAuditEntry[];
  recoveryDispatches: RecoveryDispatchRecord[];
}

export function generateCompleteDemoWorkspace(
  workspaceId: string = 'ws_demo_enterprise_live',
  workspaceName: string = 'Acme Cloud Platform (Live Demo)'
): DemoWorkspaceDataset {
  const now = Date.now();
  const DAY_MS = 86400000;

  // 1. WORKSPACE
  const workspace: Workspace = {
    id: workspaceId,
    name: workspaceName,
    slug: 'acme-cloud-demo',
    currency: 'USD',
    timezone: 'America/New_York',
    business_type: 'saas',
    is_demo: true,
    recovery_rules: {
      smart_retries_enabled: true,
      max_retry_attempts: 4,
      retry_delays_days: [1, 3, 5, 7],
      default_grace_period_days: 14,
      auto_cancel_subscription_on_exhaustion: false,
      notify_customer_on_each_retry: true,
    },
    email_config: {
      provider: 'resend',
      sender_name: 'Acme Billing Team',
      from_email: 'billing@acmecloud.io',
      reply_to_email: 'support@acmecloud.io',
      custom_domain_verified: true,
    },
    sms_config: {
      provider: 'twilio',
      sender_id: 'ACMEBILL',
      enabled: true,
    },
    portal_config: {
      company_name: 'Acme Cloud Platform',
      brand_color: '#4ADE80',
      support_email: 'billing@acmecloud.io',
      accepted_methods: ['card', 'apple_pay', 'google_pay'],
    },
    autopilot_settings: {
      auto_scans_enabled: true,
      auto_plans_enabled: true,
      auto_retry_scheduling_enabled: true,
      pause_all_automation: false,
      auto_recover_limit_cents: 50000,
      auto_recover_preset: '500',
      vip_customer_protection: true,
      enterprise_account_protection: true,
    },
    created_at: new Date(now - 120 * DAY_MS).toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 2. PROVIDER CONNECTIONS
  const connections: ProviderConnection[] = [
    {
      id: `conn_stripe_${workspaceId}`,
      workspace_id: workspaceId,
      provider_type: 'stripe',
      status: 'connected',
      is_live: true,
      last_sync_at: new Date(now - 15 * 60000).toISOString(),
      capabilities: {
        canRetryDirectly: true,
        canGeneratePaymentLink: true,
        supportsSmartRetries: true,
        supportsSubscriptionPausation: true,
        supportsCustomerPortal: true,
      },
      config_summary: {
        account_id: 'acct_1LiveAcmeStripe',
        webhook_url: 'https://api.reviveos.io/api/webhooks/stripe',
        has_api_key: true,
        has_webhook_secret: true,
      },
      created_at: new Date(now - 120 * DAY_MS).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: `conn_razorpay_${workspaceId}`,
      workspace_id: workspaceId,
      provider_type: 'razorpay',
      status: 'connected',
      is_live: true,
      last_sync_at: new Date(now - 25 * 60000).toISOString(),
      capabilities: {
        canRetryDirectly: true,
        canGeneratePaymentLink: true,
        supportsSmartRetries: true,
        supportsSubscriptionPausation: true,
        supportsCustomerPortal: true,
      },
      config_summary: {
        account_id: 'rzp_live_AcmePay',
        webhook_url: 'https://api.reviveos.io/api/webhooks/razorpay',
        has_api_key: true,
        has_webhook_secret: true,
      },
      created_at: new Date(now - 120 * DAY_MS).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  // 3. GENERATE 1,000 CUSTOMERS
  const customers: Customer[] = [];
  const subscriptions: Subscription[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const paymentFailures: PaymentFailure[] = [];
  const recoveryOpportunities: RecoveryOpportunity[] = [];
  const recoveryEvents: RecoveryEvent[] = [];
  const revenueEvents: RevenueEvent[] = [];
  const customerTimelineEvents: CustomerTimelineEvent[] = [];
  const autonomousWorkflows: AutonomousRecoveryWorkflow[] = [];
  const autonomousRetrySchedules: AutonomousRetrySchedule[] = [];
  const policyAuditLogs: PolicyAuditEntry[] = [];
  const recoveryDispatches: RecoveryDispatchRecord[] = [];

  // Special Segment Counters
  // Exactly: 100 VIP, 50 Enterprise, 20 Fraud, 20 Chargebacks
  const TOTAL_CUSTOMERS = 1000;
  const VIP_COUNT = 100;
  const ENTERPRISE_COUNT = 50;
  const FRAUD_COUNT = 20;
  const CHARGEBACK_COUNT = 20;

  for (let i = 0; i < TOTAL_CUSTOMERS; i++) {
    const custId = `cust_demo_${i + 1}`;
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length] || LAST_NAMES[i % LAST_NAMES.length];
    const company = COMPANIES[i % COMPANIES.length];
    const domain = DOMAINS[i % DOMAINS.length];
    const cleanCompany = company.toLowerCase().replace(/[^a-z0-9]/g, '');
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${cleanCompany}.${domain}`;
    const fullName = `${firstName} ${lastName}`;

    // Country selection
    const countryObj = COUNTRIES[i % COUNTRIES.length];

    // Determine segments
    const isVip = i < VIP_COUNT;
    const isEnterprise = !isVip && i >= VIP_COUNT && i < VIP_COUNT + ENTERPRISE_COUNT;
    const isFraudCase = i >= VIP_COUNT + ENTERPRISE_COUNT && i < VIP_COUNT + ENTERPRISE_COUNT + FRAUD_COUNT;
    const isChargebackCase = i >= VIP_COUNT + ENTERPRISE_COUNT + FRAUD_COUNT && i < VIP_COUNT + ENTERPRISE_COUNT + FRAUD_COUNT + CHARGEBACK_COUNT;

    // Monthly Spend & LTV
    let monthlySpendCents = 9900; // default $99/mo
    if (isEnterprise) {
      monthlySpendCents = (1500 + (i % 8) * 500) * 100; // $1,500 - $5,000 / mo
    } else if (isVip) {
      monthlySpendCents = (499 + (i % 5) * 200) * 100; // $499 - $1,299 / mo
    } else if (i % 3 === 0) {
      monthlySpendCents = 19900; // $199/mo Pro
    } else if (i % 5 === 0) {
      monthlySpendCents = 4900; // $49/mo Starter
    }

    const lifetimeValueCents = monthlySpendCents * (12 + (i % 24));
    const healthScoreVal = isFraudCase ? 15 : isChargebackCase ? 25 : isEnterprise ? 96 : isVip ? 92 : 75 + (i % 23);

    const customer: Customer = {
      id: custId,
      workspace_id: workspaceId,
      provider_type: i % 4 === 0 ? 'razorpay' : 'stripe',
      provider_customer_id: `cus_live_${crypto.randomBytes(6).toString('hex')}`,
      email,
      name: `${fullName} (${company})`,
      phone: `+1-555-${String(1000 + (i % 9000))}`,
      country: countryObj.code,
      currency: 'USD',
      lifetime_value_cents: lifetimeValueCents,
      total_recovered_cents: 0,
      current_risk_status: isFraudCase ? 'at_risk' : isChargebackCase ? 'at_risk' : 'healthy',
      health_score: healthScoreVal,
      is_vip: isVip,
      is_enterprise: isEnterprise,
      account_type: isEnterprise ? 'enterprise' : isVip ? 'smb' : 'standard',
      created_at: new Date(now - (90 + (i % 90)) * DAY_MS).toISOString(),
      updated_at: new Date(now - (i % 10) * DAY_MS).toISOString(),
    };

    customers.push(customer);

    // Subscription
    const subId = `sub_demo_${i + 1}`;
    const subscription: Subscription = {
      id: subId,
      workspace_id: workspaceId,
      customer_id: custId,
      provider_type: customer.provider_type,
      provider_subscription_id: `sub_live_${crypto.randomBytes(6).toString('hex')}`,
      plan_name: isEnterprise ? 'Enterprise Scale Plan' : isVip ? 'Growth Tier Plan' : 'Professional Plan',
      amount_cents: monthlySpendCents,
      currency: 'USD',
      billing_interval: 'monthly',
      status: isFraudCase ? 'canceled' : isChargebackCase ? 'past_due' : 'active',
      subscription_start_date: customer.created_at,
      renewal_count: 6 + (i % 18),
      current_period_end: new Date(now + 15 * DAY_MS).toISOString(),
      created_at: customer.created_at,
      updated_at: customer.updated_at,
    };
    subscriptions.push(subscription);
  }

  // 4. GENERATE 2,000 FAILED PAYMENTS, 500 SUCCESSFUL RECOVERIES
  const TOTAL_FAILURES = 2000;
  const SUCCESSFUL_RECOVERIES = 500;

  for (let f = 0; f < TOTAL_FAILURES; f++) {
    const customer = customers[f % customers.length];
    const failureId = `pf_demo_${f + 1}`;
    const invoiceId = `inv_demo_${f + 1}`;
    const oppId = `opp_demo_${f + 1}`;
    const daysAgo = Math.max(1, Math.floor((TOTAL_FAILURES - f) / (TOTAL_FAILURES / 90)));
    const occurredAt = new Date(now - daysAgo * DAY_MS - (f % 24) * 3600000).toISOString();

    const isRecoveredOutcome = f < SUCCESSFUL_RECOVERIES;
    const isFraud = (customer as any).is_fraud || (f >= 1960 && f < 1980);
    const isChargeback = (customer as any).has_active_dispute || (f >= 1980 && f < 2000);

    const failureCategory: FailureCategory = isFraud
      ? 'unrecoverable_failure'
      : isChargeback
      ? 'bank_related_failure'
      : FAILURE_CATEGORIES[f % FAILURE_CATEGORIES.length];

    const amountCents = customer.lifetime_value_cents
      ? Math.round(customer.lifetime_value_cents / 12)
      : 9900;

    // Payment Failure Record
    const paymentFailure: PaymentFailure = {
      id: failureId,
      workspace_id: workspaceId,
      customer_id: customer.id,
      invoice_id: invoiceId,
      amount_cents: amountCents,
      currency: 'USD',
      provider_type: customer.provider_type,
      provider_failure_code: isFraud ? 'fraudulent' : isChargeback ? 'chargeback_filed' : 'insufficient_funds',
      normalized_category: failureCategory,
      raw_error_message: isFraud
        ? 'High risk score flagged by card network anti-fraud filter'
        : isChargeback
        ? 'Customer filed bank inquiry or chargeback'
        : 'Your card has insufficient funds to complete this transaction.',
      occurred_at: occurredAt,
      is_resolved: isRecoveredOutcome,
      created_at: occurredAt,
    };
    paymentFailures.push(paymentFailure);

    // Invoice Record
    const invoice: Invoice = {
      id: invoiceId,
      workspace_id: workspaceId,
      customer_id: customer.id,
      subscription_id: subscriptions.find((s) => s.customer_id === customer.id)?.id,
      provider_type: customer.provider_type,
      provider_invoice_id: `in_live_${crypto.randomBytes(6).toString('hex')}`,
      amount_cents: amountCents,
      currency: 'USD',
      status: isRecoveredOutcome ? 'paid' : 'past_due',
      due_date: occurredAt,
      paid_at: isRecoveredOutcome ? new Date(new Date(occurredAt).getTime() + 2 * DAY_MS).toISOString() : undefined,
      created_at: occurredAt,
    };
    invoices.push(invoice);

    // Recovery Status
    let oppStatus: RecoveryStatus = 'active';
    if (isRecoveredOutcome) {
      oppStatus = 'recovered';
    } else if (isFraud) {
      oppStatus = 'paused';
    } else if (f % 5 === 0) {
      oppStatus = 'contacted';
    } else if (f % 7 === 0) {
      oppStatus = 'payment_retry_pending';
    } else if (f % 11 === 0) {
      oppStatus = 'new';
    }

    // Policy Decision
    let decision: 'AUTONOMOUS' | 'MANUAL_REVIEW' | 'BLOCKED' = 'AUTONOMOUS';
    let decisionReason = 'Insufficient funds qualifies for automatic recovery.';

    if (isFraud) {
      decision = 'BLOCKED';
      decisionReason = 'Fraud risk detected. Automated retries blocked for account protection.';
    } else if (customer.is_vip) {
      decision = 'MANUAL_REVIEW';
      decisionReason = 'VIP account flagged for relationship manager confirmation.';
    } else if (customer.is_enterprise) {
      decision = 'MANUAL_REVIEW';
      decisionReason = 'Enterprise high-value invoice requires manual approval.';
    } else if (amountCents >= 50000) {
      decision = 'MANUAL_REVIEW';
      decisionReason = 'Transaction exceeds auto-recovery threshold ($500).';
    }

    const recoveryToken = `recov_tok_${crypto.randomBytes(8).toString('hex')}`;

    // Recovery Opportunity
    const opp: RecoveryOpportunity = {
      id: oppId,
      workspace_id: workspaceId,
      customer_id: customer.id,
      payment_failure_id: failureId,
      current_step_number: isRecoveredOutcome ? 2 : 1,
      status: oppStatus,
      amount_at_risk_cents: isRecoveredOutcome ? 0 : amountCents,
      currency: 'USD',
      failure_category: failureCategory,
      recommended_action:
        failureCategory === 'expired_card'
          ? 'Card Update Link'
          : failureCategory === 'insufficient_funds'
          ? 'Smart Retry (Day 1, 3, 5)'
          : '1-Click Payment Link',
      recovery_token: recoveryToken,
      payment_link_url: `https://app.reviveos.io/pay/${recoveryToken}`,
      customer,
      payment_failure: paymentFailure,
      invoice,
      policy_decision: {
        decision,
        reason: decisionReason,
        rule_evaluated: isFraud ? 'RULE_FRAUD_SHIELD' : customer.is_vip ? 'RULE_VIP_PROTECTION' : 'RULE_AUTONOMOUS_STANDARD',
        timestamp: occurredAt,
      },
      is_fraud: isFraud,
      is_chargeback: isChargeback,
      has_active_dispute: isChargeback,
      dispute_status: isChargeback ? 'active' : 'none',
      recovered_at: isRecoveredOutcome ? new Date(new Date(occurredAt).getTime() + 2 * DAY_MS).toISOString() : undefined,
      recovered_amount_cents: isRecoveredOutcome ? amountCents : 0,
      created_at: occurredAt,
      updated_at: isRecoveredOutcome ? new Date(new Date(occurredAt).getTime() + 2 * DAY_MS).toISOString() : occurredAt,
    };
    recoveryOpportunities.push(opp);

    // If recovered: create RevenueEvent & Payment settlement
    if (isRecoveredOutcome) {
      customer.total_recovered_cents += amountCents;
      customer.current_risk_status = 'recovered';

      const recoveredMethods = ['payment_link', 'smart_retry', 'customer_update', 'portal'];
      const method = recoveredMethods[f % recoveredMethods.length];

      revenueEvents.push({
        id: `rev_evt_${f + 1}`,
        workspace_id: workspaceId,
        opportunity_id: oppId,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: customer.email,
        provider_type: customer.provider_type,
        event_type: 'revenue_recovered',
        amount_cents: amountCents,
        currency: 'USD',
        recovered_via: method,
        recorded_at: opp.recovered_at!,
      });

      recoveryEvents.push({
        id: `rec_evt_${f + 1}`,
        opportunity_id: oppId,
        workspace_id: workspaceId,
        event_type: 'revenue_recovered',
        channel: method === 'smart_retry' ? 'provider_retry' : 'hosted_portal',
        status: 'success',
        details: {
          recovered_amount_cents: amountCents,
          method,
          provider_payment_id: `ch_live_${crypto.randomBytes(6).toString('hex')}`,
        },
        created_at: opp.recovered_at!,
      });
    }

    // Workflows for Active / Recovered
    if (decision === 'AUTONOMOUS' && (oppStatus === 'active' || oppStatus === 'contacted' || oppStatus === 'payment_retry_pending' || isRecoveredOutcome)) {
      const wfId = `wf_demo_${f + 1}`;
      autonomousWorkflows.push({
        id: wfId,
        workspace_id: workspaceId,
        opportunity_id: oppId,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: customer.email,
        state: isRecoveredOutcome ? 'completed' : 'running',
        outcome: isRecoveredOutcome ? 'recovered' : 'pending',
        amount_at_risk_cents: isRecoveredOutcome ? 0 : amountCents,
        currency: 'USD',
        policy_decision: 'AUTONOMOUS',
        delivery_preparation: {
          status: 'ready',
          recovery_link_url: `https://app.reviveos.io/pay/${recoveryToken}`,
          message_subject: `Payment update required for ${customer.name}`,
          message_preview: `Your subscription renewal of $${amountCents / 100} could not be processed. Update payment method securely.`,
          delivery_channel: 'email',
          prepared_at: occurredAt,
        },
        retry_schedules: [
          {
            id: `sched_1_${f + 1}`,
            workspace_id: workspaceId,
            workflow_id: wfId,
            opportunity_id: oppId,
            customer_id: customer.id,
            attempt_number: 1,
            scheduled_for: new Date(new Date(occurredAt).getTime() + 1 * DAY_MS).toISOString(),
            status: isRecoveredOutcome ? 'completed' : 'pending',
            amount_cents: amountCents,
            currency: 'USD',
            created_at: occurredAt,
          },
          {
            id: `sched_2_${f + 1}`,
            workspace_id: workspaceId,
            workflow_id: wfId,
            opportunity_id: oppId,
            customer_id: customer.id,
            attempt_number: 2,
            scheduled_for: new Date(new Date(occurredAt).getTime() + 3 * DAY_MS).toISOString(),
            status: isRecoveredOutcome ? 'skipped' : 'pending',
            amount_cents: amountCents,
            currency: 'USD',
            created_at: occurredAt,
          },
        ],
        timeline: [
          {
            id: `tl_1_${f + 1}`,
            action: 'Payment Failure Ingested',
            timestamp: occurredAt,
            status: 'completed',
          },
          {
            id: `tl_2_${f + 1}`,
            action: 'Recovery Sequence Dispatched',
            timestamp: new Date(new Date(occurredAt).getTime() + 300000).toISOString(),
            status: 'completed',
          },
        ],
        created_at: occurredAt,
        updated_at: isRecoveredOutcome ? opp.recovered_at! : occurredAt,
      });

      // Dispatches
      recoveryDispatches.push({
        id: `disp_demo_${f + 1}`,
        workspace_id: workspaceId,
        workflow_id: wfId,
        opportunity_id: oppId,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: customer.email,
        channel: 'email',
        status: isRecoveredOutcome ? 'paid' : 'delivered',
        recipient: customer.email,
        recovery_link_url: `https://app.reviveos.io/pay/${recoveryToken}`,
        subject: `Payment update required for ${customer.name}`,
        amount_cents: amountCents,
        currency: 'USD',
        provider: 'resend',
        sent_at: occurredAt,
        delivered_at: new Date(new Date(occurredAt).getTime() + 60000).toISOString(),
        opened_at: new Date(new Date(occurredAt).getTime() + 180000).toISOString(),
        paid_at: isRecoveredOutcome ? opp.recovered_at : undefined,
        created_at: occurredAt,
        updated_at: isRecoveredOutcome ? opp.recovered_at! : occurredAt,
      });
    }

    // Policy audit entry
    policyAuditLogs.push({
      id: `pol_aud_${f + 1}`,
      workspace_id: workspaceId,
      opportunity_id: oppId,
      customer_id: customer.id,
      rule_evaluated: isFraud ? 'RULE_FRAUD_SHIELD' : customer.is_vip ? 'RULE_VIP_PROTECTION' : 'RULE_AUTONOMOUS_STANDARD',
      decision,
      reason: decisionReason,
      timestamp: occurredAt,
    });
  }

  return {
    workspace,
    connections,
    customers,
    subscriptions,
    invoices,
    payments,
    paymentFailures,
    recoveryOpportunities,
    recoveryEvents,
    revenueEvents,
    customerTimelineEvents,
    autonomousWorkflows,
    autonomousRetrySchedules,
    policyAuditLogs,
    recoveryDispatches,
  };
}
