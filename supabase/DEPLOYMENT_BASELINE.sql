-- ====================================================================
-- REVENUE RECOVERY OS — CANONICAL FRESH DEPLOYMENT BASELINE
-- Target: Fresh Supabase Project (PostgreSQL 15+)
-- Description: Creates complete multi-tenant schema, indexes, RLS policies,
--              and the canonical atomic settlement stored procedure.
-- Verification: Clean paste-and-run into Supabase SQL Editor.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. EXTENSIONS
-- --------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 2. WORKSPACES (Tenants)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    business_type VARCHAR(100) DEFAULT 'saas' NOT NULL,
    timezone VARCHAR(100) DEFAULT 'UTC',
    is_demo BOOLEAN DEFAULT FALSE NOT NULL,
    recovery_rules JSONB DEFAULT '{}'::jsonb,
    email_config JSONB DEFAULT '{}'::jsonb,
    sms_config JSONB DEFAULT '{}'::jsonb,
    portal_config JSONB DEFAULT '{}'::jsonb,
    security_config JSONB DEFAULT '{}'::jsonb,
    subscription_plan JSONB DEFAULT '{}'::jsonb,
    onboarding_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- --------------------------------------------------------------------
-- 3. USERS & MEMBERSHIPS (Multi-Tenant RBAC)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'owner' NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'member', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(workspace_id, user_id)
);

-- --------------------------------------------------------------------
-- 4. PAYMENT PROVIDER CONNECTIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('stripe', 'razorpay', 'cashfree', 'paypal', 'paddle')),
    status VARCHAR(50) DEFAULT 'disconnected' NOT NULL CHECK (status IN ('connected', 'syncing', 'error', 'disconnected')),
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    webhook_secret_encrypted TEXT,
    secondary_webhook_secret_encrypted TEXT,
    secondary_webhook_secret_expires_at TIMESTAMPTZ,
    is_live BOOLEAN DEFAULT FALSE NOT NULL,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(workspace_id, provider_type)
);

-- --------------------------------------------------------------------
-- 5. CUSTOMERS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL,
    provider_customer_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    country VARCHAR(2) DEFAULT 'US',
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    lifetime_value_cents BIGINT DEFAULT 0 NOT NULL,
    total_recovered_cents BIGINT DEFAULT 0 NOT NULL,
    current_risk_status VARCHAR(50) DEFAULT 'healthy' CHECK (current_risk_status IN ('healthy', 'at_risk', 'recovered', 'churned')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(workspace_id, provider_type, provider_customer_id)
);

-- --------------------------------------------------------------------
-- 6. SUBSCRIPTIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL,
    provider_subscription_id VARCHAR(255) NOT NULL,
    plan_name VARCHAR(255) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    billing_interval VARCHAR(50) DEFAULT 'monthly' NOT NULL,
    custom_interval_count INT,
    custom_interval_unit VARCHAR(20),
    status VARCHAR(50) DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'past_due', 'unpaid', 'canceled', 'paused', 'trialing')),
    subscription_start_date TIMESTAMPTZ,
    subscription_end_date TIMESTAMPTZ,
    previous_billing_date TIMESTAMPTZ,
    next_billing_date TIMESTAMPTZ,
    renewal_count INT DEFAULT 0 NOT NULL,
    trial_days INT DEFAULT 0,
    trial_start_date TIMESTAMPTZ,
    trial_end_date TIMESTAMPTZ,
    is_in_trial BOOLEAN DEFAULT FALSE,
    grace_period_days INT DEFAULT 0,
    grace_period_end_date TIMESTAMPTZ,
    is_in_grace BOOLEAN DEFAULT FALSE,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(workspace_id, provider_type, provider_subscription_id)
);

-- --------------------------------------------------------------------
-- 7. INVOICES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    provider_type VARCHAR(50) NOT NULL,
    provider_invoice_id VARCHAR(255) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    status VARCHAR(50) DEFAULT 'open' NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'past_due', 'uncollectible', 'void')),
    due_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    hosted_invoice_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(workspace_id, provider_type, provider_invoice_id)
);

-- --------------------------------------------------------------------
-- 8. PAYMENTS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    provider_type VARCHAR(50) NOT NULL,
    provider_payment_id VARCHAR(255) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('succeeded', 'failed', 'pending', 'refunded')),
    failure_code VARCHAR(100),
    failure_message TEXT,
    payment_method_type VARCHAR(50),
    payment_method_last4 VARCHAR(4),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(workspace_id, provider_type, provider_payment_id)
);

-- --------------------------------------------------------------------
-- 9. PAYMENT FAILURES (Normalized)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    provider_failure_code VARCHAR(100),
    normalized_category VARCHAR(100) NOT NULL CHECK (normalized_category IN (
        'insufficient_funds',
        'expired_card',
        'invalid_payment_method',
        'payment_method_declined',
        'authentication_required',
        'bank_related_failure',
        'temporary_provider_failure',
        'other_recoverable_failure',
        'unrecoverable_failure'
    )),
    raw_error_message TEXT,
    occurred_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- --------------------------------------------------------------------
-- 10. RECOVERY CAMPAIGNS & STEPS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recovery_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_event VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    target_categories TEXT[] DEFAULT ARRAY['insufficient_funds', 'expired_card', 'payment_method_declined', 'authentication_required', 'bank_related_failure'],
    min_amount_cents BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES recovery_campaigns(id) ON DELETE CASCADE,
    step_number INT NOT NULL,
    delay_hours INT NOT NULL DEFAULT 0,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('send_email', 'smart_retry', 'send_sms', 'in_app_notice')),
    email_subject VARCHAR(255),
    email_body_template TEXT,
    retry_configuration JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(campaign_id, step_number)
);

-- --------------------------------------------------------------------
-- 11. RECOVERY OPPORTUNITIES (Central State Machine)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recovery_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    payment_failure_id UUID NOT NULL REFERENCES payment_failures(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES recovery_campaigns(id) ON DELETE SET NULL,
    current_step_number INT DEFAULT 0 NOT NULL,
    status VARCHAR(50) DEFAULT 'new' NOT NULL CHECK (status IN (
        'new',
        'active',
        'contacted',
        'payment_retry_pending',
        'recovered',
        'failed',
        'expired',
        'cancelled',
        'not_recoverable'
    )),
    amount_at_risk_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    failure_category VARCHAR(100) NOT NULL,
    recommended_action VARCHAR(100) NOT NULL,
    recovery_token VARCHAR(255) UNIQUE,
    token_hash VARCHAR(64),
    token_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    checkout_url TEXT,
    checkout_status VARCHAR(50) DEFAULT 'unpaid',
    checkout_expires_at TIMESTAMPTZ,
    provider_checkout_id VARCHAR(255),
    payment_link_url TEXT,
    recovered_at TIMESTAMPTZ,
    recovered_amount_cents BIGINT DEFAULT 0 NOT NULL,
    next_action_due_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- --------------------------------------------------------------------
-- 12. RECOVERY EVENTS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recovery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES recovery_opportunities(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    channel VARCHAR(50) DEFAULT 'system',
    status VARCHAR(50) DEFAULT 'success',
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- --------------------------------------------------------------------
-- 13. CUSTOMER TIMELINE EVENTS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    actor VARCHAR(100) DEFAULT 'System Automation',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- --------------------------------------------------------------------
-- 14. REVENUE EVENTS (Source of Truth for Recovered Revenue)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES recovery_opportunities(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('revenue_recovered', 'revenue_lost', 'churn_prevented')),
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    recovered_via VARCHAR(100) DEFAULT 'automated_dunning',
    recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- --------------------------------------------------------------------
-- 15. WEBHOOK EVENTS (Idempotency & Lease Locking)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    provider_type VARCHAR(50) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255),
    status VARCHAR(50) DEFAULT 'processed' CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed', 'duplicate')),
    error_message TEXT,
    payload_summary TEXT,
    payload JSONB NOT NULL,
    processing_result JSONB DEFAULT '{}'::jsonb,
    headers JSONB DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMPTZ,
    processing_started_at TIMESTAMPTZ,
    processing_heartbeat_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(provider_type, provider_event_id)
);

-- --------------------------------------------------------------------
-- 16. AUDIT LOGS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- --------------------------------------------------------------------
-- 17. PERFORMANCE & IDEMPOTENCY INDEXES
-- --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_memberships_workspace_user ON memberships(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_customers_workspace_email ON customers(workspace_id, email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace_status ON subscriptions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace_status ON invoices(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_workspace_invoice ON payments(workspace_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_failures_workspace_resolved ON payment_failures(workspace_id, is_resolved);
CREATE INDEX IF NOT EXISTS idx_opps_workspace_status ON recovery_opportunities(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_opps_token_hash ON recovery_opportunities(token_hash);
CREATE INDEX IF NOT EXISTS idx_opps_token_expires_at ON recovery_opportunities(token_expires_at);
CREATE INDEX IF NOT EXISTS idx_opps_provider_checkout_id ON recovery_opportunities(workspace_id, provider_checkout_id);
CREATE INDEX IF NOT EXISTS idx_recovery_events_opp ON recovery_events(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_customer_timeline_cust ON customer_timeline_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event ON webhook_events(workspace_id, provider_type, provider_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_idempotency ON webhook_events(idempotency_key) WHERE status = 'processed';
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_events_workspace_opp ON revenue_events(workspace_id, opportunity_id) WHERE opportunity_id IS NOT NULL;

-- --------------------------------------------------------------------
-- 18. ROW LEVEL SECURITY (RLS) POLICIES & ACCESS HELPERS
-- --------------------------------------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper Function: Check Workspace Membership
CREATE OR REPLACE FUNCTION user_has_workspace_access(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM memberships
        WHERE memberships.workspace_id = ws_id
        AND memberships.user_id = auth.uid()
    );
END;
$$;

-- Helper Function: Check Workspace Role
CREATE OR REPLACE FUNCTION user_workspace_role(ws_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    user_role VARCHAR;
BEGIN
    SELECT role INTO user_role FROM memberships
    WHERE memberships.workspace_id = ws_id
    AND memberships.user_id = auth.uid()
    LIMIT 1;

    RETURN user_role;
END;
$$;

-- 1. Workspaces Policy
CREATE POLICY "Users can view workspaces they belong to"
    ON workspaces FOR SELECT
    USING (user_has_workspace_access(id));

CREATE POLICY "Owners and admins can update workspaces"
    ON workspaces FOR UPDATE
    USING (user_workspace_role(id) IN ('owner', 'admin'));

-- 2. Users Policy
CREATE POLICY "Users can view self and fellow workspace members"
    ON users FOR SELECT
    USING (
        auth.uid() = id OR EXISTS (
            SELECT 1 FROM memberships m1
            JOIN memberships m2 ON m1.workspace_id = m2.workspace_id
            WHERE m1.user_id = auth.uid() AND m2.user_id = users.id
        )
    );

CREATE POLICY "Users can insert their own profile"
    ON users FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = id
        AND (
            auth.jwt() ->> 'email' IS NULL 
            OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
        )
    );

CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND (
            auth.jwt() ->> 'email' IS NULL 
            OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
        )
    );

-- 3. Memberships Policy
CREATE POLICY "Users can view memberships in their workspaces"
    ON memberships FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Admins and owners can manage memberships"
    ON memberships FOR ALL
    USING (user_workspace_role(workspace_id) IN ('owner', 'admin'));

-- 4. Provider Connections Policy
CREATE POLICY "Tenant isolation for provider connections read"
    ON provider_connections FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Admins and owners can modify provider connections"
    ON provider_connections FOR ALL
    USING (user_workspace_role(workspace_id) IN ('owner', 'admin'));

-- 5. Customers Policy
CREATE POLICY "Tenant isolation for customers select"
    ON customers FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for customers write"
    ON customers FOR INSERT
    WITH CHECK (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

CREATE POLICY "Tenant isolation for customers update"
    ON customers FOR UPDATE
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

CREATE POLICY "Tenant isolation for customers delete"
    ON customers FOR DELETE
    USING (user_workspace_role(workspace_id) IN ('owner', 'admin'));

-- 6. Subscriptions Policy
CREATE POLICY "Tenant isolation for subscriptions select"
    ON subscriptions FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for subscriptions write"
    ON subscriptions FOR INSERT
    WITH CHECK (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

CREATE POLICY "Tenant isolation for subscriptions update"
    ON subscriptions FOR UPDATE
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

-- 7. Invoices Policy
CREATE POLICY "Tenant isolation for invoices select"
    ON invoices FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for invoices write"
    ON invoices FOR ALL
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

-- 8. Payments Policy
CREATE POLICY "Tenant isolation for payments select"
    ON payments FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for payments write"
    ON payments FOR ALL
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

-- 9. Payment Failures Policy
CREATE POLICY "Tenant isolation for payment failures select"
    ON payment_failures FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for payment failures write"
    ON payment_failures FOR ALL
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

-- 10. Recovery Campaigns & Steps Policy
CREATE POLICY "Tenant isolation for recovery campaigns select"
    ON recovery_campaigns FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for recovery campaigns write"
    ON recovery_campaigns FOR ALL
    USING (user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator'));

CREATE POLICY "Tenant isolation for recovery steps select"
    ON recovery_steps FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM recovery_campaigns rc
        WHERE rc.id = recovery_steps.campaign_id
        AND user_has_workspace_access(rc.workspace_id)
    ));

CREATE POLICY "Tenant isolation for recovery steps write"
    ON recovery_steps FOR ALL
    USING (EXISTS (
        SELECT 1 FROM recovery_campaigns rc
        WHERE rc.id = recovery_steps.campaign_id
        AND user_workspace_role(rc.workspace_id) IN ('owner', 'admin', 'operator')
    ));

-- 11. Recovery Opportunities Policy
CREATE POLICY "Tenant isolation for recovery opportunities select"
    ON recovery_opportunities FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for recovery opportunities write"
    ON recovery_opportunities FOR ALL
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

-- 12. Recovery Events Policy
CREATE POLICY "Tenant isolation for recovery events select"
    ON recovery_events FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for recovery events write"
    ON recovery_events FOR ALL
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

-- 13. Customer Timeline Events Policy
CREATE POLICY "Tenant isolation for customer timeline events select"
    ON customer_timeline_events FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for customer timeline events write"
    ON customer_timeline_events FOR ALL
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

-- 14. Revenue Events Policy
CREATE POLICY "Tenant isolation for revenue events select"
    ON revenue_events FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for revenue events write"
    ON revenue_events FOR ALL
    USING (user_has_workspace_access(workspace_id) AND user_workspace_role(workspace_id) IN ('owner', 'admin', 'operator', 'member'));

-- 15. Webhook Events Policy
CREATE POLICY "Tenant isolation for webhook events select"
    ON webhook_events FOR SELECT
    USING (workspace_id IS NULL OR user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for webhook events write"
    ON webhook_events FOR ALL
    USING (workspace_id IS NULL OR user_workspace_role(workspace_id) IN ('owner', 'admin'));

-- 16. Audit Logs Policy
CREATE POLICY "Tenant isolation for audit logs select"
    ON audit_logs FOR SELECT
    USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for audit logs insert"
    ON audit_logs FOR INSERT
    WITH CHECK (user_has_workspace_access(workspace_id));

-- --------------------------------------------------------------------
-- 19. WEBHOOK LEASE MANAGEMENT STORED PROCEDURES
-- --------------------------------------------------------------------

-- Atomic Webhook Event Claim RPC with Lease Timeout
CREATE OR REPLACE FUNCTION claim_webhook_event_atomic(
  p_workspace_id UUID,
  p_provider_type VARCHAR(50),
  p_provider_event_id VARCHAR(255),
  p_event_type VARCHAR(100),
  p_idempotency_key VARCHAR(255),
  p_payload_summary TEXT,
  p_payload JSONB,
  p_headers JSONB,
  p_lease_timeout_seconds INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_cutoff TIMESTAMPTZ := NOW() - (p_lease_timeout_seconds || ' seconds')::INTERVAL;
BEGIN
  -- 1. Try to insert new event in 'processing' status
  INSERT INTO webhook_events (
    workspace_id,
    provider_type,
    provider_event_id,
    event_type,
    idempotency_key,
    status,
    payload_summary,
    payload,
    headers,
    received_at,
    processing_started_at,
    processing_heartbeat_at,
    updated_at
  ) VALUES (
    p_workspace_id,
    p_provider_type,
    p_provider_event_id,
    p_event_type,
    p_idempotency_key,
    'processing',
    p_payload_summary,
    p_payload,
    p_headers,
    v_now,
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT (provider_type, provider_event_id) DO NOTHING
  RETURNING * INTO v_existing;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'claimed', true,
      'is_duplicate', false,
      'event_id', v_existing.id,
      'status', 'processing'
    );
  END IF;

  -- 2. Row already exists: query with FOR UPDATE lock
  SELECT * INTO v_existing
  FROM webhook_events
  WHERE provider_type = p_provider_type AND provider_event_id = p_provider_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook event claim race condition';
  END IF;

  -- 2a. Already processed
  IF v_existing.status = 'processed' THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'is_duplicate', true,
      'event_id', v_existing.id,
      'status', 'processed'
    );
  END IF;

  -- 2b. Ignored
  IF v_existing.status = 'ignored' THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'is_duplicate', true,
      'event_id', v_existing.id,
      'status', 'ignored'
    );
  END IF;

  -- 2c. Currently processing: check if lease is still active
  IF v_existing.status = 'processing' THEN
    IF COALESCE(v_existing.processing_heartbeat_at, v_existing.processing_started_at) > v_cutoff THEN
      RETURN jsonb_build_object(
        'claimed', false,
        'is_duplicate', true,
        'event_id', v_existing.id,
        'status', 'processing',
        'message', 'Event is actively being processed by another worker'
      );
    END IF;
  END IF;

  -- 2d. Status is 'failed' or stale 'processing': reclaim lease atomically
  UPDATE webhook_events
  SET status = 'processing',
      error_message = NULL,
      processing_started_at = v_now,
      processing_heartbeat_at = v_now,
      updated_at = v_now
  WHERE id = v_existing.id;

  RETURN jsonb_build_object(
    'claimed', true,
    'is_duplicate', false,
    'event_id', v_existing.id,
    'status', 'processing',
    'reclaimed', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_webhook_event_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, JSONB, JSONB, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_webhook_event_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, JSONB, JSONB, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_webhook_event_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, JSONB, JSONB, INT) TO service_role;

-- Webhook Lease Touch Heartbeat RPC
CREATE OR REPLACE FUNCTION touch_webhook_processing_lease(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE webhook_events
  SET processing_heartbeat_at = NOW(),
      updated_at = NOW()
  WHERE id = p_event_id AND status = 'processing';
END;
$$;

REVOKE EXECUTE ON FUNCTION touch_webhook_processing_lease(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION touch_webhook_processing_lease(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION touch_webhook_processing_lease(UUID) TO service_role;

-- --------------------------------------------------------------------
-- 20. CANONICAL ATOMIC SETTLEMENT STORED PROCEDURE
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION settle_recovery_payment_atomic(
  p_workspace_id UUID,
  p_opportunity_id UUID,
  p_amount_cents BIGINT,
  p_provider_payment_id TEXT,
  p_method TEXT DEFAULT 'webhook_confirmation',
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_opp RECORD;
  v_pf RECORD;
  v_inv RECORD;
  v_sub RECORD;
  v_cust RECORD;
  v_payment_rec RECORD;
  v_provider_type VARCHAR(50);
  v_payment_id UUID;
  v_user_email VARCHAR(255) := NULL;
BEGIN
  -- 1. Parameter Sanity Validation
  IF p_workspace_id IS NULL OR p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Workspace ID and Opportunity ID are required for settlement';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive, got %', p_amount_cents;
  END IF;

  IF p_provider_payment_id IS NULL OR TRIM(p_provider_payment_id) = '' THEN
    RAISE EXCEPTION 'Authentic provider payment ID is required for settlement';
  END IF;

  -- 2. Validate Provider Payment Identity Format
  IF p_method = 'manual_staff_intervention' THEN
    IF NOT (p_provider_payment_id LIKE 'manual_staff_%') OR LENGTH(p_provider_payment_id) < 20 THEN
      RAISE EXCEPTION 'Manual staff settlement requires a valid reference starting with manual_staff_ with sufficient entropy';
    END IF;
  ELSE
    IF p_provider_payment_id LIKE 'fake_%' OR 
       p_provider_payment_id LIKE 'sandbox_%' OR 
       p_provider_payment_id LIKE 'sim_%' OR 
       p_provider_payment_id LIKE 'py_ret_%' OR 
       p_provider_payment_id LIKE 'py_str_%' OR 
       p_provider_payment_id LIKE 'evt_dev_%' OR
       p_provider_payment_id LIKE 'cs_%' OR
       p_provider_payment_id LIKE 'evt_%' THEN
      RAISE EXCEPTION 'Invalid or synthetic provider payment ID forbidden for settlement: %', p_provider_payment_id;
    END IF;
  END IF;

  -- 3. Lock Recovery Opportunity (EXACT WORKSPACE + OPPORTUNITY MATCH)
  SELECT * INTO v_opp
  FROM recovery_opportunities
  WHERE id = p_opportunity_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery opportunity % not found for workspace %', p_opportunity_id, p_workspace_id;
  END IF;

  -- Idempotency check: if already recovered, return early without re-incrementing aggregates
  IF v_opp.status = 'recovered' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_recovered',
      'opportunity_id', v_opp.id,
      'amount_cents', v_opp.recovered_amount_cents
    );
  END IF;

  IF v_opp.status IN ('expired', 'cancelled', 'not_recoverable') THEN
    RAISE EXCEPTION 'Cannot settle recovery opportunity in status %', v_opp.status;
  END IF;

  -- 4. Validate Opportunity Amount
  IF p_amount_cents != v_opp.amount_at_risk_cents THEN
    RAISE EXCEPTION 'Settlement amount mismatch: expected %, got %', v_opp.amount_at_risk_cents, p_amount_cents;
  END IF;

  -- 5. Lock Linked Payment Failure (EXACT WORKSPACE + PAYMENT FAILURE MATCH)
  IF v_opp.payment_failure_id IS NULL THEN
    RAISE EXCEPTION 'Recovery opportunity % has no linked payment failure', p_opportunity_id;
  END IF;

  SELECT * INTO v_pf
  FROM payment_failures
  WHERE id = v_opp.payment_failure_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment failure % not found for workspace %', v_opp.payment_failure_id, p_workspace_id;
  END IF;

  IF v_pf.customer_id != v_opp.customer_id THEN
    RAISE EXCEPTION 'Customer mismatch between payment failure (%) and opportunity (%)', v_pf.customer_id, v_opp.customer_id;
  END IF;

  IF v_pf.amount_cents != v_opp.amount_at_risk_cents THEN
    RAISE EXCEPTION 'Amount mismatch between payment failure (%) and opportunity (%)', v_pf.amount_cents, v_opp.amount_at_risk_cents;
  END IF;

  IF UPPER(v_pf.currency) != UPPER(v_opp.currency) THEN
    RAISE EXCEPTION 'Currency mismatch between payment failure (%) and opportunity (%)', v_pf.currency, v_opp.currency;
  END IF;

  -- 6. Lock Linked Invoice (OBTAINED EXCLUSIVELY VIA payment_failures.invoice_id)
  IF v_pf.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Payment failure % has no linked invoice_id', v_pf.id;
  END IF;

  SELECT * INTO v_inv
  FROM invoices
  WHERE id = v_pf.invoice_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % referenced by payment failure % not found for workspace %', v_pf.invoice_id, v_pf.id, p_workspace_id;
  END IF;

  IF v_inv.customer_id != v_opp.customer_id THEN
    RAISE EXCEPTION 'Customer mismatch between invoice (%) and opportunity (%)', v_inv.customer_id, v_opp.customer_id;
  END IF;

  IF v_inv.amount_cents != v_opp.amount_at_risk_cents THEN
    RAISE EXCEPTION 'Amount mismatch between invoice (%) and opportunity (%)', v_inv.amount_cents, v_opp.amount_at_risk_cents;
  END IF;

  IF UPPER(v_inv.currency) != UPPER(v_opp.currency) THEN
    RAISE EXCEPTION 'Currency mismatch between invoice (%) and opportunity (%)', v_inv.currency, v_opp.currency;
  END IF;

  -- 7. Lock Linked Subscription if Present (OBTAINED EXCLUSIVELY VIA invoices.subscription_id)
  IF v_inv.subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub
    FROM subscriptions
    WHERE id = v_inv.subscription_id AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Subscription % referenced by invoice % not found', v_inv.subscription_id, v_inv.id;
    END IF;

    IF v_sub.customer_id != v_opp.customer_id THEN
      RAISE EXCEPTION 'Customer mismatch between subscription (%) and opportunity (%)', v_sub.customer_id, v_opp.customer_id;
    END IF;
  END IF;

  -- 8. Lock Customer Record
  SELECT * INTO v_cust
  FROM customers
  WHERE id = v_opp.customer_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found for workspace %', v_opp.customer_id, p_workspace_id;
  END IF;

  -- 9. Determine Provider Type & Verify Consistency
  v_provider_type := v_pf.provider_type;

  IF v_inv.provider_type IS NOT NULL AND v_inv.provider_type != v_provider_type THEN
    RAISE EXCEPTION 'Provider type mismatch between payment failure (%) and invoice (%)', v_provider_type, v_inv.provider_type;
  END IF;

  IF v_sub IS NOT NULL AND v_sub.provider_type IS NOT NULL AND v_sub.provider_type != v_provider_type THEN
    RAISE EXCEPTION 'Provider type mismatch between payment failure (%) and subscription (%)', v_provider_type, v_sub.provider_type;
  END IF;

  IF p_method LIKE 'stripe_%' AND v_provider_type != 'stripe' THEN
    RAISE EXCEPTION 'Provider mismatch: Stripe method used for provider %', v_provider_type;
  ELSIF p_method LIKE 'razorpay_%' AND v_provider_type != 'razorpay' THEN
    RAISE EXCEPTION 'Provider mismatch: Razorpay method used for provider %', v_provider_type;
  ELSIF p_method LIKE 'paypal_%' AND v_provider_type != 'paypal' THEN
    RAISE EXCEPTION 'Provider mismatch: PayPal method used for provider %', v_provider_type;
  END IF;

  -- 10. Find or Create Payment Record in payments Table
  SELECT * INTO v_payment_rec
  FROM payments
  WHERE workspace_id = p_workspace_id
    AND provider_type = v_provider_type
    AND provider_payment_id = p_provider_payment_id;

  IF FOUND THEN
    IF v_payment_rec.invoice_id IS NULL OR v_payment_rec.invoice_id != v_inv.id THEN
      RAISE EXCEPTION 'Existing payment record % does not match exact invoice % (got invoice_id %)', p_provider_payment_id, v_inv.id, v_payment_rec.invoice_id;
    END IF;

    IF v_payment_rec.customer_id != v_opp.customer_id OR 
       v_payment_rec.workspace_id != p_workspace_id OR
       v_payment_rec.amount_cents != p_amount_cents OR
       UPPER(v_payment_rec.currency) != UPPER(v_opp.currency) THEN
      RAISE EXCEPTION 'Payment ID % exists with conflicting customer/workspace/amount/currency metadata', p_provider_payment_id;
    END IF;

    IF v_payment_rec.status != 'succeeded' THEN
      RAISE EXCEPTION 'Existing payment ID % has non-succeeded status "%" and cannot be settled', p_provider_payment_id, v_payment_rec.status;
    END IF;

    v_payment_id := v_payment_rec.id;
  ELSE
    INSERT INTO payments (
      workspace_id,
      customer_id,
      invoice_id,
      provider_type,
      provider_payment_id,
      amount_cents,
      currency,
      status,
      created_at
    ) VALUES (
      p_workspace_id,
      v_opp.customer_id,
      v_inv.id,
      v_provider_type,
      p_provider_payment_id,
      p_amount_cents,
      UPPER(COALESCE(v_opp.currency, 'USD')),
      'succeeded',
      NOW()
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- 11. Atomic State Update: Recovery Opportunity
  UPDATE recovery_opportunities
  SET status = 'recovered',
      recovered_amount_cents = p_amount_cents,
      recovered_at = NOW(),
      token_expires_at = NOW(),
      recovery_token = NULL,
      payment_link_url = NULL,
      checkout_status = 'recovered',
      updated_at = NOW()
  WHERE id = p_opportunity_id AND workspace_id = p_workspace_id;

  -- 12. Resolve Linked Payment Failure
  UPDATE payment_failures
  SET is_resolved = TRUE,
      payment_id = v_payment_id
  WHERE id = v_pf.id AND workspace_id = p_workspace_id;

  -- 13. Update Linked Invoice Status to Paid
  UPDATE invoices
  SET status = 'paid',
      paid_at = NOW(),
      updated_at = NOW()
  WHERE id = v_inv.id AND workspace_id = p_workspace_id;

  -- 14. Reactivate Linked Subscription ONLY
  IF v_inv.subscription_id IS NOT NULL THEN
    UPDATE subscriptions
    SET status = 'active',
        updated_at = NOW()
    WHERE id = v_inv.subscription_id AND workspace_id = p_workspace_id;
  END IF;

  -- 15. Increment Customer Total Recovered Revenue (Exactly once)
  UPDATE customers
  SET total_recovered_cents = COALESCE(total_recovered_cents, 0) + p_amount_cents,
      current_risk_status = 'recovered',
      updated_at = NOW()
  WHERE id = v_opp.customer_id AND workspace_id = p_workspace_id;

  -- 16. Record Revenue Event (Idempotent via ON CONFLICT)
  INSERT INTO revenue_events (
    workspace_id,
    opportunity_id,
    customer_id,
    provider_type,
    event_type,
    amount_cents,
    currency,
    recovered_via,
    recorded_at
  ) VALUES (
    p_workspace_id,
    p_opportunity_id,
    v_opp.customer_id,
    v_provider_type,
    'revenue_recovered',
    p_amount_cents,
    UPPER(COALESCE(v_opp.currency, 'USD')),
    COALESCE(p_method, 'webhook_confirmation'),
    NOW()
  )
  ON CONFLICT (workspace_id, opportunity_id) DO NOTHING;

  -- 17. Record Recovery Event
  INSERT INTO recovery_events (
    workspace_id,
    opportunity_id,
    event_type,
    channel,
    status,
    details,
    created_at
  ) VALUES (
    p_workspace_id,
    p_opportunity_id,
    'payment_settled',
    p_method,
    'success',
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'provider_payment_id', p_provider_payment_id,
      'provider_type', v_provider_type,
      'payment_id', v_payment_id,
      'method', p_method,
      'user_id', p_user_id
    ),
    NOW()
  );

  -- 18. Record Customer Timeline Event
  INSERT INTO customer_timeline_events (
    workspace_id,
    customer_id,
    event_type,
    title,
    description,
    metadata,
    created_at
  ) VALUES (
    p_workspace_id,
    v_opp.customer_id,
    'payment_recovered',
    'Payment Recovered',
    FORMAT('Recovered %s %s via %s (Payment ID: %s)', 
      (p_amount_cents / 100.0)::NUMERIC(10,2), 
      UPPER(COALESCE(v_opp.currency, 'USD')), 
      p_method, 
      p_provider_payment_id
    ),
    jsonb_build_object(
      'opportunity_id', p_opportunity_id,
      'amount_cents', p_amount_cents,
      'provider_payment_id', p_provider_payment_id,
      'payment_id', v_payment_id,
      'user_id', p_user_id
    ),
    NOW()
  );

  -- 19. Record Audit Log
  IF p_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM users WHERE id = p_user_id;
  END IF;

  INSERT INTO audit_logs (
    workspace_id,
    user_id,
    user_email,
    action,
    resource_type,
    resource_id,
    metadata,
    created_at
  ) VALUES (
    p_workspace_id,
    p_user_id,
    v_user_email,
    'PAYMENT_RECOVERY_SETTLED',
    'recovery_opportunity',
    p_opportunity_id::TEXT,
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'provider_payment_id', p_provider_payment_id,
      'method', p_method,
      'payment_id', v_payment_id
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'settled',
    'opportunity_id', p_opportunity_id,
    'amount_cents', p_amount_cents,
    'provider_payment_id', p_provider_payment_id,
    'payment_id', v_payment_id
  );
END;
$$;

-- Enforce Strict Privileged Execution (Service Role Only)
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) TO service_role;

-- --------------------------------------------------------------------
-- 15. AUTH PROFILE BOOTSTRAP & ATOMIC WORKSPACE CREATION
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user auth.users%ROWTYPE;
    v_profile public.users%ROWTYPE;
    v_full_name TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required: auth.uid() is null';
    END IF;

    SELECT * INTO v_user
    FROM auth.users
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authenticated user identity not found in auth.users';
    END IF;

    v_full_name := COALESCE(
        v_user.raw_user_meta_data->>'full_name',
        split_part(v_user.email, '@', 1),
        'User'
    );

    INSERT INTO public.users (id, email, full_name, created_at)
    VALUES (
        v_user.id,
        v_user.email,
        v_full_name,
        COALESCE(v_user.created_at, NOW())
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name)
    RETURNING * INTO v_profile;

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO service_role;

CREATE OR REPLACE FUNCTION public.create_initial_workspace(
    p_name TEXT,
    p_business_type TEXT DEFAULT 'saas',
    p_currency TEXT DEFAULT 'USD',
    p_is_demo BOOLEAN DEFAULT FALSE
)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_ws public.workspaces%ROWTYPE;
    v_slug TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: auth.uid() is null';
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
        RAISE EXCEPTION 'Workspace name must be at least 2 characters';
    END IF;

    PERFORM public.ensure_my_profile();

    v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);

    INSERT INTO public.workspaces (
        name,
        slug,
        business_type,
        currency,
        is_demo,
        timezone,
        recovery_rules,
        created_at,
        updated_at
    ) VALUES (
        trim(p_name),
        v_slug,
        COALESCE(p_business_type, 'saas'),
        COALESCE(p_currency, 'USD'),
        COALESCE(p_is_demo, FALSE),
        'UTC',
        '{"max_retry_attempts": 4, "retry_interval_hours": 48, "grace_period_days": 7, "auto_cancel_subscription": false, "send_dunning_emails": true, "smart_retry_enabled": true}'::jsonb,
        NOW(),
        NOW()
    ) RETURNING * INTO v_ws;

    INSERT INTO public.memberships (
        workspace_id,
        user_id,
        role,
        created_at
    ) VALUES (
        v_ws.id,
        v_user_id,
        'owner',
        NOW()
    );

    RETURN v_ws;
END;
$$;

REVOKE ALL ON FUNCTION public.create_initial_workspace(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_initial_workspace(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_initial_workspace(TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

