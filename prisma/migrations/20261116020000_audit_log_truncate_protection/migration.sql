-- =============================================================================
-- Migration: 20261116020000_audit_log_truncate_protection
-- PulsePilot AI — SEC-04 Audit Ledger Immutability & TRUNCATE Defense (Staging Hardened)
-- =============================================================================

-- 1. Hardened Statement-Level Function Blocking TRUNCATE
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_truncate()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY ALERT: audit_logs is an append-only cryptographic ledger. TRUNCATE operation is strictly prohibited.'
        USING ERRCODE = 'P0001',
              HINT = 'Audit logs are immutable and cannot be truncated under any circumstances.';
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.prevent_audit_logs_truncate() OWNER TO postgres;

-- 2. Statement-Level Trigger on public.audit_logs
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_audit_logs_truncate();

-- 3. Hardened Row-Level Function Blocking UPDATE and DELETE
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY ALERT: audit_logs is an append-only cryptographic ledger. UPDATE and DELETE operations are strictly prohibited.'
        USING ERRCODE = 'P0001',
              HINT = 'Individual audit log records are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = pg_catalog;

ALTER FUNCTION public.prevent_audit_logs_mutation() OWNER TO postgres;

-- 4. Row-Level Trigger on public.audit_logs
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_mutation ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_mutation
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_logs_mutation();

-- 5. Revoke Execution Privileges on Guard Functions from Untrusted Roles
REVOKE ALL ON FUNCTION public.prevent_audit_logs_truncate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_audit_logs_mutation() FROM PUBLIC, anon, authenticated;

-- 6. Table-Level Permission Hardening on public.audit_logs
REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.audit_logs FROM anon, authenticated;

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN 
        REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.audit_logs FROM pulsepilot_app;
        GRANT SELECT, INSERT ON TABLE public.audit_logs TO pulsepilot_app;
        REVOKE EXECUTE ON FUNCTION public.prevent_audit_logs_truncate() FROM pulsepilot_app;
        REVOKE EXECUTE ON FUNCTION public.prevent_audit_logs_mutation() FROM pulsepilot_app;
    END IF; 
END $$;

