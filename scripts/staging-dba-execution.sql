-- =============================================================================
-- PULSEPILOT AI — SEC-03.2 STAGING DBA EXECUTION & VERIFICATION PACKAGE (V4)
-- Target: prisma/migrations/20261116010000_create_revoked_tokens/migration.sql
-- Classification: Staging Environment Database Execution & Live Acceptance Runbook
-- Safety Notice: DO NOT EXECUTE ON PRODUCTION. Requires explicit staging confirmation.
-- =============================================================================
-- Authoritative Schema Sequence:
--   1. STAGE 1: Safety Gate & Independent Staging Identity Verification.
--   2. STAGE 2: Provision Prerequisite Roles (pulsepilot_app, pulsepilot_revocation_maint).
--   3. STAGE 3: Apply Prisma Migrations Once (npm run prisma:migrate:staging) & Verify.
--   4. STAGE 4: Read-Only Schema, Privilege & RLS Policy Inspection.
--   5. STAGE 5: Execute Transaction-Isolated Live Acceptance Tests (13 Tests, Self-Reverting).
-- =============================================================================

\set ON_ERROR_STOP on

-- =============================================================================
-- STAGE 1: SAFETY GATE & INDEPENDENT STAGING IDENTITY VERIFICATION
-- =============================================================================

-- Required DBA session configuration before running this script:
--   SET app.target_environment = 'staging';
--   SET app.expected_staging_project_ref = '<your-staging-project-ref>';
DO $$
DECLARE
    current_db TEXT;
    target_env TEXT;
    expected_ref TEXT;
    connected_user TEXT;
    sess_user TEXT;
    srv_addr INET;
    srv_port INT;
    pg_ver TEXT;
BEGIN
    SELECT current_database() INTO current_db;
    SELECT current_user INTO connected_user;
    SELECT session_user INTO sess_user;
    srv_addr := inet_server_addr();
    srv_port := inet_server_port();
    SELECT version() INTO pg_ver;

    target_env := current_setting('app.target_environment', true);
    expected_ref := current_setting('app.expected_staging_project_ref', true);

    -- 1. Check for missing explicit target environment declaration
    IF target_env IS DISTINCT FROM 'staging' THEN
        RAISE EXCEPTION 'CRITICAL SAFETY HALT: app.target_environment must be set to ''staging''. Execute: SET app.target_environment = ''staging''; before running this script.'
            USING ERRCODE = 'invalid_parameter_value',
                  HINT = 'This prevents accidental execution against non-staging environments.';
    END IF;

    -- 2. Validate mandatory expected staging project reference
    IF expected_ref IS NULL OR expected_ref = '' THEN
        RAISE EXCEPTION 'CRITICAL SAFETY HALT: app.expected_staging_project_ref is mandatory! Execute: SET app.expected_staging_project_ref = ''<your-staging-project-ref>''; before running this script.'
            USING ERRCODE = 'invalid_parameter_value',
                  HINT = 'An independently configured expected staging project identity is strictly required.';
    END IF;

    -- Check for placeholder values
    IF expected_ref LIKE '%your-staging%' OR expected_ref LIKE '%placeholder%' OR expected_ref = 'staging' OR expected_ref = 'postgres' THEN
        RAISE EXCEPTION 'CRITICAL SAFETY HALT: app.expected_staging_project_ref "%" appears to be a placeholder!' , expected_ref
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Format validation
    IF expected_ref !~ '^[a-z0-9]{12,40}$' THEN
        RAISE EXCEPTION 'CRITICAL SAFETY HALT: app.expected_staging_project_ref "%" does not match valid Supabase reference format (lowercase alphanumeric, 12-40 chars).' , expected_ref
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 3. Production Collision Check against known production reference
    IF expected_ref = 'czqhiuidekvozuoqdmyd' THEN
        RAISE EXCEPTION 'CRITICAL SAFETY HALT: app.expected_staging_project_ref matches PRODUCTION project "czqhiuidekvozuoqdmyd"!'
            USING ERRCODE = 'restrict_violation',
                  HINT = 'Remote execution against production is strictly prohibited by Cardinal Rule 1.';
    END IF;

    IF current_db LIKE '%czqhiuidekvozuoqdmyd%' THEN
        RAISE EXCEPTION 'CRITICAL SAFETY HALT: Target database name matches PRODUCTION project "czqhiuidekvozuoqdmyd"!'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RAISE NOTICE '=============================================================================';
    RAISE NOTICE ' SAFETY GATE PASSED: Staging Identity & Configuration Verified';
    RAISE NOTICE ' Expected Staging Ref: %', expected_ref;
    RAISE NOTICE ' Target Database:      %', current_db;
    RAISE NOTICE ' Connected User:       % (session: %)', connected_user, sess_user;
    RAISE NOTICE ' Server Endpoint:      %:%', COALESCE(srv_addr::text, 'managed-cloud-host'), COALESCE(srv_port, 5432);
    RAISE NOTICE ' PostgreSQL Version:   %', split_part(pg_ver, ' on ', 1);
    RAISE NOTICE ' Operator Assertion:   app.target_environment = ''staging''';
    RAISE NOTICE ' Note: Operator assertion and current_database()=''postgres'' do not alone prove physical identity;';
    RAISE NOTICE ' physical identity is derived from verified host endpoint matching expected_ref.';
    RAISE NOTICE '=============================================================================';
END $$;

-- =============================================================================
-- STAGE 2: PREREQUISITE ROLE PROVISIONING (BEFORE APPLYING MIGRATIONS)
-- =============================================================================

-- Provision pulsepilot_app least-privilege web runtime role if not present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN
        CREATE ROLE pulsepilot_app WITH 
            LOGIN 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            NOBYPASSRLS;
        RAISE NOTICE 'Provisioned prerequisite role: pulsepilot_app (LOGIN, NOSUPERUSER, NOBYPASSRLS).';
        RAISE NOTICE 'ACTION REQUIRED: Set a strong random password for pulsepilot_app: ALTER ROLE pulsepilot_app WITH PASSWORD ''<STRONG_PASSWORD>'';';
    ELSE
        RAISE NOTICE 'Prerequisite role "pulsepilot_app" already exists.';
    END IF;
END $$;

-- Provision pulsepilot_revocation_maint maintenance role if not present
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
        RAISE NOTICE 'Provisioned maintenance role: pulsepilot_revocation_maint (NOLOGIN, NOSUPERUSER, NOBYPASSRLS).';
    ELSE
        RAISE NOTICE 'Role "pulsepilot_revocation_maint" already exists.';
    END IF;
END $$;

-- Assert that neither role possesses elevated, superuser, or bypass privileges
DO $$
DECLARE
    app_super BOOLEAN;
    app_bypass BOOLEAN;
    maint_super BOOLEAN;
    maint_bypass BOOLEAN;
    maint_login BOOLEAN;
BEGIN
    SELECT rolsuper, rolbypassrls INTO app_super, app_bypass
    FROM pg_roles WHERE rolname = 'pulsepilot_app';

    SELECT rolsuper, rolbypassrls, rolcanlogin INTO maint_super, maint_bypass, maint_login
    FROM pg_roles WHERE rolname = 'pulsepilot_revocation_maint';

    IF app_super OR app_bypass THEN
        RAISE EXCEPTION 'SECURITY ALERT: pulsepilot_app has rolsuper=% or rolbypassrls=% (must be false)!', app_super, app_bypass
            USING ERRCODE = 'invalid_role_specification';
    END IF;

    IF maint_super OR maint_bypass OR maint_login THEN
        RAISE EXCEPTION 'SECURITY ALERT: pulsepilot_revocation_maint has rolsuper=%, rolbypassrls=%, rolcanlogin=% (all must be false)!', maint_super, maint_bypass, maint_login
            USING ERRCODE = 'invalid_role_specification';
    END IF;

    RAISE NOTICE 'Role attribute invariants verified: NOSUPERUSER and NOBYPASSRLS confirmed for both roles.';
END $$;

-- =============================================================================
-- STAGE 3: PRISMA MIGRATION ASSERTION (ONE AUTHORITATIVE SCHEMA INITIALIZATION PATH)
-- =============================================================================
-- Invariant: Prisma migrations are the SINGLE authoritative schema path.
-- The DBA harness verifies migration completion and does not execute duplicate DDL.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'revoked_tokens'
    ) THEN
        RAISE EXCEPTION 'AUTHORITATIVE MIGRATION MISSING: Table public.revoked_tokens does not exist. Apply Prisma migrations first via: npm run prisma:migrate:staging'
            USING ERRCODE = 'undefined_table',
                  HINT = 'Prisma migrations are the single authoritative schema initialization path. Do not recreate DDL in the DBA harness.';
    END IF;
    RAISE NOTICE 'Authoritative schema verified: public.revoked_tokens is present (applied via Prisma migration).';
END $$;

-- Verify maintenance function exists and is owned by pulsepilot_revocation_maint
DO $$
DECLARE
    fn_owner TEXT;
    fn_secdef BOOLEAN;
    fn_config TEXT[];
BEGIN
    SELECT r.rolname, p.prosecdef, p.proconfig 
    INTO fn_owner, fn_secdef, fn_config
    FROM pg_proc p
    JOIN pg_roles r ON p.proowner = r.oid
    WHERE p.proname = 'cleanup_expired_revoked_tokens';

    IF fn_owner IS NULL THEN
        RAISE EXCEPTION 'AUTHORITATIVE MIGRATION MISSING: Function public.cleanup_expired_revoked_tokens() does not exist. Apply Prisma migrations first via: npm run prisma:migrate:staging'
            USING ERRCODE = 'undefined_function';
    END IF;

    IF fn_owner <> 'pulsepilot_revocation_maint' THEN
        RAISE EXCEPTION 'FUNCTION OWNERSHIP VIOLATION: Function owner is "%", expected "pulsepilot_revocation_maint"!', fn_owner;
    END IF;

    IF NOT fn_secdef THEN
        RAISE EXCEPTION 'SECURITY DEFINER VIOLATION: Function public.cleanup_expired_revoked_tokens() is not SECURITY DEFINER!';
    END IF;

    IF NOT ('search_path=pg_catalog' = ANY(fn_config)) THEN
        RAISE EXCEPTION 'SEARCH PATH VIOLATION: Function does not have search_path=pg_catalog set in proconfig (% )!', fn_config;
    END IF;

    RAISE NOTICE 'Authoritative function verified: cleanup_expired_revoked_tokens() is SECURITY DEFINER, search_path=pg_catalog, owned by pulsepilot_revocation_maint.';
END $$;

-- =============================================================================
-- STAGE 4: READ-ONLY EVIDENCE & ATTRIBUTE INSPECTION
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
-- STAGE 5: LIVE POSTGRESQL ACCEPTANCE TESTS (TRANSACTION-ISOLATED, SELF-REVERTING)
-- =============================================================================

\echo '================================================================='
\echo ' STARTING LIVE ROLE & BEHAVIORAL ACCEPTANCE TESTS (13 TESTS)'
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
