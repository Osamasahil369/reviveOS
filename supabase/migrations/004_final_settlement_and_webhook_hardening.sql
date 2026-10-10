-- ====================================================================
-- Revenue Recovery OS - Migration 004: Settlement Function Schema Alignment & Provider Checkout Binding
-- ====================================================================

-- 1. Ensure provider_checkout_id on recovery_opportunities
ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS provider_checkout_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_opps_provider_checkout_id ON recovery_opportunities(workspace_id, provider_checkout_id);

-- 2. Atomic Settlement Stored Function with strict schema alignment
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
    v_provider_type VARCHAR(50);
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

    -- Verify amount matches opportunity amount at risk
    IF p_amount_cents != v_opp.amount_at_risk_cents THEN
        RAISE EXCEPTION 'Settlement amount (%) does not match opportunity amount at risk (%). Mismatched settlement rejected.', p_amount_cents, v_opp.amount_at_risk_cents;
    END IF;

    v_workspace_id := v_opp.workspace_id;
    v_customer_id := v_opp.customer_id;

    -- Fetch customer provider_type
    SELECT provider_type INTO v_provider_type FROM customers WHERE id = v_customer_id;
    IF v_provider_type IS NULL THEN
        v_provider_type := 'stripe';
    END IF;

    -- 1. Update opportunity status to recovered and revoke token expiry
    UPDATE recovery_opportunities
    SET status = 'recovered',
        recovered_at = v_now,
        recovered_amount_cents = p_amount_cents,
        token_expires_at = v_now,
        updated_at = v_now
    WHERE id = p_opportunity_id;

    DECLARE
        v_invoice_id UUID := NULL;
        v_subscription_id UUID := NULL;
    BEGIN
        -- 2. Mark payment failure as resolved if linked and extract specific invoice/subscription IDs
        IF v_opp.payment_failure_id IS NOT NULL THEN
            UPDATE payment_failures
            SET is_resolved = TRUE
            WHERE id = v_opp.payment_failure_id
            RETURNING invoice_id, subscription_id INTO v_invoice_id, v_subscription_id;
        END IF;

        IF v_invoice_id IS NULL AND v_opp.invoice_id IS NOT NULL THEN
            v_invoice_id := v_opp.invoice_id;
        END IF;

        -- 3. Update specific linked invoice if known, otherwise open invoices for this customer
        IF v_invoice_id IS NOT NULL THEN
            UPDATE invoices
            SET status = 'paid',
                paid_at = v_now,
                updated_at = v_now
            WHERE id = v_invoice_id
              AND workspace_id = v_workspace_id
            RETURNING subscription_id INTO v_subscription_id;
        ELSE
            UPDATE invoices
            SET status = 'paid',
                paid_at = v_now,
                updated_at = v_now
            WHERE customer_id = v_customer_id
              AND workspace_id = v_workspace_id
              AND status = 'open';
        END IF;

        -- 4. Update customer total recovered cents and risk status
        UPDATE customers
        SET total_recovered_cents = total_recovered_cents + p_amount_cents,
            current_risk_status = 'recovered',
            updated_at = v_now
        WHERE id = v_customer_id;

        -- 5. Update specific linked subscription to active if known, otherwise customer's past_due/unpaid subscriptions
        IF v_subscription_id IS NOT NULL THEN
            UPDATE subscriptions
            SET status = 'active',
                is_in_grace = FALSE,
                updated_at = v_now
            WHERE id = v_subscription_id
              AND workspace_id = v_workspace_id;
        ELSE
            UPDATE subscriptions
            SET status = 'active',
                is_in_grace = FALSE,
                updated_at = v_now
            WHERE customer_id = v_customer_id
              AND workspace_id = v_workspace_id
              AND status IN ('past_due', 'unpaid');
        END IF;

    -- 6. Create exactly one revenue event using actual schema
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
        v_workspace_id,
        p_opportunity_id,
        v_customer_id,
        v_provider_type,
        'revenue_recovered',
        p_amount_cents,
        COALESCE(v_opp.currency, 'USD'),
        COALESCE(p_method, 'automated_dunning'),
        v_now
    ) RETURNING id INTO v_rev_id;

    -- 7. Record Recovery Event using actual schema
    INSERT INTO recovery_events (
        opportunity_id,
        workspace_id,
        event_type,
        channel,
        status,
        details,
        created_at
    ) VALUES (
        p_opportunity_id,
        v_workspace_id,
        'revenue_recovered',
        'system',
        'success',
        jsonb_build_object(
            'provider_payment_id', p_provider_payment_id,
            'method', p_method,
            'amount_cents', p_amount_cents
        ),
        v_now
    );

    -- 8. Record Customer Timeline Event using actual schema
    INSERT INTO customer_timeline_events (
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
        'Payment of ' || COALESCE(v_opp.currency, 'USD') || ' ' || TRIM(TO_CHAR(p_amount_cents / 100.0, '999999990.00')) || ' settled via ' || COALESCE(p_method, 'hosted_portal'),
        'System Automated Pipeline',
        jsonb_build_object('provider_payment_id', p_provider_payment_id, 'method', p_method, 'user_id', p_user_id),
        v_now
    );

    -- 9. Record Audit Log using actual schema
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

REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID) TO service_role;
