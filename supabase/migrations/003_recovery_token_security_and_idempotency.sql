-- ====================================================================
-- Revenue Recovery OS - Migration 003: Token Security, Webhook Idempotency & Settlement Integrity
-- ====================================================================

-- 1. Ensure token_hash and token_expires_at on recovery_opportunities
ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);
ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');

CREATE INDEX IF NOT EXISTS idx_opps_token_hash ON recovery_opportunities(token_hash);
CREATE INDEX IF NOT EXISTS idx_opps_token_expires_at ON recovery_opportunities(token_expires_at);

-- Make plaintext recovery_token nullable for production
ALTER TABLE recovery_opportunities ALTER COLUMN recovery_token DROP NOT NULL;

-- 2. Webhook events lifecycle: received -> processing -> processed / failed
ALTER TABLE webhook_events DROP CONSTRAINT IF EXISTS webhook_events_status_check;
ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_status_check CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed', 'duplicate'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_idempotency ON webhook_events(idempotency_key) WHERE status = 'processed';
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event ON webhook_events(workspace_id, provider_type, provider_event_id);

-- 3. Atomic Settlement Stored Function with strict checks
CREATE OR REPLACE FUNCTION settle_recovery_payment_atomic(
    p_opportunity_id UUID,
    p_amount_cents INT,
    p_provider_payment_id VARCHAR(255),
    p_method VARCHAR(100),
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_opp RECORD;
    v_rev_id UUID;
    v_now TIMESTAMPTZ := NOW();
    v_customer_id UUID;
    v_workspace_id UUID;
BEGIN
    -- Validation: Amount must be strictly positive
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be greater than zero.';
    END IF;

    -- Fetch and lock opportunity row
    SELECT * INTO v_opp
    FROM recovery_opportunities
    WHERE id = p_opportunity_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Opportunity not found.';
    END IF;

    -- Prevent duplicate settlement
    IF v_opp.status = 'recovered' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Opportunity is already recovered.',
            'opportunity_id', p_opportunity_id,
            'status', 'recovered'
        );
    END IF;

    v_workspace_id := v_opp.workspace_id;
    v_customer_id := v_opp.customer_id;

    -- 1. Update opportunity status to recovered and revoke token expiry
    UPDATE recovery_opportunities
    SET status = 'recovered',
        recovered_at = v_now,
        recovered_amount_cents = p_amount_cents,
        token_expires_at = v_now,
        updated_at = v_now
    WHERE id = p_opportunity_id;

    -- 2. Mark payment failure as resolved if linked
    IF v_opp.payment_failure_id IS NOT NULL THEN
        UPDATE payment_failures
        SET is_resolved = TRUE
        WHERE id = v_opp.payment_failure_id;
    END IF;

    -- 3. Create exactly one revenue event
    INSERT INTO revenue_events (
        workspace_id,
        opportunity_id,
        customer_id,
        amount_cents,
        currency,
        recovered_at,
        recovery_method,
        provider_payment_id,
        created_at
    ) VALUES (
        v_workspace_id,
        p_opportunity_id,
        v_customer_id,
        p_amount_cents,
        COALESCE(v_opp.currency, 'USD'),
        v_now,
        p_method,
        p_provider_payment_id,
        v_now
    ) RETURNING id INTO v_rev_id;

    -- 4. Record Customer Timeline Event
    INSERT INTO customer_timeline (
        workspace_id,
        customer_id,
        event_type,
        title,
        description,
        actor,
        metadata,
        created_at
    ) VALUES (
        v_workspace_id,
        v_customer_id,
        'payment_recovered',
        'Payment Recovered & Settled',
        'Payment of ' || COALESCE(v_opp.currency, 'USD') || ' ' || TRIM(TO_CHAR(p_amount_cents / 100.0, '999999990.00')) || ' settled via ' || p_method,
        'System Automated Pipeline',
        jsonb_build_object('provider_payment_id', p_provider_payment_id, 'method', p_method, 'user_id', p_user_id),
        v_now
    );

    -- 5. Record Audit Log
    INSERT INTO audit_logs (
        workspace_id,
        user_id,
        action,
        resource_type,
        resource_id,
        metadata,
        created_at
    ) VALUES (
        v_workspace_id,
        p_user_id,
        'PAYMENT_RECOVERY_SETTLED',
        'recovery_opportunity',
        p_opportunity_id::text,
        jsonb_build_object('amount_cents', p_amount_cents, 'provider_payment_id', p_provider_payment_id, 'method', p_method),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Payment settled successfully.',
        'opportunity_id', p_opportunity_id,
        'revenue_event_id', v_rev_id,
        'amount_cents', p_amount_cents
    );
END;
$$;

-- Security Definer Permissions
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID) TO service_role;
