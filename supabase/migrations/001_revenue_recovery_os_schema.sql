-- ====================================================================
-- Revenue Recovery OS - Database Schema & Multi-Tenant Architecture
-- PostgreSQL / Supabase Migration (Authoritative Production Schema)
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Workspaces (Tenants)
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

-- 3. Users & Workspace Memberships
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

-- 4. Payment Provider Connections
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

-- 5. Customers
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

-- 6. Subscriptions
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

-- 7. Invoices & Payments
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

-- 8. Payment Failures (Normalized)
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

-- 9. Recovery Campaigns & Workflow Steps
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

-- 10. Recovery Opportunities (Central State Machine)
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
    recovery_token VARCHAR(255) UNIQUE NOT NULL,
    payment_link_url TEXT,
    recovered_at TIMESTAMPTZ,
    recovered_amount_cents BIGINT DEFAULT 0 NOT NULL,
    next_action_due_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 11. Recovery Events
CREATE TABLE IF NOT EXISTS recovery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES recovery_opportunities(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    channel VARCHAR(50) DEFAULT 'system',
    status VARCHAR(50) DEFAULT 'success',
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 12. Customer Timeline Events
CREATE TABLE IF NOT EXISTS customer_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    actor VARCHAR(100) DEFAULT 'System Automation',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 13. Revenue Events (Source of Truth for Recovered Revenue)
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

-- 14. Webhook Events (Idempotency & Auditing)
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    provider_type VARCHAR(50) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'processed' CHECK (status IN ('processed', 'ignored', 'failed', 'duplicate')),
    error_message TEXT,
    payload_summary TEXT,
    payload JSONB NOT NULL,
    processing_result JSONB DEFAULT '{}'::jsonb,
    headers JSONB DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(provider_type, provider_event_id)
);

-- 15. Audit Logs
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

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

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
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM memberships
        WHERE memberships.workspace_id = ws_id
        AND memberships.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper Function: Check Workspace Role
CREATE OR REPLACE FUNCTION user_workspace_role(ws_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    user_role VARCHAR;
BEGIN
    SELECT role INTO user_role FROM memberships
    WHERE memberships.workspace_id = ws_id
    AND memberships.user_id = auth.uid()
    LIMIT 1;

    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id);

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

-- ====================================================================
-- ATOMIC RECOVERY SETTLEMENT TRANSACTION (Postgres RPC)
-- ====================================================================
CREATE OR REPLACE FUNCTION settle_recovery_payment_atomic(
    p_opportunity_id UUID,
    p_amount_cents BIGINT,
    p_provider_payment_id TEXT,
    p_method TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_opp recovery_opportunities%ROWTYPE;
    v_cust customers%ROWTYPE;
    v_now TIMESTAMPTZ := NOW();
    v_rev_id UUID;
    v_audit_id UUID;
BEGIN
    -- 1. Lock and fetch opportunity
    SELECT * INTO v_opp FROM recovery_opportunities
    WHERE id = p_opportunity_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Opportunity % not found', p_opportunity_id;
    END IF;

    IF v_opp.status = 'recovered' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_recovered', true,
            'message', 'Payment already recovered previously'
        );
    END IF;

    -- 2. Fetch customer
    SELECT * INTO v_cust FROM customers
    WHERE id = v_opp.customer_id;

    -- 3. Update Opportunity
    UPDATE recovery_opportunities
    SET status = 'recovered',
        recovered_at = v_now,
        recovered_amount_cents = p_amount_cents,
        updated_at = v_now
    WHERE id = p_opportunity_id;

    -- 4. Mark failure as resolved
    UPDATE payment_failures
    SET is_resolved = TRUE
    WHERE id = v_opp.payment_failure_id;

    -- 5. Mark related invoice as paid
    UPDATE invoices
    SET status = 'paid',
        paid_at = v_now,
        updated_at = v_now
    WHERE id IN (
        SELECT invoice_id FROM payment_failures WHERE id = v_opp.payment_failure_id AND invoice_id IS NOT NULL
    );

    -- 6. Update Customer risk status and recovered sum
    UPDATE customers
    SET current_risk_status = 'recovered',
        total_recovered_cents = total_recovered_cents + p_amount_cents,
        updated_at = v_now
    WHERE id = v_opp.customer_id;

    -- 7. Update subscription to active
    UPDATE subscriptions
    SET status = 'active',
        updated_at = v_now
    WHERE id IN (
        SELECT subscription_id FROM invoices
        WHERE id IN (SELECT invoice_id FROM payment_failures WHERE id = v_opp.payment_failure_id)
    );

    -- 8. Insert Revenue Event
    INSERT INTO revenue_events (
        id, workspace_id, opportunity_id, customer_id, provider_type,
        event_type, amount_cents, currency, recovered_via, recorded_at
    ) VALUES (
        gen_random_uuid(), v_opp.workspace_id, v_opp.id, v_opp.customer_id, v_cust.provider_type,
        'revenue_recovered', p_amount_cents, v_opp.currency, p_method, v_now
    ) RETURNING id INTO v_rev_id;

    -- 9. Insert Recovery Events (workflow stopped and revenue recovered)
    INSERT INTO recovery_events (
        id, opportunity_id, workspace_id, event_type, channel, status, details, created_at
    ) VALUES (
        gen_random_uuid(), v_opp.id, v_opp.workspace_id, 'revenue_recovered', 'system', 'success',
        jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method, 'provider_payment_id', p_provider_payment_id), v_now
    );

    INSERT INTO recovery_events (
        id, opportunity_id, workspace_id, event_type, channel, status, details, created_at
    ) VALUES (
        gen_random_uuid(), v_opp.id, v_opp.workspace_id, 'workflow_stopped', 'system', 'success',
        jsonb_build_object('reason', 'Payment successfully settled. Halting all subsequent dunning steps.'), v_now
    );

    -- 10. Insert Customer Timeline Event
    INSERT INTO customer_timeline_events (
        id, customer_id, workspace_id, event_type, title, description, actor, metadata, created_at
    ) VALUES (
        gen_random_uuid(), v_opp.customer_id, v_opp.workspace_id, 'recovery_completed',
        'Revenue Recovery Completed',
        format('Successfully recovered payment of %s %s via %s', (p_amount_cents / 100.0)::text, v_opp.currency, p_method),
        'System Automation',
        jsonb_build_object('amount_cents', p_amount_cents, 'opportunity_id', v_opp.id, 'method', p_method),
        v_now
    );

    -- 11. Insert SOC 2 Audit Log
    INSERT INTO audit_logs (
        id, workspace_id, user_id, action, resource_type, resource_id, metadata, created_at
    ) VALUES (
        gen_random_uuid(), v_opp.workspace_id, p_user_id, 'settle_recovery_payment',
        'recovery_opportunity', v_opp.id::text,
        jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method, 'provider_payment_id', p_provider_payment_id, 'revenue_event_id', v_rev_id),
        v_now
    ) RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'opportunity_id', v_opp.id,
        'revenue_event_id', v_rev_id,
        'audit_log_id', v_audit_id,
        'amount_cents', p_amount_cents,
        'status', 'recovered'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke from public and authenticated, grant strictly to service_role (privileged backend execution only)
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID) TO service_role;

