-- ====================================================================
-- Migration 014: Final Auth Profile Bootstrap & Secure ensure_my_profile()
--
-- 1. Drops fragile auth.users triggers (on_auth_user_created, on_auth_user_updated)
--    and deprecates handle_new_auth_user().
-- 2. Implements secure public.ensure_my_profile() with SECURITY DEFINER
--    and search_path = public, pg_temp, deriving identity strictly from auth.uid().
-- 3. Implements atomic public.create_initial_workspace() function ensuring
--    profile exists and creating workspace + owner membership atomically.
-- 4. Backfills all existing auth.users into public.users.
-- 5. Hardens RLS policies on public.users preserving tenant boundaries.
-- ====================================================================

-- 1. Remove Fragile Auth Triggers and Deprecated Handler
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- 2. Secure Database Function: ensure_my_profile()
-- Strictly uses auth.uid() as identity source; cannot be spoofed by client inputs.
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
    -- 1. Require auth.uid() IS NOT NULL
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required: auth.uid() is null';
    END IF;

    -- 2. Read the authenticated user from auth.users using auth.uid()
    SELECT * INTO v_user
    FROM auth.users
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authenticated user identity not found in auth.users';
    END IF;

    -- 3. Obtain id, email, full_name
    v_full_name := COALESCE(
        v_user.raw_user_meta_data->>'full_name',
        split_part(v_user.email, '@', 1),
        'User'
    );

    -- 4. Insert or update public.users
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

    -- 5. Return the resulting public.users row
    RETURN v_profile;
END;
$$;

-- Enforce Strict Privileged Permissions for ensure_my_profile()
REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO service_role;

-- 3. Atomic Workspace Creation Stored Procedure
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

    -- Step A: Ensure owner profile exists atomically
    PERFORM public.ensure_my_profile();

    -- Step B: Create workspace
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

    -- Step C: Create owner membership in same atomic transaction
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

-- Enforce Strict Permissions for create_initial_workspace()
REVOKE ALL ON FUNCTION public.create_initial_workspace(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_initial_workspace(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_initial_workspace(TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

-- 4. Backfill Existing Auth Users into public.users
INSERT INTO public.users (id, email, full_name, created_at)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'User'), 
    COALESCE(created_at, NOW())
FROM auth.users
ON CONFLICT (id) DO UPDATE 
SET email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name);

-- 5. Hardened Row-Level Security Policies on public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view self and fellow workspace members" ON public.users;
CREATE POLICY "Users can view self and fellow workspace members"
    ON public.users FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id OR EXISTS (
            SELECT 1 FROM public.memberships m1
            JOIN public.memberships m2 ON m1.workspace_id = m2.workspace_id
            WHERE m1.user_id = auth.uid() AND m2.user_id = public.users.id
        )
    );

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
