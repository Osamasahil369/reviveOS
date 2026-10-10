-- ====================================================================
-- Revenue Recovery OS - Migration 002: Authoritative Production SaaS Upgrade
-- Upgrades existing instances to support all 17 entities, RLS, and atomic settlement
-- ====================================================================

-- 1. Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Add any missing columns to workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'UTC';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS recovery_rules JSONB DEFAULT '{}'::jsonb;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS email_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS sms_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS portal_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS security_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS subscription_plan JSONB DEFAULT '{}'::jsonb;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_dismissed BOOLEAN DEFAULT FALSE;

-- 3. Add any missing columns to subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS custom_interval_count INT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS custom_interval_unit VARCHAR(20);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS previous_billing_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_count INT DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_days INT DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_in_trial BOOLEAN DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_days INT DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_end_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_in_grace BOOLEAN DEFAULT FALSE;

-- 4. Add missing columns to provider_connections
ALTER TABLE provider_connections ADD COLUMN IF NOT EXISTS secondary_webhook_secret_encrypted TEXT;
ALTER TABLE provider_connections ADD COLUMN IF NOT EXISTS secondary_webhook_secret_expires_at TIMESTAMPTZ;

-- 5. Add missing columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5b. Add security and checkout columns to recovery_opportunities
ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);
ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');
ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS checkout_status VARCHAR(50) DEFAULT 'unpaid';
ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS provider_checkout_id VARCHAR(255);

-- 6. Add missing columns and constraints to webhook_events
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS payload_summary TEXT;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processing_result JSONB DEFAULT '{}'::jsonb;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS headers JSONB DEFAULT '{}'::jsonb;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE webhook_events DROP CONSTRAINT IF EXISTS webhook_events_status_check;
ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_status_check CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed', 'duplicate'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_webhook_events_provider_event'
    ) THEN
        ALTER TABLE webhook_events ADD CONSTRAINT uq_webhook_events_provider_event UNIQUE(provider_type, provider_event_id);
    END IF;
END $$;

-- 7. Add missing columns to audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

-- 8. Create Customer Timeline Events Table if not exists
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

ALTER TABLE customer_timeline_events ENABLE ROW LEVEL SECURITY;

-- 9. Ensure atomic settlement function is defined with strict security controls
CREATE OR REPLACE FUNCTION settle_recovery_payment_atomic(
    p_opportunity_id UUID,
    p_amount_cents BIGINT,
    p_provider_payment_id TEXT,
    p_method TEXT,
    p_user_id UUID DEFAULT NULL,
    p_workspace_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_opp recovery_opportunities%ROWTYPE;
    v_cust customers%ROWTYPE;
    v_now TIMESTAMPTZ := NOW();
    v_rev_id UUID;
    v_audit_id UUID;
BEGIN
    -- Validate positive payment amount
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero, received: %', p_amount_cents;
    END IF;

    SELECT * INTO v_opp FROM recovery_opportunities
    WHERE id = p_opportunity_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Opportunity % not found', p_opportunity_id;
    END IF;

    -- Verify workspace tenancy if specified
    IF p_workspace_id IS NOT NULL AND v_opp.workspace_id != p_workspace_id THEN
        RAISE EXCEPTION 'Tenancy violation: Opportunity % does not belong to workspace %', p_opportunity_id, p_workspace_id;
    END IF;

    -- Prevent duplicate settlement
    IF v_opp.status = 'recovered' THEN
        RETURN jsonb_build_object(
            'success', false,
            'already_recovered', true,
            'message', 'Payment already recovered previously; duplicate settlement rejected'
        );
    END IF;

    -- Prevent duplicate revenue events
    IF EXISTS (SELECT 1 FROM revenue_events WHERE opportunity_id = v_opp.id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'already_recovered', true,
            'message', 'Revenue event already recorded for this opportunity; duplicate rejected'
        );
    END IF;

    SELECT * INTO v_cust FROM customers
    WHERE id = v_opp.customer_id;

    UPDATE recovery_opportunities
    SET status = 'recovered',
        recovered_at = v_now,
        recovered_amount_cents = p_amount_cents,
        updated_at = v_now
    WHERE id = p_opportunity_id;

    UPDATE payment_failures
    SET is_resolved = TRUE
    WHERE id = v_opp.payment_failure_id;

    UPDATE invoices
    SET status = 'paid',
        paid_at = v_now,
        updated_at = v_now
    WHERE id IN (
        SELECT invoice_id FROM payment_failures WHERE id = v_opp.payment_failure_id AND invoice_id IS NOT NULL
    );

    UPDATE customers
    SET current_risk_status = 'recovered',
        total_recovered_cents = total_recovered_cents + p_amount_cents,
        updated_at = v_now
    WHERE id = v_opp.customer_id;

    UPDATE subscriptions
    SET status = 'active',
        updated_at = v_now
    WHERE id IN (
        SELECT subscription_id FROM invoices
        WHERE id IN (SELECT invoice_id FROM payment_failures WHERE id = v_opp.payment_failure_id)
    );

    INSERT INTO revenue_events (
        id, workspace_id, opportunity_id, customer_id, provider_type,
        event_type, amount_cents, currency, recovered_via, recorded_at
    ) VALUES (
        gen_random_uuid(), v_opp.workspace_id, v_opp.id, v_opp.customer_id, COALESCE(v_cust.provider_type, 'stripe'),
        'revenue_recovered', p_amount_cents, v_opp.currency, p_method, v_now
    ) RETURNING id INTO v_rev_id;

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
$$;

-- Revoke from public and authenticated, grant strictly to service_role (privileged backend execution only)
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID, UUID) TO service_role;
