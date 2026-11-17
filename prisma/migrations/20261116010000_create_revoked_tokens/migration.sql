-- =============================================================================
-- Migration: 20261116010000_create_revoked_tokens
-- PulsePilot AI — SEC-03.1 Persistent Token Revocation Storage (Final Hardened)
-- =============================================================================

-- 1. Enforce Prerequisite Role Provisioning (Stage 3 Prerequisite)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN 
        RAISE EXCEPTION 'PREREQUISITE CHECK FAILED: Role "pulsepilot_app" does not exist. Execute Stage 3 role provisioning (DATABASE_ROLE_PROVISIONING_V2.md) before executing this migration.'
            USING ERRCODE = 'undefined_object',
                  HINT = 'Provision the pulsepilot_app role with LOGIN and least-privilege grants first.';
    END IF; 
END $$;

-- 2. Provision Dedicated Non-Superuser Maintenance-Owner Role
-- NOLOGIN, NOSUPERUSER, NOBYPASSRLS: strictly restricted to cleanup execution
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_revocation_maint') THEN
        CREATE ROLE pulsepilot_revocation_maint WITH 
            NOLOGIN 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            NOBYPASSRLS;
    END IF;
END $$;

-- Allow postgres (migration runner) to assign ownership to pulsepilot_revocation_maint
GRANT pulsepilot_revocation_maint TO postgres;

-- 3. Create Revocation Storage Table
-- Stores strictly cryptographic UUIDs (jti) and metadata. Zero raw tokens or secrets.
CREATE TABLE IF NOT EXISTS public.revoked_tokens (
    "jti" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "revoked_at" TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "reason" VARCHAR(255) DEFAULT 'USER_LOGOUT',

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

-- Ensure Table Owner is postgres
ALTER TABLE public.revoked_tokens OWNER TO postgres;

-- 4. Performance & Cleanup Indexes
CREATE INDEX IF NOT EXISTS "idx_revoked_tokens_expires_at" 
    ON public.revoked_tokens ("expires_at");

CREATE INDEX IF NOT EXISTS "idx_revoked_tokens_user_id" 
    ON public.revoked_tokens ("user_id");

-- 5. Row Level Security & Table Isolation
ALTER TABLE public.revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revoked_tokens FORCE ROW LEVEL SECURITY;

-- 6. Shield from PostgREST Public API (Zero Anonymous / Authenticated Access)
REVOKE ALL ON TABLE public.revoked_tokens FROM anon, authenticated;

-- 7. Least-Privilege Grants to Application Runtime Role (SELECT, INSERT Only)
GRANT USAGE ON SCHEMA public TO pulsepilot_app;
GRANT SELECT, INSERT ON TABLE public.revoked_tokens TO pulsepilot_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.revoked_tokens FROM pulsepilot_app;

-- 8. Grants to Dedicated Maintenance-Owner Role (SELECT, DELETE Only)
GRANT USAGE ON SCHEMA public TO pulsepilot_revocation_maint;
GRANT SELECT, DELETE ON TABLE public.revoked_tokens TO pulsepilot_revocation_maint;
REVOKE INSERT, UPDATE, TRUNCATE ON TABLE public.revoked_tokens FROM pulsepilot_revocation_maint;

-- 9. Explicit RLS Policies for Application Runtime Role
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'revoked_tokens' AND policyname = 'revoked_tokens_app_select'
    ) THEN
        CREATE POLICY revoked_tokens_app_select 
            ON public.revoked_tokens FOR SELECT 
            TO pulsepilot_app 
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'revoked_tokens' AND policyname = 'revoked_tokens_app_insert'
    ) THEN
        CREATE POLICY revoked_tokens_app_insert 
            ON public.revoked_tokens FOR INSERT 
            TO pulsepilot_app 
            WITH CHECK (true);
    END IF;
END $$;

-- 10. Narrowly Scoped Maintenance DELETE Policy Under FORCE ROW LEVEL SECURITY
-- Enforces that pulsepilot_revocation_maint can delete ONLY records where expires_at < now()
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'revoked_tokens' AND policyname = 'revoked_tokens_maint_delete'
    ) THEN
        CREATE POLICY revoked_tokens_maint_delete 
            ON public.revoked_tokens FOR DELETE 
            TO pulsepilot_revocation_maint 
            USING (expires_at < pg_catalog.now());
    END IF;
END $$;

-- 11. Hardened SECURITY DEFINER Expiration Maintenance Function
-- Set search_path = pg_catalog strictly (prevents object shadowing and search_path injection)
-- Owned by non-superuser pulsepilot_revocation_maint (NO SUPERUSER, NO BYPASSRLS)
-- Takes zero parameters to eliminate parameter tampering or injection vectors
CREATE OR REPLACE FUNCTION public.cleanup_expired_revoked_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.revoked_tokens
    WHERE expires_at < pg_catalog.now();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.cleanup_expired_revoked_tokens() OWNER TO postgres;

-- 12. Restrict Function Execution Privileges
REVOKE ALL ON FUNCTION public.cleanup_expired_revoked_tokens() FROM PUBLIC, anon, authenticated, pulsepilot_app;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_revoked_tokens() TO service_role;
