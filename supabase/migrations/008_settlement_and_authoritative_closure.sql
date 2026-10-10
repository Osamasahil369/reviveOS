-- Migration 008: Settlement Payment Record, Checkout Expiration, Lease Touch & Strict Invariants
-- Consolidation for canonical settlement RPC and lease management

ALTER TABLE recovery_opportunities ADD COLUMN IF NOT EXISTS checkout_expires_at TIMESTAMPTZ;

-- Touch Lease Heartbeat RPC
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

-- Canonical Settlement RPC with Payments Record Insertion and Strict Invariants Validation
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, VARCHAR, VARCHAR);
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
  v_provider_type VARCHAR;
  v_payment_id UUID;
BEGIN
  -- 1. Parameter Sanity Validation
  IF p_workspace_id IS NULL OR p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Workspace ID and Opportunity ID are required for payment settlement.';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Positive payment amount in cents is required for settlement.';
  END IF;

  IF p_provider_payment_id IS NULL OR TRIM(p_provider_payment_id) = '' THEN
    RAISE EXCEPTION 'Authentic provider payment ID is required for settlement.';
  END IF;

  IF LOWER(p_provider_payment_id) LIKE 'fake_%' 
     OR LOWER(p_provider_payment_id) LIKE 'sandbox_%'
     OR LOWER(p_provider_payment_id) LIKE 'sim_%'
     OR LOWER(p_provider_payment_id) LIKE 'py_ret_%' THEN
    RAISE EXCEPTION 'Settlement rejected: Fake, simulated, or invalid provider payment ID (%)', p_provider_payment_id;
  END IF;

  -- 2. Lock Recovery Opportunity
  SELECT * INTO v_opp
  FROM recovery_opportunities
  WHERE id = p_opportunity_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery opportunity % not found for workspace %', p_opportunity_id, p_workspace_id;
  END IF;

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

  -- 3. Lock Payment Failure Record if linked
  IF v_opp.payment_failure_id IS NOT NULL THEN
    SELECT * INTO v_pf
    FROM payment_failures
    WHERE id = v_opp.payment_failure_id AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked payment failure % not found in workspace %', v_opp.payment_failure_id, p_workspace_id;
    END IF;
  END IF;

  -- 4. Lock Invoice Record linked via payment_failure
  IF v_pf.invoice_id IS NOT NULL THEN
    SELECT * INTO v_inv
    FROM invoices
    WHERE id = v_pf.invoice_id AND workspace_id = p_workspace_id
    FOR UPDATE;
  END IF;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'No valid linked invoice found for recovery opportunity %', p_opportunity_id;
  END IF;

  -- 5. Exact Invariant Checks
  IF v_inv.workspace_id != p_workspace_id THEN
    RAISE EXCEPTION 'Workspace mismatch between invoice (%) and settlement context (%)', v_inv.workspace_id, p_workspace_id;
  END IF;

  IF v_inv.customer_id != v_opp.customer_id THEN
    RAISE EXCEPTION 'Customer mismatch between invoice (%) and opportunity (%)', v_inv.customer_id, v_opp.customer_id;
  END IF;

  IF v_pf.id IS NOT NULL AND v_pf.customer_id != v_opp.customer_id THEN
    RAISE EXCEPTION 'Customer mismatch between payment failure (%) and opportunity (%)', v_pf.customer_id, v_opp.customer_id;
  END IF;

  -- Currency Check
  IF UPPER(COALESCE(v_inv.currency, 'USD')) != UPPER(COALESCE(v_opp.currency, 'USD')) THEN
    RAISE EXCEPTION 'Currency mismatch between invoice (%) and opportunity (%)', v_inv.currency, v_opp.currency;
  END IF;

  -- Exact Amount Check
  IF p_amount_cents != v_opp.amount_at_risk_cents THEN
    RAISE EXCEPTION 'Settlement amount mismatch: expected %, got %', v_opp.amount_at_risk_cents, p_amount_cents;
  END IF;

  v_provider_type := COALESCE(v_pf.provider_type, v_inv.provider_type, 'stripe');

  -- Manual Intervention Validation
  IF p_method = 'manual_staff_intervention' THEN
    IF NOT (LOWER(p_provider_payment_id) LIKE 'man_%' OR LOWER(p_provider_payment_id) LIKE 'manual_%' OR LENGTH(p_provider_payment_id) >= 16) THEN
      RAISE EXCEPTION 'Manual staff settlement requires a valid reference ID starting with man_ or manual_';
    END IF;
  END IF;

  -- 6. Insert / Upsert into Payments Table
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
  ON CONFLICT (workspace_id, provider_type, provider_payment_id) DO UPDATE
  SET status = 'succeeded',
      invoice_id = EXCLUDED.invoice_id,
      customer_id = EXCLUDED.customer_id
  RETURNING id INTO v_payment_id;

  -- 7. Update Recovery Opportunity
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

  -- 8. Resolve Payment Failure
  IF v_pf.id IS NOT NULL THEN
    UPDATE payment_failures
    SET is_resolved = TRUE,
        payment_id = v_payment_id
    WHERE id = v_pf.id AND workspace_id = p_workspace_id;
  END IF;

  -- 9. Update Invoice
  UPDATE invoices
  SET status = 'paid',
      paid_at = NOW(),
      updated_at = NOW()
  WHERE id = v_inv.id AND workspace_id = p_workspace_id;

  -- 10. Reactivate Subscription if applicable
  IF v_inv.subscription_id IS NOT NULL THEN
    UPDATE subscriptions
    SET status = 'active',
        updated_at = NOW()
    WHERE id = v_inv.subscription_id AND workspace_id = p_workspace_id;
  END IF;

  -- 11. Update Customer Totals
  UPDATE customers
  SET total_recovered_cents = COALESCE(total_recovered_cents, 0) + p_amount_cents,
      current_risk_status = 'recovered',
      updated_at = NOW()
  WHERE id = v_opp.customer_id AND workspace_id = p_workspace_id;

  -- 12. Record Revenue Event
  INSERT INTO revenue_events (
    workspace_id,
    opportunity_id,
    customer_id,
    event_type,
    amount_cents,
    currency,
    provider_type,
    occurred_at
  ) VALUES (
    p_workspace_id,
    p_opportunity_id,
    v_opp.customer_id,
    'payment_recovered',
    p_amount_cents,
    UPPER(COALESCE(v_opp.currency, 'USD')),
    v_provider_type,
    NOW()
  );

  -- 13. Record Recovery Event
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
      'method', p_method
    ),
    NOW()
  );

  -- 14. Record Customer Timeline Event
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
      'payment_id', v_payment_id
    ),
    NOW()
  );

  -- 15. Audit Log
  INSERT INTO audit_logs (
    workspace_id,
    action,
    resource_type,
    resource_id,
    metadata,
    created_at
  ) VALUES (
    p_workspace_id,
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
    'payment_id', v_payment_id,
    'amount_cents', p_amount_cents,
    'provider_payment_id', p_provider_payment_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) TO service_role;
