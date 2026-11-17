-- =============================================================================
-- Migration: 20261117110000_production_database_security_remediation
-- PulsePilot AI — Production Database Security Hardening & Complete Least-Privilege Remediation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HARDEN AUDIT TRIGGER FUNCTIONS (Fix mutable search_path)
-- -----------------------------------------------------------------------------
-- Replaces public.prevent_audit_log_modification with explicit search_path = pg_catalog
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY ALERT: audit_logs is an append-only cryptographic ledger. UPDATE and DELETE operations are forbidden.'
        USING ERRCODE = 'P0001',
              HINT = 'Individual audit log records are immutable and cannot be modified or deleted.';
END;
$$;

ALTER FUNCTION public.prevent_audit_log_modification() OWNER TO postgres;

-- Hardened statement-level trigger function to block TRUNCATE on audit_logs
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_truncate()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY ALERT: audit_logs is an append-only cryptographic ledger. TRUNCATE operation is strictly prohibited.'
        USING ERRCODE = 'P0001',
              HINT = 'Audit logs are immutable and cannot be truncated under any circumstances.';
END;
$$;

ALTER FUNCTION public.prevent_audit_logs_truncate() OWNER TO postgres;

-- Recreate row-level and statement-level immutability triggers on audit_logs
DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_modification();

DROP TRIGGER IF EXISTS trg_audit_logs_prevent_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_audit_logs_truncate();

-- Revoke function execution from untrusted public and client roles
REVOKE ALL ON FUNCTION public.prevent_audit_log_modification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_audit_logs_truncate() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. SCHEMA PRIVILEGE HARDENING
-- -----------------------------------------------------------------------------
-- Ensure unprivileged roles cannot create objects in public schema
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. REVOKE ALL DIRECT PRIVILEGES FROM CLIENT ROLES (anon, authenticated)
-- -----------------------------------------------------------------------------
-- PulsePilot uses server-side Prisma exclusively. Direct PostgREST access is completely denied.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

-- Explicitly ensure _prisma_migrations is completely inaccessible to client roles and public
REVOKE ALL ON TABLE public._prisma_migrations FROM PUBLIC, anon, authenticated;

-- Apply default privilege revocations for the object creator role (postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. ENABLE ROW LEVEL SECURITY (RLS) ON ALL APPLICATION & SYSTEM TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'revoked_tokens') THEN
        EXECUTE 'ALTER TABLE public.revoked_tokens ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'experiment_proposals') THEN
        EXECUTE 'ALTER TABLE public.experiment_proposals ENABLE ROW LEVEL SECURITY';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. DEFENSE-IN-DEPTH DENY-ALL POLICIES FOR CLIENT ROLES
-- -----------------------------------------------------------------------------
-- Since all database access is server-mediated via Prisma (connecting as postgres),
-- client roles (anon, authenticated) have zero PostgREST access.
-- Explicit deny-all policies are defined on all tables to satisfy security advisors.
DROP POLICY IF EXISTS "deny_client_access_organizations" ON public.organizations;
CREATE POLICY "deny_client_access_organizations" ON public.organizations FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_users" ON public.users;
CREATE POLICY "deny_client_access_users" ON public.users FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_projects" ON public.projects;
CREATE POLICY "deny_client_access_projects" ON public.projects FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_experiments" ON public.experiments;
CREATE POLICY "deny_client_access_experiments" ON public.experiments FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_experiment_variants" ON public.experiment_variants;
CREATE POLICY "deny_client_access_experiment_variants" ON public.experiment_variants FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_metrics" ON public.metrics;
CREATE POLICY "deny_client_access_metrics" ON public.metrics FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_telemetry_events" ON public.telemetry_events;
CREATE POLICY "deny_client_access_telemetry_events" ON public.telemetry_events FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_agent_runs" ON public.agent_runs;
CREATE POLICY "deny_client_access_agent_runs" ON public.agent_runs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_audit_logs" ON public.audit_logs;
CREATE POLICY "deny_client_access_audit_logs" ON public.audit_logs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_access_prisma_migrations" ON public._prisma_migrations;
CREATE POLICY "deny_client_access_prisma_migrations" ON public._prisma_migrations FOR ALL TO PUBLIC, anon, authenticated USING (false) WITH CHECK (false);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'revoked_tokens') THEN
        EXECUTE 'DROP POLICY IF EXISTS deny_client_access_revoked_tokens ON public.revoked_tokens; CREATE POLICY deny_client_access_revoked_tokens ON public.revoked_tokens FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'experiment_proposals') THEN
        EXECUTE 'DROP POLICY IF EXISTS deny_client_access_experiment_proposals ON public.experiment_proposals; CREATE POLICY deny_client_access_experiment_proposals ON public.experiment_proposals FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);';
    END IF;
END $$;
