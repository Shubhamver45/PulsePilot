-- =============================================================================
-- PULSEPILOT AI — SEC-03.1 STAGING DBA EXECUTION & VERIFICATION PACKAGE (V3)
-- Target: prisma/migrations/20261116010000_create_revoked_tokens/migration.sql
-- Classification: Staging Environment Database Execution & Live Acceptance Runbook
-- Safety Notice: DO NOT EXECUTE ON PRODUCTION. Requires explicit staging confirmation.
-- =============================================================================

\set ON_ERROR_STOP on

-- =============================================================================
-- SECTION 1: SAFETY GATE & STAGING ENVIRONMENT ASSERTION
-- =============================================================================

-- Enforce explicit session variable configuration
-- The executing DBA must explicitly run: SET app.target_environment = 'staging';
DO $$
DECLARE
    current_db TEXT;
    target_env TEXT;
BEGIN
    SELECT current_database() INTO current_db;
    target_env := current_setting('app.target_environment', true);

    -- 1. Check for missing explicit target environment declaration
    IF target_env IS DISTINCT FROM 'staging' THEN
        RAISE EXCEPTION 'CRITICAL SAFETY HALT: app.target_environment must be set to ''staging''. Execute: SET app.target_environment = ''staging''; before running this script.'
            USING ERRCODE = 'invalid_parameter_value',
                  HINT = 'This prevents accidental execution against non-staging environments.';
    END IF;

    -- 2. Check for known production database reference
    IF current_db LIKE '%czqhiuidekvozuoqdmyd%' THEN
        RAISE EXCEPTION 'CRITICAL SAFETY HALT: Target database name matches PRODUCTION project "czqhiuidekvozuoqdmyd"!'
            USING ERRCODE = 'restrict_violation',
                  HINT = 'Remote execution against production is strictly prohibited by Cardinal Rule 1.';
    END IF;

    RAISE NOTICE '=============================================================';
    RAISE NOTICE ' SAFETY CHECK PASSED: Verified target environment is STAGING';
    RAISE NOTICE ' Target Database: %', current_db;
    RAISE NOTICE ' Timestamp:       %', clock_timestamp();
    RAISE NOTICE '=============================================================';
END $$;

-- =============================================================================
-- SECTION 2: PRE-EXECUTION ROLE & ATTRIBUTE INSPECTION
-- =============================================================================

-- Verify Stage 3 Prerequisite: pulsepilot_app must exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN
        RAISE EXCEPTION 'PREREQUISITE CHECK FAILED: Role "pulsepilot_app" does not exist in staging.'
            USING ERRCODE = 'undefined_object',
                  HINT = 'Execute Stage 3 role provisioning (DATABASE_ROLE_PROVISIONING_V2.md) first.';
    END IF;
    RAISE NOTICE 'Prerequisite verified: Role "pulsepilot_app" exists.';
END $$;

-- Pre-execution inspection of role attributes
SELECT 
    rolname, 
    rolsuper, 
    rolcreaterole, 
    rolcreatedb, 
    rolbypassrls, 
    rolcanlogin,
    rolreplication
FROM pg_roles 
WHERE rolname IN ('pulsepilot_app', 'pulsepilot_revocation_maint', 'anon', 'authenticated', 'service_role', 'postgres')
ORDER BY rolname;

-- Assert that maintenance role has NO elevated or bypass privileges
DO $$
DECLARE
    maint_super BOOLEAN;
    maint_bypass BOOLEAN;
BEGIN
    SELECT rolsuper, rolbypassrls INTO maint_super, maint_bypass
    FROM pg_roles WHERE rolname = 'pulsepilot_revocation_maint';
    
    IF FOUND THEN
        IF maint_super OR maint_bypass THEN
            RAISE EXCEPTION 'SECURITY ALERT: pulsepilot_revocation_maint has rolsuper=% or rolbypassrls=% (must be false)!', maint_super, maint_bypass
                USING ERRCODE = 'invalid_role_specification';
        END IF;
        RAISE NOTICE 'Role pulsepilot_revocation_maint attribute assertion verified: NOSUPERUSER and NOBYPASSRLS.';
    END IF;
END $$;

-- =============================================================================
-- SECTION 3: MIGRATION EXECUTION (TRANSACTIONAL)
-- =============================================================================

BEGIN;

-- 1. Provision Dedicated Non-Superuser Maintenance-Owner Role
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
        RAISE NOTICE 'Created role: pulsepilot_revocation_maint';
    ELSE
        RAISE NOTICE 'Role pulsepilot_revocation_maint already exists, skipping creation.';
    END IF;
END $$;

-- 2. Create Revocation Storage Table
CREATE TABLE IF NOT EXISTS public.revoked_tokens (
    "jti" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "revoked_at" TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "reason" VARCHAR(255) DEFAULT 'USER_LOGOUT',

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

ALTER TABLE public.revoked_tokens OWNER TO postgres;

-- 3. Performance & Cleanup Indexes
CREATE INDEX IF NOT EXISTS "idx_revoked_tokens_expires_at" 
    ON public.revoked_tokens ("expires_at");

CREATE INDEX IF NOT EXISTS "idx_revoked_tokens_user_id" 
    ON public.revoked_tokens ("user_id");

-- 4. Row Level Security & Table Isolation
ALTER TABLE public.revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revoked_tokens FORCE ROW LEVEL SECURITY;

-- 5. Shield from PostgREST Public API
REVOKE ALL ON TABLE public.revoked_tokens FROM anon, authenticated;

-- 6. Least-Privilege Grants to Application Runtime Role (SELECT, INSERT Only)
GRANT USAGE ON SCHEMA public TO pulsepilot_app;
GRANT SELECT, INSERT ON TABLE public.revoked_tokens TO pulsepilot_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.revoked_tokens FROM pulsepilot_app;

-- 7. Grants to Dedicated Maintenance-Owner Role (SELECT, DELETE Only)
GRANT USAGE ON SCHEMA public TO pulsepilot_revocation_maint;
GRANT SELECT, DELETE ON TABLE public.revoked_tokens TO pulsepilot_revocation_maint;
REVOKE INSERT, UPDATE, TRUNCATE ON TABLE public.revoked_tokens FROM pulsepilot_revocation_maint;

-- 8. Explicit RLS Policies for Application Runtime Role
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

-- 9. Narrowly Scoped Maintenance DELETE Policy Under FORCE ROW LEVEL SECURITY
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

-- 10. Hardened SECURITY DEFINER Expiration Maintenance Function
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

ALTER FUNCTION public.cleanup_expired_revoked_tokens() OWNER TO pulsepilot_revocation_maint;

-- 11. Restrict Function Execution Privileges
REVOKE ALL ON FUNCTION public.cleanup_expired_revoked_tokens() FROM PUBLIC, anon, authenticated, pulsepilot_app;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_revoked_tokens() TO service_role;

COMMIT;

-- =============================================================================
-- SECTION 4: POST-MIGRATION EVIDENCE & ATTRIBUTE INSPECTION
-- =============================================================================

\echo '--- 1. Table RLS Status ---'
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_enabled, 
    forcerowsecurity AS force_rls 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'revoked_tokens';

\echo '--- 2. Table Grants by Role ---'
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' AND table_name = 'revoked_tokens'
ORDER BY grantee, privilege_type;

\echo '--- 3. Active RLS Policies ---'
SELECT 
    policyname, 
    roles, 
    cmd, 
    qual, 
    with_check 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'revoked_tokens';

\echo '--- 4. Function Attributes, Owner & Search Path ---'
SELECT 
    p.proname, 
    r.rolname AS owner_name, 
    p.prosecdef AS is_security_definer, 
    p.proconfig AS configuration_settings
FROM pg_proc p
JOIN pg_roles r ON p.proowner = r.oid
WHERE p.proname = 'cleanup_expired_revoked_tokens';

\echo '--- 5. Function Execute Permissions ---'
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' AND routine_name = 'cleanup_expired_revoked_tokens';

-- =============================================================================
-- SECTION 5: LIVE POSTGRESQL ACCEPTANCE TESTS (TRANSACTION-ISOLATED)
-- =============================================================================

\echo '================================================================='
\echo ' STARTING LIVE ROLE & BEHAVIORAL ACCEPTANCE TESTS'
\echo '================================================================='

-- Outer test transaction: will be rolled back completely at the end
BEGIN;

-- Always start from clean session user (postgres)
RESET ROLE;

-- Unique identifiable test records with timestamp to prevent collisions
DO $$
BEGIN
    INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason)
    VALUES 
        ('pp_stage_sec03_active_' || clock_timestamp()::text, 'usr_sarah_stage', pg_catalog.now() + interval '2 hours', 'ACTIVE_TEST_TOKEN'),
        ('pp_stage_sec03_expired_' || clock_timestamp()::text, 'usr_sarah_stage', pg_catalog.now() - interval '2 hours', 'EXPIRED_TEST_TOKEN');
END $$;

-- -----------------------------------------------------------------------------
-- TEST 1: pulsepilot_app can SELECT
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_1;
SET LOCAL ROLE pulsepilot_app;
DO $$
DECLARE
    found_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO found_count FROM public.revoked_tokens WHERE jti LIKE 'pp_stage_sec03_active_%';
    IF found_count < 1 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: pulsepilot_app could not select active test record!';
    END IF;
    RAISE NOTICE '  ✅ LIVE TEST 1 PASSED: pulsepilot_app SELECT succeeded (found: %).', found_count;
END $$;
RESET ROLE;
RELEASE SAVEPOINT sp_test_1;

-- -----------------------------------------------------------------------------
-- TEST 2: pulsepilot_app can INSERT
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_2;
SET LOCAL ROLE pulsepilot_app;
DO $$
BEGIN
    INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason)
    VALUES ('pp_stage_sec03_insert_' || clock_timestamp()::text, 'usr_alex_stage', pg_catalog.now() + interval '30 minutes', 'APP_INSERT_TEST');
    RAISE NOTICE '  ✅ LIVE TEST 2 PASSED: pulsepilot_app INSERT succeeded.';
END $$;
RESET ROLE;
RELEASE SAVEPOINT sp_test_2;

-- -----------------------------------------------------------------------------
-- TEST 3: pulsepilot_app cannot UPDATE (Must return verified SQLSTATE 42501)
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_3;
SET LOCAL ROLE pulsepilot_app;
DO $$
DECLARE
    err_code TEXT;
BEGIN
    BEGIN
        UPDATE public.revoked_tokens SET reason = 'TAMPERED' WHERE jti LIKE 'pp_stage_sec03_active_%';
        RAISE EXCEPTION 'TEST 3 FAILED: pulsepilot_app UPDATE unexpectedly succeeded!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 3 FAILED: Expected SQLSTATE 42501 (insufficient_privilege) but received %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 3 PASSED: pulsepilot_app UPDATE rejected with verified SQLSTATE 42501.';
    END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_3;

-- -----------------------------------------------------------------------------
-- TEST 4: pulsepilot_app cannot DELETE (Must return verified SQLSTATE 42501)
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_4;
SET LOCAL ROLE pulsepilot_app;
DO $$
DECLARE
    err_code TEXT;
BEGIN
    BEGIN
        DELETE FROM public.revoked_tokens WHERE jti LIKE 'pp_stage_sec03_active_%';
        RAISE EXCEPTION 'TEST 4 FAILED: pulsepilot_app DELETE unexpectedly succeeded!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 4 FAILED: Expected SQLSTATE 42501 (insufficient_privilege) but received %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 4 PASSED: pulsepilot_app DELETE rejected with verified SQLSTATE 42501.';
    END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_4;

-- -----------------------------------------------------------------------------
-- TEST 5: pulsepilot_app cannot TRUNCATE (Must return verified SQLSTATE 42501)
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_5;
SET LOCAL ROLE pulsepilot_app;
DO $$
DECLARE
    err_code TEXT;
BEGIN
    BEGIN
        EXECUTE 'TRUNCATE TABLE public.revoked_tokens';
        RAISE EXCEPTION 'TEST 5 FAILED: pulsepilot_app TRUNCATE unexpectedly succeeded!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 5 FAILED: Expected SQLSTATE 42501 (insufficient_privilege) but received %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 5 PASSED: pulsepilot_app TRUNCATE rejected with verified SQLSTATE 42501.';
    END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_5;

-- -----------------------------------------------------------------------------
-- TEST 6: anon role cannot access table (Must return verified SQLSTATE 42501)
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_6;
SET LOCAL ROLE anon;
DO $$
DECLARE
    err_code TEXT;
BEGIN
    -- 6a. anon SELECT
    BEGIN
        PERFORM * FROM public.revoked_tokens LIMIT 1;
        RAISE EXCEPTION 'TEST 6A FAILED: anon SELECT unexpectedly succeeded!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 6A FAILED: Expected SQLSTATE 42501 but received %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 6A PASSED: anon SELECT rejected with verified SQLSTATE 42501.';
    END;

    -- 6b. anon INSERT
    BEGIN
        INSERT INTO public.revoked_tokens (jti, user_id, expires_at) VALUES ('pp_rogue_anon', 'usr_x', pg_catalog.now());
        RAISE EXCEPTION 'TEST 6B FAILED: anon INSERT unexpectedly succeeded!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 6B FAILED: Expected SQLSTATE 42501 but received %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 6B PASSED: anon INSERT rejected with verified SQLSTATE 42501.';
    END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_6;

-- -----------------------------------------------------------------------------
-- TEST 7: authenticated role cannot access table (Must return verified SQLSTATE 42501)
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_7;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    err_code TEXT;
BEGIN
    BEGIN
        PERFORM * FROM public.revoked_tokens LIMIT 1;
        RAISE EXCEPTION 'TEST 7 FAILED: authenticated SELECT unexpectedly succeeded!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 7 FAILED: Expected SQLSTATE 42501 but received %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 7 PASSED: authenticated SELECT rejected with verified SQLSTATE 42501.';
    END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_7;

-- -----------------------------------------------------------------------------
-- TEST 8: Unauthorized roles cannot execute cleanup function (Must return SQLSTATE 42501)
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_8;
SET LOCAL ROLE pulsepilot_app;
DO $$
DECLARE
    err_code TEXT;
BEGIN
    BEGIN
        PERFORM public.cleanup_expired_revoked_tokens();
        RAISE EXCEPTION 'TEST 8 FAILED: pulsepilot_app executed cleanup function unexpectedly!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 8 FAILED: Expected SQLSTATE 42501 but received %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 8 PASSED: pulsepilot_app EXECUTE cleanup rejected with verified SQLSTATE 42501.';
    END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_8;

-- -----------------------------------------------------------------------------
-- TEST 9: Maintenance Role Under FORCE RLS: Deletes Expired, CANNOT Delete Active
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_9;
SET LOCAL ROLE pulsepilot_revocation_maint;
DO $$
DECLARE
    deleted_rows INTEGER;
BEGIN
    -- 9a. Attempt to delete ACTIVE record (expires_at > now)
    DELETE FROM public.revoked_tokens WHERE jti LIKE 'pp_stage_sec03_active_%';
    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    IF deleted_rows <> 0 THEN
        RAISE EXCEPTION 'TEST 9a FAILED: Maintenance role deleted active revocation row (% rows affected)!', deleted_rows;
    END IF;
    RAISE NOTICE '  ✅ LIVE TEST 9a PASSED: Maintenance role RLS strictly prevented deletion of active row (0 rows affected).';

    -- 9b. Attempt to delete EXPIRED record (expires_at < now)
    DELETE FROM public.revoked_tokens WHERE jti LIKE 'pp_stage_sec03_expired_%';
    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    IF deleted_rows < 1 THEN
        RAISE EXCEPTION 'TEST 9b FAILED: Maintenance role failed to delete expired record (% rows affected)!', deleted_rows;
    END IF;
    RAISE NOTICE '  ✅ LIVE TEST 9b PASSED: Maintenance role successfully deleted expired row (% row affected).', deleted_rows;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_9;

-- -----------------------------------------------------------------------------
-- TEST 10: Authorized service_role can execute cleanup function
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_10;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    cleanup_result INTEGER;
BEGIN
    -- Insert another expired record to test function execution
    INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason)
    VALUES ('pp_stage_sec03_func_exp_' || clock_timestamp()::text, 'usr_sarah_stage', pg_catalog.now() - interval '2 hours', 'FUNC_TEST');
    
    cleanup_result := public.cleanup_expired_revoked_tokens();
    IF cleanup_result < 1 THEN
        RAISE EXCEPTION 'TEST 10 FAILED: cleanup_expired_revoked_tokens returned % deleted rows (expected >= 1)', cleanup_result;
    END IF;
    RAISE NOTICE '  ✅ LIVE TEST 10 PASSED: service_role executed cleanup function successfully (deleted count: %).', cleanup_result;
END $$;
RESET ROLE;
RELEASE SAVEPOINT sp_test_10;

-- -----------------------------------------------------------------------------
-- TEST 11: Real Schema-Shadowing Attack Test (Dual Proof: Active Kept, Expired Deleted)
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_11;
DO $$
DECLARE
    active_test_jti TEXT;
    expired_test_jti TEXT;
    shadow_result INTEGER;
    remaining_active INTEGER;
    remaining_expired INTEGER;
BEGIN
    active_test_jti := 'pp_stage_sec03_shadow_act_' || clock_timestamp()::text;
    expired_test_jti := 'pp_stage_sec03_shadow_exp_' || clock_timestamp()::text;
    
    -- 1. Insert BOTH an active token AND an expired token
    INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason)
    VALUES 
        (active_test_jti, 'usr_sarah_stage', pg_catalog.now() + interval '5 hours', 'SHADOW_TEST_ACTIVE'),
        (expired_test_jti, 'usr_sarah_stage', pg_catalog.now() - interval '3 hours', 'SHADOW_TEST_EXPIRED');

    -- 2. Inject hostile public.now() returning future date (year 2099)
    -- If cleanup_expired_revoked_tokens relied on unadorned now() with public in search_path,
    -- it would see year 2099 and purge the active token above!
    EXECUTE $func$
        CREATE OR REPLACE FUNCTION public.now() RETURNS timestamptz AS $$
        BEGIN
            RETURN '2099-01-01 00:00:00+00'::timestamptz;
        END;
        $$ LANGUAGE plpgsql;
    $func$;
    RAISE NOTICE 'Hostile shadow function public.now() created (returns 2099-01-01).';

    -- 3. Execute cleanup function as service_role
    SET LOCAL ROLE service_role;
    shadow_result := public.cleanup_expired_revoked_tokens();
    RESET ROLE;

    -- 4. Dual Verification on actual database state:
    -- 4a. Active token MUST STILL BE PRESENT (COUNT = 1)
    SELECT COUNT(*) INTO remaining_active FROM public.revoked_tokens WHERE jti = active_test_jti;
    IF remaining_active <> 1 THEN
        RAISE EXCEPTION 'TEST 11 CRITICAL FAILURE: Hostile public.now() shadow caused premature deletion of active token!';
    END IF;

    -- 4b. Expired token MUST BE DELETED (COUNT = 0)
    SELECT COUNT(*) INTO remaining_expired FROM public.revoked_tokens WHERE jti = expired_test_jti;
    IF remaining_expired <> 0 THEN
        RAISE EXCEPTION 'TEST 11 CRITICAL FAILURE: Cleanup function failed to delete expired token during shadow test!';
    END IF;

    -- 5. Drop the hostile shadow function
    DROP FUNCTION public.now();
    RAISE NOTICE '  ✅ LIVE TEST 11 PASSED (DUAL PROOF): Active token preserved AND expired token deleted under hostile public.now() shadow (search_path = pg_catalog).';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_11;

-- -----------------------------------------------------------------------------
-- TEST 12: service_role has NO DIRECT Table Privileges (Function-only access)
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_12;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    err_code TEXT;
BEGIN
    BEGIN
        PERFORM * FROM public.revoked_tokens LIMIT 1;
        RAISE EXCEPTION 'TEST 12 FAILED: service_role directly SELECTed from revoked_tokens!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 12 FAILED: Expected SQLSTATE 42501 for direct service_role SELECT, got %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 12 PASSED: service_role denied direct table access (SQLSTATE 42501; function execution only).';
    END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_12;

-- -----------------------------------------------------------------------------
-- TEST 13: pulsepilot_app cannot ALTER or Replace Maintenance Function
-- -----------------------------------------------------------------------------
RESET ROLE;
SAVEPOINT sp_test_13;
SET LOCAL ROLE pulsepilot_app;
DO $$
DECLARE
    err_code TEXT;
BEGIN
    BEGIN
        EXECUTE 'ALTER FUNCTION public.cleanup_expired_revoked_tokens() OWNER TO pulsepilot_app';
        RAISE EXCEPTION 'TEST 13 FAILED: pulsepilot_app successfully altered function ownership!';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_code = RETURNED_SQLSTATE;
            IF err_code <> '42501' THEN
                RAISE EXCEPTION 'TEST 13 FAILED: Expected SQLSTATE 42501 for ALTER FUNCTION, got %: %', err_code, SQLERRM;
            END IF;
            RAISE NOTICE '  ✅ LIVE TEST 13 PASSED: pulsepilot_app cannot ALTER or hijack maintenance function (SQLSTATE 42501).';
    END;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT sp_test_13;

-- Roll back all test changes so no temporary test records persist
ROLLBACK;

\echo '================================================================='
\echo ' ALL 13 LIVE POSTGRESQL ACCEPTANCE TESTS COMPLETED SUCCESSFULLY'
\echo ' (Test transaction rolled back: staging database remains clean)'
\echo '================================================================='
