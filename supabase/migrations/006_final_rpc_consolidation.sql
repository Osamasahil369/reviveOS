-- ====================================================================
-- REVENUE RECOVERY OS — MIGRATION 006
-- Final Canonical Settlement RPC Consolidation, Hardening & Security
-- ====================================================================

-- 1. DROP OBSOLETE OVERLOADS TO ENSURE ONE AND ONLY ONE RPC FUNCTION EXISTS
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, UUID, UUID);

-- 2. CREATE UNIQUE INDEX TO PREVENT DUPLICATE REVENUE AT DATABASE LEVEL
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_events_workspace_opportunity 
ON revenue_events(workspace_id, opportunity_id) 
WHERE opportunity_id IS NOT NULL;

-- 3. CREATE CANONICAL HARDENED SETTLEMENT RPC FUNCTION
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
BEGIN
  -- A. INPUT VALIDATION & NONEMPTY PROVIDER PAYMENT ID
  IF p_workspace_id IS NULL OR p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Workspace ID and Opportunity ID are required';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;

  IF p_provider_payment_id IS NULL OR TRIM(p_provider_payment_id) = '' THEN
    RAISE EXCEPTION 'Provider payment ID cannot be empty or null';
  END IF;

  IF TRIM(p_provider_payment_id) LIKE 'fake_%' OR TRIM(p_provider_payment_id) LIKE 'sandbox_%' OR TRIM(p_provider_payment_id) LIKE 'py_ret_%' THEN
    RAISE EXCEPTION 'Simulated or fake provider payment IDs are rejected in production settlement';
  END IF;

  -- B. LOCK & LOAD OPPORTUNITY WITHIN WORKSPACE BOUNDARY
  SELECT * INTO v_opp
  FROM recovery_opportunities
  WHERE id = p_opportunity_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery opportunity not found or workspace boundary mismatch';
  END IF;

  IF v_opp.status = 'recovered' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_recovered',
      'opportunity_id', v_opp.id,
      'message', 'Opportunity is already recovered'
    );
  END IF;

  -- C. ENFORCE EXACT SETTLEMENT AMOUNT MATCH AT DATABASE LEVEL
  IF p_amount_cents != v_opp.amount_at_risk_cents THEN
    RAISE EXCEPTION 'Settlement amount mismatch: expected %, got %', v_opp.amount_at_risk_cents, p_amount_cents;
  END IF;

  -- D. ENFORCE UNIQUE REVENUE EVENT AT DATABASE LEVEL
  IF EXISTS (
    SELECT 1 FROM revenue_events
    WHERE workspace_id = p_workspace_id AND opportunity_id = p_opportunity_id
  ) THEN
    RAISE EXCEPTION 'Duplicate settlement rejected: revenue event already exists for opportunity %', p_opportunity_id;
  END IF;

  -- E. EXACT RELATED RECORD TRAVERSAL WITHIN WORKSPACE BOUNDARY
  IF v_opp.payment_failure_id IS NULL THEN
    RAISE EXCEPTION 'Recovery opportunity missing linked payment failure';
  END IF;

  SELECT * INTO v_pf
  FROM payment_failures
  WHERE id = v_opp.payment_failure_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked payment failure not found or workspace boundary mismatch';
  END IF;

  IF v_pf.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Payment failure missing linked invoice';
  END IF;

  SELECT * INTO v_inv
  FROM invoices
  WHERE id = v_pf.invoice_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked invoice not found or workspace boundary mismatch';
  END IF;

  IF v_inv.subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub
    FROM subscriptions
    WHERE id = v_inv.subscription_id AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked subscription not found or workspace boundary mismatch';
    END IF;
  END IF;

  -- F. ATOMIC UPDATES & TOKEN REVOCATION
  -- 1. Mark Recovery Opportunity recovered and revoke token/URL
  UPDATE recovery_opportunities
  SET status = 'recovered',
      recovered_amount_cents = p_amount_cents,
      recovered_at = NOW(),
      token_expires_at = NOW(),
      recovery_token = NULL,
      payment_link_url = NULL,
      updated_at = NOW()
  WHERE id = p_opportunity_id AND workspace_id = p_workspace_id;

  -- 2. Mark payment failure resolved using real schema column
  UPDATE payment_failures
  SET is_resolved = TRUE
  WHERE id = v_pf.id AND workspace_id = p_workspace_id;

  -- 3. Mark invoice paid
  UPDATE invoices
  SET status = 'paid',
      updated_at = NOW()
  WHERE id = v_inv.id AND workspace_id = p_workspace_id;

  -- 4. Mark subscription active
  IF v_inv.subscription_id IS NOT NULL THEN
    UPDATE subscriptions
    SET status = 'active',
        updated_at = NOW()
    WHERE id = v_inv.subscription_id AND workspace_id = p_workspace_id;
  END IF;

  -- 5. Update exact customer metrics
  IF v_opp.customer_id IS NOT NULL THEN
    UPDATE customers
    SET total_recovered_cents = COALESCE(total_recovered_cents, 0) + p_amount_cents,
        current_risk_status = 'recovered',
        updated_at = NOW()
    WHERE id = v_opp.customer_id AND workspace_id = p_workspace_id;
  END IF;

  -- G. INSERT CANONICAL AUDIT, REVENUE, RECOVERY & TIMELINE RECORDS
  -- 1. Revenue Event
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
    COALESCE(v_pf.provider_type, v_inv.provider_type, 'stripe'),
    'revenue_recovered',
    p_amount_cents,
    COALESCE(v_opp.currency, 'USD'),
    p_method,
    NOW()
  );

  -- 2. Recovery Event
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
    'payment_recovered',
    'webhook',
    'success',
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'provider_payment_id', p_provider_payment_id,
      'method', p_method,
      'settled_at', NOW(),
      'settled_by_user_id', p_user_id
    ),
    NOW()
  );

  -- 3. Timeline Event
  IF v_opp.customer_id IS NOT NULL THEN
    INSERT INTO customer_timeline_events (
      customer_id,
      workspace_id,
      event_type,
      title,
      description,
      actor,
      metadata,
      created_at
    ) VALUES (
      v_opp.customer_id,
      p_workspace_id,
      'payment_recovered',
      'Payment Recovery Settled',
      format('Successfully recovered payment of %s via %s (Ref: %s)', p_amount_cents, p_method, p_provider_payment_id),
      'System Automation',
      jsonb_build_object('opportunity_id', p_opportunity_id, 'provider_payment_id', p_provider_payment_id, 'method', p_method),
      NOW()
    );
  END IF;

  -- 4. Audit Log
  INSERT INTO audit_logs (
    workspace_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata,
    created_at
  ) VALUES (
    p_workspace_id,
    p_user_id,
    'PAYMENT_RECOVERY_SETTLED',
    'recovery_opportunity',
    p_opportunity_id::TEXT,
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'provider_payment_id', p_provider_payment_id,
      'method', p_method
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'opportunity_id', p_opportunity_id,
    'status', 'recovered',
    'recovered_amount_cents', p_amount_cents
  );
END;
$$;

-- 4. STRICT PRIVILEGE REVOCATION & AUTHORIZATION (SERVICE ROLE ONLY)
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID) TO service_role;
