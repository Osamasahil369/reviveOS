-- Migration 011: Remove Legacy Settlement Overload and Enforce Single Canonical RPC
-- Drops the legacy Migration-002 function signature (p_opportunity_id, p_amount_cents, p_provider_payment_id, p_method, p_user_id, p_workspace_id)
-- so that exactly ONE canonical settlement RPC signature exists in the database.

-- 1. Drop the exact legacy Migration-002 function signature
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(
  UUID,   -- p_opportunity_id
  BIGINT, -- p_amount_cents
  TEXT,   -- p_provider_payment_id
  TEXT,   -- p_method
  UUID,   -- p_user_id
  UUID    -- p_workspace_id
);

-- 2. Clean up any remaining legacy overloads
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, BIGINT, VARCHAR, VARCHAR, UUID, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, BIGINT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, INT, VARCHAR, VARCHAR, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, INT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS settle_recovery_payment_atomic(UUID, UUID, BIGINT, VARCHAR, VARCHAR);

-- 3. Re-verify/Enforce RPC permissions on the CANONICAL function
REVOKE EXECUTE ON FUNCTION public.settle_recovery_payment_atomic(
  UUID,   -- p_workspace_id
  UUID,   -- p_opportunity_id
  BIGINT, -- p_amount_cents
  TEXT,   -- p_provider_payment_id
  TEXT,   -- p_method
  UUID    -- p_user_id
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.settle_recovery_payment_atomic(
  UUID,   -- p_workspace_id
  UUID,   -- p_opportunity_id
  BIGINT, -- p_amount_cents
  TEXT,   -- p_provider_payment_id
  TEXT,   -- p_method
  UUID    -- p_user_id
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.settle_recovery_payment_atomic(
  UUID,   -- p_workspace_id
  UUID,   -- p_opportunity_id
  BIGINT, -- p_amount_cents
  TEXT,   -- p_provider_payment_id
  TEXT,   -- p_method
  UUID    -- p_user_id
) TO service_role;

-- Verification Query (Expected result: EXACTLY 1 row):
/*
SELECT
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'settle_recovery_payment_atomic';

-- Expected Output:
-- nspname | proname                        | identity_arguments
-- --------+--------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- public  | settle_recovery_payment_atomic | p_workspace_id uuid, p_opportunity_id uuid, p_amount_cents bigint, p_provider_payment_id text, p_method text DEFAULT 'webhook_confirmation'::text, p_user_id uuid DEFAULT NULL::uuid
*/
