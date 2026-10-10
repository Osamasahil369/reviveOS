-- Migration 012: Final Settlement Contract and Whole-Database Schema Alignment
-- Ensures EXACTLY ONE canonical settlement RPC exists in PostgreSQL schema with zero overloads.

-- 1. Ensure Unique Constraint / Index on revenue_events for (workspace_id, opportunity_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_events_workspace_opp 
ON revenue_events(workspace_id, opportunity_id) 
WHERE opportunity_id IS NOT NULL;

-- 2. Explicitly drop ALL obsolete and legacy settlement RPC overloads
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, VARCHAR, VARCHAR);

-- 3. Create or Replace the Single Canonical Settlement RPC Function
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

  -- 2. Validate Provider Payment Identity Entropy / Format
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

  -- Idempotent check: if already recovered, return success without double-incrementing aggregates
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

  -- 6. Lock Linked Invoice (OBTAINED ONLY VIA payment_failures.invoice_id)
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

  -- 7. Lock Linked Subscription if Present (OBTAINED ONLY VIA invoices.subscription_id)
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

  -- 9. Determine Provider Type & Verify Agreement Across Records
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

  -- 10. Find or Create Payment Record in payments table
  SELECT * INTO v_payment_rec
  FROM payments
  WHERE workspace_id = p_workspace_id
    AND provider_type = v_provider_type
    AND provider_payment_id = p_provider_payment_id;

  IF FOUND THEN
    -- Exact invoice matching: existing payment MUST belong to the exact invoice (MUST NOT be NULL)
    IF v_payment_rec.invoice_id IS NULL OR v_payment_rec.invoice_id != v_inv.id THEN
      RAISE EXCEPTION 'Existing payment record % does not match exact invoice % (got invoice_id %)', p_provider_payment_id, v_inv.id, v_payment_rec.invoice_id;
    END IF;

    -- Metadata integrity
    IF v_payment_rec.customer_id != v_opp.customer_id OR 
       v_payment_rec.workspace_id != p_workspace_id OR
       v_payment_rec.amount_cents != p_amount_cents OR
       UPPER(v_payment_rec.currency) != UPPER(v_opp.currency) THEN
      RAISE EXCEPTION 'Payment ID % exists with conflicting customer/workspace/amount/currency metadata', p_provider_payment_id;
    END IF;

    -- Status integrity: do NOT overwrite non-succeeded status (e.g. failed, pending, refunded)
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

  -- 12. Resolve Payment Failure
  UPDATE payment_failures
  SET is_resolved = TRUE,
      payment_id = v_payment_id
  WHERE id = v_pf.id AND workspace_id = p_workspace_id;

  -- 13. Update Invoice Status
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

  -- 15. Increment Customer Total Recovered (Exactly once)
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

-- 4. Enforce Strict RPC Permissions (Service Role Only)
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) TO service_role;
