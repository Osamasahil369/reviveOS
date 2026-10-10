export type {
  Workspace,
  User,
  Membership,
  UserRole,
  ProviderType,
  ProviderStatus,
  ProviderConnection,
  Customer,
  Subscription,
  Invoice,
  Payment,
  PaymentFailure,
  FailureCategory,
  RecoveryCampaign,
  RecoveryStep,
  RecoveryOpportunity,
  RecoveryStatus,
  RecoveryEvent,
  CustomerTimelineEvent,
  RevenueEvent,
  WebhookEventRecord,
  AuditLog,
} from '../../src/types/index.js';

import {
  Workspace,
  User,
  Membership,
  UserRole,
  ProviderType,
  ProviderStatus,
  ProviderConnection,
  Customer,
  Subscription,
  Invoice,
  Payment,
  PaymentFailure,
  FailureCategory,
  RecoveryCampaign,
  RecoveryStep,
  RecoveryOpportunity,
  RecoveryStatus,
  RecoveryEvent,
  CustomerTimelineEvent,
  RevenueEvent,
  WebhookEventRecord,
  AuditLog,
} from '../../src/types/index.js';

export interface SupabaseWorkspaceRow {
  id: string;
  name: string;
  slug: string;
  currency: string;
  business_type: string;
  timezone?: string;
  is_demo: boolean;
  recovery_rules?: Record<string, any>;
  email_config?: Record<string, any>;
  sms_config?: Record<string, any>;
  portal_config?: Record<string, any>;
  security_config?: Record<string, any>;
  subscription_plan?: Record<string, any>;
  onboarding_dismissed?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseUserRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface SupabaseMembershipRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
}

export interface SupabaseProviderConnectionRow {
  id: string;
  workspace_id: string;
  provider_type: ProviderType;
  status: ProviderStatus;
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  secondary_webhook_secret_encrypted?: string | null;
  secondary_webhook_secret_expires_at?: string | null;
  is_live: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SupabaseCustomerRow {
  id: string;
  workspace_id: string;
  provider_type: ProviderType;
  provider_customer_id: string;
  email: string;
  name: string;
  phone: string | null;
  country: string;
  currency: string;
  lifetime_value_cents: number;
  total_recovered_cents: number;
  current_risk_status: 'healthy' | 'at_risk' | 'recovered' | 'churned';
  created_at: string;
  updated_at: string;
}

export interface SupabaseSubscriptionRow {
  id: string;
  workspace_id: string;
  customer_id: string;
  provider_type: ProviderType;
  provider_subscription_id: string;
  plan_name: string;
  amount_cents: number;
  currency: string;
  billing_interval: string;
  custom_interval_count?: number | null;
  custom_interval_unit?: string | null;
  status: string;
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
  previous_billing_date?: string | null;
  next_billing_date?: string | null;
  renewal_count: number;
  trial_days?: number | null;
  trial_start_date?: string | null;
  trial_end_date?: string | null;
  is_in_trial?: boolean;
  grace_period_days?: number | null;
  grace_period_end_date?: string | null;
  is_in_grace?: boolean;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseInvoiceRow {
  id: string;
  workspace_id: string;
  customer_id: string;
  subscription_id: string | null;
  provider_type: ProviderType;
  provider_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
  updated_at?: string;
}

export interface SupabasePaymentRow {
  id: string;
  workspace_id: string;
  customer_id: string;
  invoice_id: string | null;
  provider_type: ProviderType;
  provider_payment_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  payment_method_type: string | null;
  payment_method_last4: string | null;
  created_at: string;
}

export interface SupabasePaymentFailureRow {
  id: string;
  workspace_id: string;
  customer_id: string;
  payment_id: string | null;
  invoice_id: string | null;
  amount_cents: number;
  currency: string;
  provider_type: ProviderType;
  provider_failure_code: string | null;
  normalized_category: FailureCategory;
  raw_error_message: string | null;
  occurred_at: string;
  is_resolved: boolean;
  created_at: string;
}

export interface SupabaseRecoveryOpportunityRow {
  id: string;
  workspace_id: string;
  customer_id: string;
  payment_failure_id: string;
  campaign_id: string | null;
  current_step_number: number;
  status: RecoveryStatus;
  amount_at_risk_cents: number;
  currency: string;
  failure_category: FailureCategory;
  recommended_action: string;
  recovery_token: string;
  payment_link_url: string | null;
  recovered_at: string | null;
  recovered_amount_cents: number;
  next_action_due_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SupabaseRecoveryEventRow {
  id: string;
  opportunity_id: string;
  workspace_id: string;
  event_type: string;
  channel: string;
  status: string;
  details: Record<string, any>;
  created_at: string;
}

export interface SupabaseCustomerTimelineEventRow {
  id: string;
  customer_id: string;
  workspace_id: string;
  event_type: string;
  title: string;
  description: string | null;
  actor: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SupabaseRevenueEventRow {
  id: string;
  workspace_id: string;
  opportunity_id: string | null;
  customer_id: string;
  provider_type: ProviderType;
  event_type: string;
  amount_cents: number;
  currency: string;
  recovered_via: string;
  recorded_at: string;
}

export interface SupabaseWebhookEventRow {
  id: string;
  workspace_id: string | null;
  provider_type: ProviderType;
  provider_event_id: string;
  event_type: string;
  idempotency_key?: string | null;
  status: 'processed' | 'ignored' | 'failed' | 'duplicate';
  error_message: string | null;
  payload_summary?: string | null;
  payload: Record<string, any>;
  processing_result?: Record<string, any>;
  headers?: Record<string, string>;
  received_at?: string;
  processed_at: string;
}

export interface SupabaseAuditLogRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, any>;
  ip_address: string | null;
  created_at: string;
}
