/**
 * Revenue Recovery OS - Shared Domain Types
 * Multi-tenant failed payment recovery & revenue dunning engine
 */

export type ProviderType =
  | 'stripe'
  | 'razorpay'
  | 'paypal'
  | 'phonepe'
  | 'gpay'
  | 'paytm'
  | 'bharatpe'
  | 'cashfree'
  | 'ccavenue'
  | 'payu'
  | 'square'
  | 'adyen'
  | 'paddle';

export type ProviderStatus = 'connected' | 'syncing' | 'error' | 'disconnected';

export type FailureCategory =
  | 'insufficient_funds'
  | 'expired_card'
  | 'invalid_payment_method'
  | 'payment_method_declined'
  | 'authentication_required'
  | 'bank_related_failure'
  | 'temporary_provider_failure'
  | 'other_recoverable_failure'
  | 'unrecoverable_failure';

export type RecoveryStatus =
  | 'new'
  | 'active'
  | 'contacted'
  | 'payment_retry_pending'
  | 'recovered'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'paused'
  | 'escalated'
  | 'not_recoverable';

export interface RecoveryRulesConfig {
  smart_retries_enabled: boolean;
  max_retry_attempts: number;
  retry_delays_days: number[];
  default_grace_period_days: number;
  auto_cancel_subscription_on_exhaustion: boolean;
  notify_customer_on_each_retry: boolean;
}

export interface EmailSenderConfig {
  provider: 'resend' | 'sendgrid' | 'postmark' | 'ses' | 'mock';
  sender_name: string;
  from_email: string;
  reply_to_email: string;
  custom_domain_verified: boolean;
}

export interface SmsProviderConfig {
  provider: 'twilio' | 'gupshup' | 'msg91' | 'aws_sns' | 'mock';
  account_sid?: string;
  sender_id?: string;
  enabled: boolean;
}

export interface PortalBrandingConfig {
  company_name: string;
  brand_color: string;
  logo_url?: string;
  support_email: string;
  terms_url?: string;
  privacy_url?: string;
  header_tagline?: string;
  accepted_methods: Array<'card' | 'apple_pay' | 'google_pay' | 'ach' | 'sepa' | 'upi' | 'paypal'>;
}

export interface EnterpriseSecurityConfig {
  mfa_required: boolean;
  session_timeout_minutes: number;
  ip_allowlist: string[];
  webhook_secondary_secret?: string;
  webhook_rotation_expires_at?: string;
  soc2_attestation_status: 'ready' | 'in_audit' | 'certified';
}

export type AutopilotDecision = 'AUTONOMOUS' | 'MANUAL_REVIEW' | 'BLOCKED';

export interface AutopilotSettings {
  auto_scans_enabled: boolean;
  auto_plans_enabled: boolean;
  auto_retry_scheduling_enabled: boolean;
  pause_all_automation: boolean;
  // Workspace Policy Settings
  auto_recover_limit_cents: number;
  auto_recover_preset?: '100' | '500' | '1000' | 'custom';
  vip_customer_protection: boolean;
  enterprise_account_protection: boolean;
}

export interface PolicyAuditEntry {
  id: string;
  workspace_id: string;
  opportunity_id?: string;
  customer_id?: string;
  rule_evaluated: string;
  decision: AutopilotDecision;
  reason: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface PolicyEvaluationResult {
  decision: AutopilotDecision;
  reason: string;
  rule_evaluated: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export type AutonomousWorkflowState =
  | 'queued'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AutonomousRecoveryOutcome =
  | 'recovered'
  | 'pending'
  | 'failed'
  | 'expired';

export interface AutonomousRetrySchedule {
  id: string;
  workspace_id: string;
  workflow_id: string;
  opportunity_id: string;
  customer_id: string;
  attempt_number: number; // 1, 2, 3
  scheduled_for: string; // ISO date string (Day 1, Day 3, Day 5)
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'skipped';
  amount_cents: number;
  currency: string;
  executed_at?: string;
  created_at: string;
}

export interface AutonomousRecoveryWorkflow {
  id: string;
  workspace_id: string;
  opportunity_id: string;
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  state: AutonomousWorkflowState;
  outcome: AutonomousRecoveryOutcome;
  amount_at_risk_cents: number;
  currency: string;
  policy_decision: 'AUTONOMOUS';
  delivery_preparation: {
    status: 'ready' | 'pending';
    recovery_link_url: string;
    message_subject: string;
    message_preview: string;
    delivery_channel: 'email';
    prepared_at: string;
  };
  retry_schedules: AutonomousRetrySchedule[];
  timeline: {
    id: string;
    action: string;
    timestamp: string;
    status: string;
    details?: string;
  }[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface AutonomousRecoveryMetrics {
  queued_recoveries_count: number;
  scheduled_retries_count: number;
  recovered_revenue_cents: number;
  pending_revenue_cents: number;
  failed_recoveries_count: number;
  total_workflows_count: number;
}

export type DispatchChannel = 'email' | 'sms' | 'hosted_link';

export type DispatchStatus =
  | 'pending'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface RecoveryDispatchRecord {
  id: string;
  workspace_id: string;
  workflow_id: string;
  opportunity_id: string;
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  channel: DispatchChannel;
  status: DispatchStatus;
  recipient: string;
  recovery_link_url: string;
  subject?: string;
  message_body?: string;
  amount_cents: number;
  currency: string;
  provider: string;
  external_message_id?: string;
  scheduled_at?: string;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  paid_at?: string;
  failed_at?: string;
  failure_reason?: string;
  cancelled_at?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RecoveryAttributionRecord {
  id: string;
  workspace_id: string;
  workflow_id: string;
  opportunity_id: string;
  customer_id: string;
  customer_name?: string;
  dispatch_id?: string;
  recovered_amount: number;
  recovered_amount_cents: number;
  currency: string;
  recovery_channel: DispatchChannel | 'manual' | 'smart_retry';
  recovery_time: string;
  time_to_recovery_seconds: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface ChannelPerformanceMetrics {
  channel: DispatchChannel;
  channel_name: string;
  dispatched_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  paid_count: number;
  failed_count: number;
  recovered_amount_cents: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  paid_conversion_rate: number;
}

export interface RevenueRecoveryMetrics {
  recovered_revenue_cents: number;
  recovery_rate: number;
  average_recovery_time_seconds: number;
  average_recovery_time_formatted: string;
  total_dispatches: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_paid: number;
  overall_open_rate: number;
  overall_click_rate: number;
  overall_paid_conversion_rate: number;
  channel_performance: Record<DispatchChannel, ChannelPerformanceMetrics>;
  funnel: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    paid: number;
  };
  revenue_trend: Array<{
    date: string;
    recovered_cents: number;
    count: number;
  }>;
  recent_recoveries: RecoveryAttributionRecord[];
}

export interface AutomationEventRecord {
  id: string;
  workspace_id: string;
  event: string;
  trigger: string;
  timestamp: string;
  status: 'completed' | 'running' | 'failed' | 'paused' | 'skipped';
  details?: Record<string, any>;
}

export type PlatformPlanTier = 'founding' | 'starter' | 'growth' | 'business' | 'enterprise';
export type PlatformBillingCycle = 'monthly' | 'annual';
export type PlatformSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
export type SupportedCurrency = 'INR' | 'USD' | 'GBP' | 'EUR' | 'AED' | 'SGD' | 'AUD';

export interface BillingProfileData {
  workspace_id: string;
  business_name: string;
  billing_email: string;
  billing_phone?: string;
  billing_address: string;
  city: string;
  state: string;
  state_code?: string;
  postal_code: string;
  country: string;
  gstin?: string;
  is_gst_registered: boolean;
  updated_at: string;
}

export interface PlatformInvoiceData {
  id: string;
  invoice_number: string;
  workspace_id: string;
  customer_id?: string;
  subscription_id: string;
  provider_payment_id?: string;
  plan_tier: string;
  billing_cycle: 'monthly' | 'annual';
  currency: SupportedCurrency;
  amount_subunits: number;
  taxable_amount_subunits: number;
  tax_amount_subunits: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  invoice_date: string;
  paid_at?: string;
  billing_profile: BillingProfileData;
  download_url?: string;
}

export interface PlatformPlanDefinition {
  id: PlatformPlanTier;
  name: string;
  badge?: string;
  description: string;
  monthlyBaseDollars: number;
  annualBaseDollars: number;
  monthlyBaseCents: number;
  annualBaseCents: number;
  successFeePercent: number;
  monthlyRecoveryCapCents: number;
  volumeCapDisplay: string;
  trialDays: number;
  popular?: boolean;
  features: string[];
  pricing?: Record<SupportedCurrency, {
    monthlyAmount: number;
    monthlyAmountSubunit: number;
    annualAmount: number;
    annualAmountSubunit: number;
    currency: SupportedCurrency;
    currencySymbol: string;
  }>;
}

export interface AuthoritativeSubscriptionData {
  workspace_id: string;
  subscription_id: string;
  customer_id: string;
  plan_id: PlatformPlanTier;
  currency: SupportedCurrency;
  amount: number;
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'paused';
  billing_cycle: PlatformBillingCycle;
  trial_start: string;
  trial_end: string;
  next_billing_date: string;
  cancel_at_period_end: boolean;
  payment_provider: 'razorpay' | 'stripe' | 'manual';
  provider_subscription_id?: string;
  is_founding_customer: boolean;
  founding_customer_number?: number;
  founding_locked_price?: number;
  payment_method?: {
    type: 'card' | 'upi' | 'netbanking';
    last4?: string;
    network?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSubscription {
  subscription_id: string;
  workspace_id: string;
  provider: 'stripe' | 'razorpay' | 'manual';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  plan: PlatformPlanTier;
  status: PlatformSubscriptionStatus;
  billing_cycle: PlatformBillingCycle;
  trial_starts_at: string;
  trial_ends_at: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  card_last4?: string;
  card_brand?: string;
  is_founding_customer?: boolean;
  founding_customer_number?: number;
  founding_locked_price?: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceTrialStatus {
  in_trial: boolean;
  trial_days_total: number;
  trial_days_remaining: number;
  trial_starts_at: string;
  trial_ends_at: string;
  is_warning: boolean; // Day 10+
  is_expired: boolean; // Day 14+
  is_locked: boolean; // Gating enforced
  plan_tier: PlatformPlanTier;
  status: PlatformSubscriptionStatus;
}

export interface PlanPricingDetail {
  monthlyAmount: number;
  monthlyAmountSubunit: number;
  annualAmount: number;
  annualAmountSubunit: number;
  currency: string;
  currencySymbol: string;
}

export interface PlanDefinition {
  id: PlatformPlanTier;
  name: string;
  badge?: string;
  popular?: boolean;
  description: string;
  isFoundingProgram?: boolean;
  maxFoundingSpots?: number;
  features: string[];
  limits?: {
    workspaces: number;
    teamMembers: number;
    monthlyRecoveryCapCents: number;
    sourcesSupported: string[];
  };
  pricing?: any;
  monthlyPriceRupees?: number;
  monthlyPricePaise?: number;
  annualPriceRupees?: number;
  annualPricePaise?: number;
}

export interface WorkspaceSubscriptionPlan {
  plan_tier: 'starter' | 'growth' | 'enterprise';
  billing_interval: 'monthly' | 'annual';
  monthly_base_fee_cents: number;
  success_fee_percent: number;
  monthly_recovery_cap_cents: number;
  current_month_recovered_cents: number;
  next_billing_date: string;
  card_last4: string;
  card_brand: string;
}

export interface OnboardingMilestone {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action_tab: string;
  tag: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone?: string;
  business_type: 'saas' | 'subscription' | 'coaching' | 'membership' | 'gym' | 'ecommerce';
  is_demo?: boolean;
  trial_starts_at?: string;
  trial_ends_at?: string;
  recovery_rules?: RecoveryRulesConfig;
  email_config?: EmailSenderConfig;
  sms_config?: SmsProviderConfig;
  portal_config?: PortalBrandingConfig;
  security_config?: EnterpriseSecurityConfig;
  subscription_plan?: WorkspaceSubscriptionPlan;
  autopilot_settings?: AutopilotSettings;
  onboarding_dismissed?: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
}

export type UserRole = 'owner' | 'admin' | 'operator' | 'member' | 'viewer';

export interface Membership {
  id: string;
  workspace_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  user?: User;
}

export interface AuthSession {
  user: User | null;
  role: UserRole;
  workspace_id: string;
  is_authenticated: boolean;
  token?: string;
}

export interface RlsTestResult {
  table: string;
  action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  role: UserRole;
  workspace_id: string;
  allowed: boolean;
  policy_name: string;
  reason: string;
}

export interface ProviderCapabilities {
  canRetryDirectly: boolean;
  canGeneratePaymentLink: boolean;
  supportsSmartRetries: boolean;
  supportsSubscriptionPausation: boolean;
  supportsCustomerPortal: boolean;
}

export interface ProviderConnection {
  id: string;
  workspace_id: string;
  provider_type: ProviderType;
  status: ProviderStatus;
  api_key?: string;
  api_secret?: string;
  webhook_secret?: string;
  is_live: boolean;
  last_sync_at?: string;
  last_error?: string;
  capabilities: ProviderCapabilities;
  config_summary?: {
    account_id?: string;
    webhook_url?: string;
    has_api_key?: boolean;
    has_webhook_secret?: boolean;
    has_secondary_webhook_secret?: boolean;
    secondary_webhook_secret_expires_at?: string;
    auth_type?: 'oauth' | 'api_key';
    is_oauth?: boolean;
    auto_webhooks_provisioned?: boolean;
  };
  created_at: string;
  updated_at: string;
}

export type ChurnRiskLevel = 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Critical Risk';

export interface CustomerHealthScore {
  score: number; // 0 - 100
  risk_level: ChurnRiskLevel;
  factors: {
    failed_payments_penalty: number;
    retries_penalty: number;
    last_payment_penalty: number;
    invoice_age_penalty: number;
    loyalty_bonus: number;
  };
  risk_reasons: string[];
}

export interface CustomerTimelineEvent {
  id: string;
  customer_id: string;
  workspace_id: string;
  event_type:
    | 'customer_created'
    | 'subscription_created'
    | 'renewal_generated'
    | 'payment_success'
    | 'payment_succeeded'
    | 'payment_failure'
    | 'recovery_email_delivered'
    | 'recovery_email_sent'
    | 'recovery_email_opened'
    | 'recovery_link_clicked'
    | 'payment_link_clicked'
    | 'payment_recovered'
    | 'card_updated'
    | 'recovery_completed'
    | 'email_sent'
    | 'sms_sent'
    | 'whatsapp_sent'
    | 'recovery_attempt'
    | 'smart_retry_attempted'
    | 'subscription_cancelled'
    | 'recovery_paused'
    | 'recovery_escalated'
    | 'magic_link_dispatched'
    | 'gdpr_erasure_processed'
    | 'note_added';
  title: string;
  description: string;
  actor?: string; // 'System Automation' | 'Operator' | 'Webhook'
  metadata?: Record<string, any>;
  created_at: string;
  // Enriched fields
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_currency?: string;
  provider_type?: ProviderType;
  gateway_response?: string;
  recovery_step?: number | string;
  source?: string;
}

export interface Customer {
  id: string;
  workspace_id: string;
  provider_type: ProviderType;
  provider_customer_id: string;
  email: string;
  name: string;
  phone?: string;
  country: string;
  currency: string;
  lifetime_value_cents: number;
  total_recovered_cents: number;
  current_risk_status: 'healthy' | 'at_risk' | 'recovered' | 'churned';
  health_score?: CustomerHealthScore | number;
  health_grade?: string;
  health_reasons?: string[];
  is_vip?: boolean;
  is_enterprise?: boolean;
  account_type?: 'standard' | 'smb' | 'enterprise';
  tier?: string;
  is_high_risk?: boolean;
  risk_level?: string;
  risk_score?: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export type BillingIntervalType =
  | 'one_time'
  | 'daily'
  | 'weekly'
  | 'bi_weekly'
  | 'monthly'
  | 'every_2_months'
  | 'quarterly'
  | 'every_6_months'
  | 'yearly'
  | 'custom';

export type CustomIntervalUnit = 'days' | 'weeks' | 'months' | 'years';

export interface Subscription {
  id: string;
  workspace_id: string;
  customer_id: string;
  provider_type: ProviderType;
  provider_subscription_id: string;
  plan_name: string;
  amount_cents: number;
  currency: string;
  billing_interval: BillingIntervalType;
  custom_interval_count?: number;
  custom_interval_unit?: CustomIntervalUnit;
  status: 'active' | 'past_due' | 'unpaid' | 'canceled' | 'paused' | 'trialing';
  subscription_start_date: string;
  subscription_end_date?: string;
  previous_billing_date?: string;
  next_billing_date?: string;
  renewal_count: number;
  trial_days?: number;
  trial_start_date?: string;
  trial_end_date?: string;
  is_in_trial?: boolean;
  grace_period_days?: number;
  grace_period_end_date?: string;
  is_in_grace?: boolean;
  current_period_end: string;
  created_at: string;
  updated_at?: string;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  customer_id: string;
  subscription_id?: string;
  provider_type: ProviderType;
  provider_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'past_due' | 'uncollectible' | 'void';
  due_date: string;
  paid_at?: string;
  hosted_invoice_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface Payment {
  id: string;
  workspace_id: string;
  customer_id: string;
  invoice_id?: string;
  provider_type: ProviderType;
  provider_payment_id: string;
  amount_cents: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending' | 'refunded';
  failure_code?: string;
  failure_message?: string;
  payment_method_type?: string;
  payment_method_last4?: string;
  created_at: string;
}

export interface PaymentFailure {
  id: string;
  workspace_id: string;
  customer_id: string;
  payment_id?: string;
  invoice_id?: string;
  amount_cents: number;
  currency: string;
  provider_type: ProviderType;
  provider_failure_code?: string;
  normalized_category: FailureCategory;
  raw_error_message: string;
  occurred_at: string;
  is_resolved: boolean;
  created_at: string;
}

export interface RecoveryStep {
  id?: string;
  step_number: number;
  delay_hours: number;
  action_type: 'send_email' | 'smart_retry' | 'send_sms' | 'in_app_notice';
  email_subject?: string;
  email_subject_template?: string;
  email_body_template?: string;
  metadata?: Record<string, any>;
  is_active?: boolean;
}

export type DunningStep = RecoveryStep;

export interface RecoveryCampaign {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  trigger_event?: string;
  is_active: boolean;
  target_categories: FailureCategory[];
  min_amount_cents: number;
  steps: RecoveryStep[];
  created_at: string;
  updated_at: string;
}

export interface RecoveryOpportunity {
  id: string;
  workspace_id: string;
  customer_id: string;
  payment_failure_id: string;
  campaign_id?: string;
  current_step_number: number;
  status: RecoveryStatus;
  amount_at_risk_cents: number;
  currency: string;
  failure_category: FailureCategory;
  recommended_action: string;
  recovery_token: string;
  payment_link_url?: string;
  checkout_url?: string;
  customer: Customer;
  payment_failure: PaymentFailure;
  invoice?: Invoice;
  subscription?: Subscription;
  recovery_plan?: any;
  policy_decision?: PolicyEvaluationResult;
  is_fraud?: boolean;
  is_chargeback?: boolean;
  has_active_dispute?: boolean;
  dispute_status?: 'none' | 'active' | 'under_review' | 'won' | 'lost';
  dispute_id?: string;
  recovered_at?: string;
  recovered_amount_cents: number;
  next_action_due_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RecoveryEvent {
  id: string;
  opportunity_id: string;
  workspace_id: string;
  event_type:
    | 'opportunity_created'
    | 'step_executed'
    | 'email_sent'
    | 'email_opened'
    | 'payment_link_clicked'
    | 'retry_attempted'
    | 'retry_succeeded'
    | 'retry_failed'
    | 'payment_method_updated'
    | 'revenue_recovered'
    | 'workflow_stopped'
    | 'manual_note_added';
  channel: 'email' | 'provider_retry' | 'hosted_portal' | 'system' | 'manual';
  status: 'success' | 'failed' | 'pending';
  details: Record<string, any>;
  created_at: string;
}

export interface RevenueEvent {
  id: string;
  workspace_id: string;
  opportunity_id?: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  provider_type: ProviderType;
  event_type: 'revenue_recovered' | 'revenue_lost' | 'churn_prevented';
  amount_cents: number;
  currency: string;
  provider_payment_id?: string;
  recovered_via: string;
  recorded_at: string;
}

export type EmailProviderType = 'resend' | 'smtp' | 'sendgrid' | 'ses' | 'mock';

export type EmailDeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'recovered'
  | 'bounced'
  | 'failed'
  | 'suppressed';

export type EmailTemplateType =
  | 'payment_failed'
  | 'reminder_day2'
  | 'reminder_day4'
  | 'urgent_reminder_day7'
  | 'final_attempt_day10'
  | 'update_payment_method'
  | 'recovery_link'
  | 'final_reminder'
  | 'payment_recovered'
  | 'welcome_to_reviveos'
  | 'import_completed'
  | 'custom';

export interface EmailProviderConfig {
  primary_provider: EmailProviderType;
  provider_priority: EmailProviderType[];
  // Workspace merchant identity (Critical: Never ReviveOS)
  business_name?: string;
  from_name?: string;
  sender_address?: string;
  reply_to_address?: string;
  verification_status?: 'connected' | 'pending_verification' | 'failed' | 'unverified';
  verification_error?: string;
  verified_at?: string;
  resend?: {
    api_key?: string;
    from_email?: string;
    from_name?: string;
    reply_to?: string;
  };
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
    from_email?: string;
    from_name?: string;
    reply_to?: string;
  };
  sendgrid?: {
    api_key?: string;
    from_email?: string;
    from_name?: string;
    reply_to?: string;
  };
  ses?: {
    access_key_id?: string;
    secret_access_key?: string;
    region?: string;
    smtp_username?: string;
    smtp_password?: string;
    from_email?: string;
    from_name?: string;
    reply_to?: string;
  };
  branding?: {
    company_name?: string;
    brand_color?: string;
    logo_url?: string;
    support_email?: string;
    footer_text?: string;
  };
}

export interface EmailSuppressionRecord {
  id: string;
  workspace_id: string;
  email: string;
  reason: 'hard_bounce' | 'complaint' | 'unsubscribe' | 'manual';
  suppressed_at: string;
  source?: string;
}

export interface EmailDeliveryLog {
  id: string;
  workspace_id: string;
  opportunity_id?: string;
  customer_id?: string;
  customer_name?: string;
  to_email: string;
  subject: string;
  template_id: EmailTemplateType | string;
  provider: EmailProviderType;
  status: EmailDeliveryStatus;
  attempts: number;
  failover_count: number;
  failover_history?: Array<{
    provider: EmailProviderType;
    error: string;
    timestamp: string;
  }>;
  message_id?: string;
  error_message?: string;
  body_html?: string;
  body_text?: string;
  sent_at: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  bounced_at?: string;
  // Recovery specific tracking & attribution
  is_recovery_email?: boolean;
  sequence_step?: number; // 0: Day 0, 1: Day 2, 2: Day 4, 3: Day 7, 4: Day 10
  recovered_at?: string;
  recovered_amount_cents?: number;
  recovery_attribution_id?: string;
  metadata?: Record<string, any>;
}

export interface EmailHealthMetrics {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  total_bounced: number;
  total_opened: number;
  total_clicked: number;
  total_suppressed: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  delivery_rate: number;
  provider_statuses: Record<
    EmailProviderType,
    {
      configured: boolean;
      healthy: boolean;
      last_used?: string;
      last_error?: string;
    }
  >;
  recent_errors: Array<{
    message: string;
    provider: string;
    timestamp: string;
    to: string;
  }>;
}

export interface EmailMessage {
  id: string;
  workspace_id: string;
  opportunity_id: string;
  to_email: string;
  subject: string;
  body_html: string;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'bounced' | 'suppressed';
  provider: 'resend' | 'sendgrid' | 'postmark' | 'ses' | 'smtp' | 'mock';
  sent_at: string;
  opened_at?: string;
  clicked_at?: string;
}

export interface WebhookEventRecord {
  id: string;
  workspace_id?: string;
  provider_type: ProviderType;
  provider_event_id: string;
  event_type: string;
  status: 'processed' | 'ignored' | 'failed' | 'duplicate';
  error_message?: string;
  payload_summary: string;
  payload?: Record<string, any> | any;
  actions_triggered?: string[];
  headers?: Record<string, string>;
  processed_at: string;
}

export interface AuditLog {
  id: string;
  workspace_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface CurrencyMetricTotals {
  currency: string;
  revenue_recovered_cents: number;
  revenue_at_risk_cents: number;
  recovered_this_month_cents: number;
  recovered_last_month_cents: number;
  mrr_cents: number;
  arr_cents: number;
  total_revenue_cents: number;
  customer_lifetime_value_cents: number;
}

export interface RecoveryMetrics {
  revenue_recovered_cents: number;
  revenue_at_risk_cents: number;
  recovery_rate_percentage: number | null;
  total_failed_payments_count: number;
  active_opportunities_count: number;
  active_campaigns_count: number;
  customers_at_risk_count: number;
  churn_prevented_count: number | null;
  currency: string;
  recovered_this_month_cents: number;
  recovered_last_month_cents: number;
  average_recovery_time_hours: number;
  roi_multiple: number;
  mrr_cents: number;
  arr_cents: number;
  churn_rate_percentage: number;
  customer_lifetime_value_cents: number;
  active_subscriptions_count: number;
  total_revenue_cents: number;
  totals_by_currency?: Record<string, CurrencyMetricTotals>;
  totalsByCurrency?: Record<string, CurrencyMetricTotals>;
  autonomous_confidence?: number;
}

export type EnrichedRecoveryOpportunity = RecoveryOpportunity & Partial<OpportunityIntelligenceRecord> & {
  failure_reason?: string;
  customer_name?: string;
};

export interface MetricChartPoint {
  date: string;
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface DashboardChartData {
  revenue_trend: Array<{ period: string; recovered_cents: number; lost_cents: number; mrr_cents: number }>;
  payment_failures: Array<{ period: string; failed_count: number; retries_count: number; recovered_count: number }>;
  subscription_growth: Array<{ period: string; active_count: number; new_count: number; churned_count: number }>;
}

export interface FunnelStage {
  stage: string;
  count: number;
  conversion_rate: number;
  amount_cents: number;
}

export type OpportunityType =
  | 'failed_payment'
  | 'unpaid_invoice'
  | 'renewal_risk'
  | 'churn_risk'
  | 'expansion_candidate';

export type PriorityTier = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';
export type UrgencyLevel = 'immediate' | 'high' | 'medium' | 'low';
export type RecoveryLikelihood = 'high' | 'medium' | 'low';
export type IntelligenceConfidence = 'high' | 'medium' | 'low';

export type RecommendedActionType =
  | 'smart_retry'
  | 'magic_link'
  | 'proactive_renewal'
  | 'customer_outreach'
  | 'review_expansion_evidence'
  | 'manual_review';

export interface OpportunityEvidenceItem {
  key: string;
  label: string;
  value: string | number;
  significance: 'positive' | 'neutral' | 'negative';
  source: 'payment_ledger' | 'subscription_state' | 'customer_profile' | 'gateway_telemetry';
}

export interface FailureCategoryBreakdown {
  category: string;
  label: string;
  count: number;
  totalCents?: number;
  percentage?: number;
  amount_cents?: number;
  recovered_amount_cents?: number;
  recovery_rate?: number;
  recovery_rate_percentage?: number;
}

export interface FactorScoreBreakdown {
  financialValueScore: number;
  urgencyScore: number;
  customerHealthScore: number;
  recoveryLikelihoodScore: number;
  attemptPenaltyScore: number;
  compositeScore: number;
  weights: {
    financialValue: number;
    urgency: number;
    customerHealth: number;
    recoveryLikelihood: number;
    attemptPenalty: number;
  };
}

export type AiStatus = 'generated' | 'fallback' | 'unavailable' | 'failed';

export interface AiEnrichmentResult {
  operatorSummary: string;
  communicationStrategy: {
    recommendedChannel: 'email' | 'sms' | 'hosted_portal' | 'manual_call';
    suggestedSubject?: string;
    suggestedTone: 'empathetic_direct' | 'courteous_reminder' | 'executive_concierge' | 'urgent_security';
    keyTalkingPoints: string[];
  };
  contextualReasoning: string;
  isAiGenerated: boolean;
  aiStatus: AiStatus;
  failureReason?: string;
  generatedAt: string;
  modelUsed?: string;
}

export interface OpportunityIntelligenceRecord {
  id: string;
  opportunityId: string;
  workspaceId: string;
  scoringVersion: string;
  opportunityType: OpportunityType;
  amountCents: number;
  currency: string;
  priority: PriorityTier;
  priorityScore: number;
  urgency: UrgencyLevel;
  recoveryLikelihood: RecoveryLikelihood;
  recoveryLikelihoodScore: number;
  confidence: IntelligenceConfidence;
  expectedValueCents: number;
  reason: string;
  evidence: OpportunityEvidenceItem[];
  rankingExplanation: string;
  recommendedAction: RecommendedActionType;
  recommendedActionLabel: string;
  recommendedTiming: string;
  expectedImpact: string;
  isExpansionCandidate: boolean;
  expansionEvidenceStatus?: 'confirmed_evidence' | 'insufficient_evidence';
  scoreBreakdown: FactorScoreBreakdown;
  aiEnrichment: AiEnrichmentResult;
  opportunity: RecoveryOpportunity;
  customer: Customer;
  subscription?: Subscription;
  invoice?: Invoice;
  paymentFailure?: PaymentFailure;
  evaluatedAt: string;
  updatedAt: string;
}

export interface ActionRecord {
  id: string;
  workspaceId: string;
  opportunityId: string;
  actionType: RecommendedActionType | string;
  channel?: string;
  executedBy: string;
  notes?: string;
  executedAt: string;
  metadata?: Record<string, any>;
}

export interface OutcomeRecord {
  id: string;
  workspaceId: string;
  opportunityId: string;
  outcome: 'recovered' | 'unrecoverable' | 'expired' | 'canceled' | 'partial_recovery';
  recoveredAmountCents: number;
  timeToRecoverySeconds?: number;
  settlementMethod?: string;
  resolvedAt: string;
  feedbackNotes?: string;
}

export type ExpansionEvidenceStatus = 'confirmed_evidence' | 'insufficient_evidence';
export type ExpansionTier = 'EXPANSION_READY' | 'GROWTH_SIGNAL' | 'WATCH' | 'NO_SIGNAL';

export interface ExpansionOpportunityRecord {
  id: string;
  workspaceId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  currentArrCents: number;
  currency: string;
  currentPlan: string;
  expansionTier: ExpansionTier;
  expansionSignal: string;
  evidenceStatus: ExpansionEvidenceStatus;
  evidenceDetails: string[];
  explainableDrivers: string[];
  estimatedValueCents: number | null;
  estimatedValueLabel: string;
  confidence: 'high' | 'medium' | 'low';
  recommendedAction: string;
  evaluatedAt: string;
  customer?: Customer;
  subscription?: Subscription;
}

export interface ExpansionQueueResponse {
  workspaceId: string;
  totalEvaluated: number;
  confirmedCount: number;
  insufficientEvidenceCount: number;
  currency: string;
  generatedAt: string;
  queue: ExpansionOpportunityRecord[];
}

export interface ChurnQueueResponse {
  workspaceId: string;
  totalCustomersEvaluated: number;
  criticalCount: number;
  atRiskCount: number;
  watchCount: number;
  lowRiskCount: number;
  currency: string;
  generatedAt: string;
  queue: any[];
}

export interface CurrencyQueueTotals {
  totalAtRiskCents: number;
  totalExpectedValueCents: number;
  count: number;
}

export interface PrioritizedQueueResponse {
  workspaceId: string;
  scoringVersion: string;
  totalPrioritized: number;
  totalAtRiskCents: number;
  totalExpectedValueCents: number;
  currency: string;
  totalsByCurrency: Record<string, CurrencyQueueTotals>;
  generatedAt: string;
  queue: OpportunityIntelligenceRecord[];
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    byAction: Record<string, number>;
    byLikelihood: Record<string, number>;
  };
}

export type RecoveryStrategyType =
  | 'failed_payment'
  | 'overdue_invoice'
  | 'renewal'
  | 'churn_intervention'
  | 'expansion';

export type CopilotApprovalStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed';

export type CopilotActionState =
  | 'pending'
  | 'recommended'
  | 'approved'
  | 'queued'
  | 'executing'
  | 'succeeded'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'expired';

export interface CopilotStep {
  id: string;
  planId: string;
  stepNumber: number;
  actionType: string;
  actionLabel: string;
  reason: string;
  timing: string;
  expectedPurpose: string;
  state: CopilotActionState;
  isRetryable: boolean;
  requiresHumanApproval: boolean;
  executedAt?: string;
  resultReference?: string;
  failureReason?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ActionSuccessRate {
  actionType: string;
  actionLabel: string;
  totalAttempts: number;
  successfulAttempts: number;
  successRatePercentage: number;
  evidenceStatement: string;
}

export interface HistoricalEvidenceSummary {
  workspaceId: string;
  failureCategory?: string;
  totalOutcomesAnalyzed: number;
  totalActionsAnalyzed: number;
  totalLogsAnalyzed: number;
  hasSufficientSample: boolean;
  actionSuccessRates: ActionSuccessRate[];
  workflowSuccessRate?: {
    totalWorkflows: number;
    successfulWorkflows: number;
    successRatePercentage: number;
  };
  evidenceStatements: string[];
}

export interface CopilotRecoveryPlan {
  id: string;
  workspaceId: string;
  opportunityId: string;
  strategyType: RecoveryStrategyType;
  goal: string;
  why: string[];
  recommendedSteps: CopilotStep[];
  expectedResult: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
  recoverySummary?: string;
  whyThisMatters?: string[];
  recommendedActionSummary?: string;
  alternativeActionsConsidered?: Array<{
    actionType: string;
    actionLabel: string;
    reasonNotSelected: string;
  }>;
  timingRecommendation?: {
    timing: string;
    explanation: string;
  };
  riskAssessment?: {
    level: 'Low' | 'Medium' | 'High';
    explanation: string;
  };
  confidenceExplanation?: {
    level: 'Low' | 'Medium' | 'High';
    explanation: string;
  };
  relevantHistoricalOutcomes?: {
    successPatterns: string[];
    failurePatterns: string[];
    nextBestAction: string;
  };
  expectedRecoveryValueExplanation?: string;
  approvalStatus: CopilotApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  planVersion?: string | number;
  rejectedReason?: string;
  workflowStatus?: 'not_started' | 'executing' | 'success' | 'partial_success' | 'failed';
  workflowOutcome?: 'success' | 'partial_success' | 'failed';
  currentStepIndex?: number;
  historicalEvidence?: HistoricalEvidenceSummary;
}

export interface CopilotExecutionLog {
  id: string;
  workspaceId: string;
  opportunityId: string;
  stepId: string;
  actionType: string;
  stateBefore: CopilotActionState;
  stateAfter: CopilotActionState;
  executedBy: string;
  providerReference?: string;
  resultStatus: 'success' | 'failed';
  failureReason?: string;
  executedAt: string;
}

export type RevenueBrainCategory = 'RECOVERY' | 'CHURN_PREVENTION' | 'EXPANSION';

export interface UnifiedRevenueOpportunity {
  id: string;
  workspaceId: string;
  category: RevenueBrainCategory;
  title: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  financialAmountCents: number;
  expectedValueCents: number;
  currency: string;
  impactScore: number;
  priorityTier: PriorityTier;
  confidence: 'high' | 'medium' | 'low';
  evidenceQuality: 'high' | 'medium' | 'low';
  rankingExplanation: string;
  evidence: string[];
  recommendedAction: string;
  evaluatedAt: string;
  sourceId: string;
  sourceType: 'recovery_opportunity' | 'churn_risk' | 'expansion_opportunity';
  metadata?: Record<string, any>;
}

export interface RevenueBrainResponse {
  workspaceId: string;
  generatedAt: string;
  totalOpportunities: number;
  totalAtRiskCents: number;
  totalRecoverableCents: number;
  totalExpansionValueCents: number;
  summary: {
    recoveryCount: number;
    churnCount: number;
    expansionCount: number;
    p1Count: number;
    p2Count: number;
    p3Count: number;
    p4Count: number;
  };
  opportunities: UnifiedRevenueOpportunity[];
  activeOptimizations?: any[];
  outcomeOptimizationSummary?: any;
}

// ====================================================================
// REVENUE MISSIONS DOMAIN TYPES
// ====================================================================

export type MissionType = 'RECOVERY' | 'RETENTION' | 'EXPANSION';

export type MissionStatus =
  | 'NEW'
  | 'ACTIVE'
  | 'IN_PROGRESS'
  | 'AWAITING_CUSTOMER'
  | 'AWAITING_REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export type MissionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface MissionTimelineEvent {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type?: 'creation' | 'link' | 'notification' | 'engagement' | 'action' | 'completion' | 'review' | 'failure';
}

export interface RevenueMission {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  missionType: MissionType;
  status: MissionStatus;
  priority: MissionPriority;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  revenueAtRisk: number; // In cents for financial precision
  expectedRecovery: number; // In cents
  actualRecoveredRevenue: number; // In cents
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  recommendedActions: string[];
  completedActions: string[];
  timelineEvents: MissionTimelineEvent[];
  confidence: number; // 0 to 100 percentage or 0 to 1
  evidence: string[];
  sourceOpportunityId?: string;
  sourceType?: 'recovery_opportunity' | 'churn_risk' | 'expansion_opportunity' | 'workflow';
  metadata?: Record<string, any>;
}

export interface RevenueMissionMetrics {
  totalMissions: number;
  completedMissions: number;
  failedMissions: number;
  activeMissions: number;
  successRate: number; // Percentage 0 - 100
  successRateFormatted: string;
  revenueRecovered: number; // In cents
  revenueProtected: number; // In cents
  revenueExpanded: number; // In cents
  hasSufficientData: boolean;
  sampleThreshold: number;
}

export interface RevenueOperationsSummary {
  workspaceId: string;
  generatedAt: string;
  todayRecoveredCents: number;
  paymentMethodsUpdatedCount: number;
  failedPaymentsRecoveredCount: number;
  customersAtRiskCount: number;
  nextRecommendedFocus: {
    missionId?: string;
    title: string;
    reason: string;
    targetName: string;
    revenueValueCents: number;
    actionLabel: string;
  } | null;
  factSummaries: string[];
}

// ==========================================
// CUSTOMER IMPORT WIZARD (PRODUCTION PHASE)
// ==========================================

export interface ImportColumnMapping {
  customer_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  subscription_status?: string;
  plan_name?: string;
  mrr?: string;
  arr?: string;
  invoice_amount?: string;
  last_payment_date?: string;
  next_billing_date?: string;
  currency?: string;
  country?: string;
  billing_interval?: string;
  external_id?: string;
}

export interface ImportValidationIssue {
  rowNumber: number;
  field: string;
  value: any;
  message: string;
  type: 'error' | 'warning';
}

export interface ImportValidationSummary {
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  warningRowsCount: number;
  duplicateEmailsInFile: number;
  duplicateEmailsInWorkspace: number;
  missingEmails: number;
  invalidAmounts: number;
  invalidDates: number;
  currencyDetected: string;
}

export interface ImportValidationResult {
  isValid: boolean;
  canProceed: boolean;
  summary: ImportValidationSummary;
  errors: ImportValidationIssue[];
  warnings: ImportValidationIssue[];
  previewRows: Array<Record<string, any>>;
  detectedHeaders: string[];
  suggestedMapping: ImportColumnMapping;
}

export interface PostImportInsights {
  revenueAtRiskCents: number;
  revenueAtRiskFormatted: string;
  activeCustomersCount: number;
  failedPaymentsCount: number;
  recoveryOpportunitiesCount: number;
  totalImportedMrrCents: number;
  totalImportedMrrFormatted: string;
  currency: string;
}

export interface ImportExecutionResult {
  success: boolean;
  auditId: string;
  fileName: string;
  totalRows: number;
  importedCustomersCount: number;
  skippedCustomersCount: number;
  mergedCustomersCount: number;
  createdSubscriptionsCount: number;
  createdInvoicesCount: number;
  createdOpportunitiesCount: number;
  totalImportedRevenueCents: number;
  totalImportedRevenueFormatted: string;
  currency: string;
  insights: PostImportInsights;
  errors: string[];
  importedAt: string;
}

export interface ImportAuditRecord {
  id: string;
  workspace_id: string;
  imported_by_user_id: string;
  imported_by_email: string;
  file_name: string;
  file_size_bytes: number;
  total_rows: number;
  rows_imported: number;
  rows_skipped: number;
  rows_merged: number;
  rows_failed: number;
  status: 'completed' | 'partial' | 'failed';
  currency: string;
  total_revenue_imported_cents: number;
  summary_json: string;
  created_at: string;
}

export interface ImportTemplate {
  id: string;
  name: string;
  businessType: string;
  description: string;
  filename: string;
  csvContent: string;
  headers: string[];
}

// ============================================================================
// UNIVERSAL REVENUE DATA INGESTION FRAMEWORK TYPES
// ============================================================================

export type RevenueSourceCategory =
  | 'payments'
  | 'ecommerce'
  | 'accounting'
  | 'crm'
  | 'files'
  | 'databases'
  | 'universal_api';

export interface ConnectorMeta {
  id: string;
  name: string;
  category: RevenueSourceCategory;
  description: string;
  version: string;
  capabilities: {
    syncMode: 'pull_api' | 'push_webhook' | 'file_upload' | 'db_query' | 'universal_api';
    supportsIncrementalSync: boolean;
    supportsTestConnection: boolean;
    supportsDirectRetry: boolean;
    supportedEntities: Array<'customers' | 'subscriptions' | 'invoices' | 'payments' | 'failures'>;
  };
  configSchema: Array<{
    name: string;
    label: string;
    type: 'text' | 'password' | 'number' | 'boolean' | 'select' | 'textarea' | 'file';
    required: boolean;
    placeholder?: string;
    defaultValue?: any;
    options?: Array<{ label: string; value: string }>;
    description?: string;
  }>;
}

export interface IngestionJob {
  id: string;
  workspaceId: string;
  connectorId: string;
  connectorName: string;
  category: RevenueSourceCategory;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  recordsExtracted: number;
  customersIngested: number;
  subscriptionsIngested: number;
  invoicesIngested: number;
  paymentsIngested: number;
  failuresIngested: number;
  opportunitiesGenerated: number;
  totalAtRiskCents: number;
  currency: string;
  error?: string;
  downstreamPipelineSummary?: {
    scannerExecuted: boolean;
    missionsUpdated: boolean;
    autopilotTriggered: boolean;
    emailRecoveryQueued: boolean;
    revenueBrainRefreshed: boolean;
  };
}

export interface IngestionSummary {
  totalConnectorsAvailable: number;
  totalSourcesConnected: number;
  totalIngestionJobsRun: number;
  totalCustomersUnified: number;
  totalAtRiskRevenueCents: number;
  totalRecoverableRevenueCents: number;
  breakdownByCategory: Record<RevenueSourceCategory, { connectorsCount: number; recordsCount: number }>;
}



