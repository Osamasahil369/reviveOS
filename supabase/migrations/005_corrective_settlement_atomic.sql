-- ====================================================================
-- REVENUE RECOVERY OS — MIGRATION 005
-- Corrective Atomic Settlement Function (Fixes Column Schema References)
-- ====================================================================

CREATE OR REPLACE FUNCTION settle_recovery_payment_atomic(
  p_workspace_id UUID,
  p_opportunity_id UUID,
  p_amount_cents INT,
  p_provider_payment_id TEXT,
  p_method TEXT DEFAULT 'webhook_confirmation',
  p_user_id UUID DEFAULT NULL,
  p_settled_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_opp RECORD;
  v_pf RECORD;
  v_inv RECORD;
  v_sub RECORD;
  v_cust RECORD;
BEGIN
  -- 1. Lock and retrieve recovery opportunity within workspace boundary
  SELECT * INTO v_opp
  FROM recovery_opportunities
  WHERE id = p_opportunity_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OPPORTUNITY_NOT_FOUND', 'message', 'Recovery opportunity not found or workspace boundary mismatch');
  END IF;

  IF v_opp.status = 'recovered' THEN
    RETURN jsonb_build_object('success', true, 'status', 'already_recovered', 'opportunity_id', v_opp.id, 'message', 'Opportunity is already recovered');
  END IF;

  -- Verify settlement amount is positive
  IF p_amount_cents <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_SETTLEMENT_AMOUNT', 'message', 'Settlement amount must be greater than zero');
  END IF;

  -- 2. Update Recovery Opportunity state
  UPDATE recovery_opportunities
  SET status = 'recovered',
      recovered_amount_cents = p_amount_cents,
      recovered_at = p_settled_at,
      updated_at = NOW()
  WHERE id = p_opportunity_id AND workspace_id = p_workspace_id;

  -- 3. Retrieve payment failure & invoice through proper schema relationships
  IF v_opp.payment_failure_id IS NOT NULL THEN
    SELECT * INTO v_pf
    FROM payment_failures
    WHERE id = v_opp.payment_failure_id AND workspace_id = p_workspace_id;

    IF v_pf IS NOT NULL AND v_pf.invoice_id IS NOT NULL THEN
      SELECT * INTO v_inv
      FROM invoices
      WHERE id = v_pf.invoice_id AND workspace_id = p_workspace_id;

      IF v_inv IS NOT NULL THEN
        -- Mark invoice paid
        UPDATE invoices
        SET status = 'paid',
            updated_at = NOW()
        WHERE id = v_inv.id AND workspace_id = p_workspace_id;

        -- Mark subscription active & increment recovered revenue if present
        IF v_inv.subscription_id IS NOT NULL THEN
          UPDATE subscriptions
          SET status = 'active',
              recovered_revenue_cents = COALESCE(recovered_revenue_cents, 0) + p_amount_cents,
              updated_at = NOW()
          WHERE id = v_inv.subscription_id AND workspace_id = p_workspace_id;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 4. Update customer aggregate metrics and risk status
  IF v_opp.customer_id IS NOT NULL THEN
    UPDATE customers
    SET total_recovered_cents = COALESCE(total_recovered_cents, 0) + p_amount_cents,
        current_risk_status = 'recovered',
        updated_at = NOW()
    WHERE id = v_opp.customer_id AND workspace_id = p_workspace_id;
  END IF;

  -- 5. Record recovery audit event
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
      'settled_at', p_settled_at,
      'settled_by_user_id', p_user_id
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
