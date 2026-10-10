-- ====================================================================
-- Migration 013: Supabase Auth -> Public Users Synchronization & RLS Hardening
--
-- 1. Creates handle_new_auth_user() trigger function with SECURITY DEFINER
--    and search_path = public, pg_temp.
-- 2. Sets trigger AFTER INSERT ON auth.users to automatically synchronize
--    auth.users -> public.users.
-- 3. Safely backfills existing auth.users lacking a public.users row.
-- 4. Establishes strict RLS INSERT and UPDATE policies on public.users,
--    enforcing auth.uid() = id and email consistency.
-- ====================================================================

-- 1. Trigger Function for Automatic Profile Creation & Synchronization
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, created_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.created_at, NOW())
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Revoke all direct privileges on trigger function, grant execution strictly to postgres/service_role
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres, service_role;

-- 2. Attach Trigger to auth.users (idempotent drop + create)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- Also handle metadata/email updates if user profile updates in auth.users
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE OF email, raw_user_meta_data ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. Backfill Existing Authentication Users into public.users
INSERT INTO public.users (id, email, full_name, created_at)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), 
    created_at
FROM auth.users
ON CONFLICT (id) DO UPDATE 
SET email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, users.full_name);

-- 4. Correct Row Level Security on public.users
-- Ensure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to INSERT ONLY their own row, with matching auth.uid() and email
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = id
        AND (
            auth.jwt() ->> 'email' IS NULL 
            OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
        )
    );

-- Allow authenticated users to UPDATE ONLY their own row
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND (
            auth.jwt() ->> 'email' IS NULL 
            OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
        )
    );
