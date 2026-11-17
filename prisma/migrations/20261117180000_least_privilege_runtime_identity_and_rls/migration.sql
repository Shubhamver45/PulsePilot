-- =============================================================================
-- Migration: 20261117180000_least_privilege_runtime_identity_and_rls
-- PulsePilot AI — Production Least-Privilege Runtime Identity & Multi-Tenant RLS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RUNTIME ROLE DEFINITION & USAGE (pulsepilot_app)
-- -----------------------------------------------------------------------------
-- Note: Role provisioning and postgres membership are managed by cloud admin.
-- Least-privilege runtime role switching is enforced via application transactions (SET LOCAL ROLE).

-- -----------------------------------------------------------------------------
-- 2. SCHEMA & TABLE PRIVILEGES FOR RUNTIME ROLE (pulsepilot_app)
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO pulsepilot_app;

-- Grant standard DML to business tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO pulsepilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO pulsepilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO pulsepilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.experiments TO pulsepilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.experiment_variants TO pulsepilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metrics TO pulsepilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telemetry_events TO pulsepilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_runs TO pulsepilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.experiment_proposals TO pulsepilot_app;

-- Grant sequence access for auto-increment / serial columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulsepilot_app;

-- Strict least privilege on immutable ledgers
GRANT SELECT, INSERT ON TABLE public.audit_logs TO pulsepilot_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM pulsepilot_app;

GRANT SELECT, INSERT ON TABLE public.revoked_tokens TO pulsepilot_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.revoked_tokens FROM pulsepilot_app;

-- Migration table must NEVER be accessible to runtime application role
REVOKE ALL ON TABLE public._prisma_migrations FROM pulsepilot_app;

-- Default privileges for future tables created by postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulsepilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pulsepilot_app;

-- -----------------------------------------------------------------------------
-- 3. TENANT ISOLATION ROW LEVEL SECURITY (RLS) POLICIES FOR pulsepilot_app
-- -----------------------------------------------------------------------------

-- Organizations Isolation Policy
DROP POLICY IF EXISTS "pulsepilot_app_organizations_isolation" ON public.organizations;
CREATE POLICY "pulsepilot_app_organizations_isolation" ON public.organizations
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR id = current_setting('app.current_organization_id', true)
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR id = current_setting('app.current_organization_id', true)
    );

-- Users Isolation Policy
DROP POLICY IF EXISTS "pulsepilot_app_users_isolation" ON public.users;
CREATE POLICY "pulsepilot_app_users_isolation" ON public.users
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR "organizationId" = current_setting('app.current_organization_id', true)
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR "organizationId" = current_setting('app.current_organization_id', true)
    );

-- Projects Isolation Policy
DROP POLICY IF EXISTS "pulsepilot_app_projects_isolation" ON public.projects;
CREATE POLICY "pulsepilot_app_projects_isolation" ON public.projects
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR "organizationId" = current_setting('app.current_organization_id', true)
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR "organizationId" = current_setting('app.current_organization_id', true)
    );

-- Experiments Isolation Policy (via Project)
DROP POLICY IF EXISTS "pulsepilot_app_experiments_isolation" ON public.experiments;
CREATE POLICY "pulsepilot_app_experiments_isolation" ON public.experiments
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = public.experiments."projectId"
            AND p."organizationId" = current_setting('app.current_organization_id', true)
        )
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = public.experiments."projectId"
            AND p."organizationId" = current_setting('app.current_organization_id', true)
        )
    );

-- Experiment Variants Isolation Policy (via Experiment -> Project)
DROP POLICY IF EXISTS "pulsepilot_app_experiment_variants_isolation" ON public.experiment_variants;
CREATE POLICY "pulsepilot_app_experiment_variants_isolation" ON public.experiment_variants
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.experiments e
            JOIN public.projects p ON p.id = e."projectId"
            WHERE e.id = public.experiment_variants."experimentId"
            AND p."organizationId" = current_setting('app.current_organization_id', true)
        )
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.experiments e
            JOIN public.projects p ON p.id = e."projectId"
            WHERE e.id = public.experiment_variants."experimentId"
            AND p."organizationId" = current_setting('app.current_organization_id', true)
        )
    );

-- Metrics Isolation Policy (via Project)
DROP POLICY IF EXISTS "pulsepilot_app_metrics_isolation" ON public.metrics;
CREATE POLICY "pulsepilot_app_metrics_isolation" ON public.metrics
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = public.metrics."projectId"
            AND p."organizationId" = current_setting('app.current_organization_id', true)
        )
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = public.metrics."projectId"
            AND p."organizationId" = current_setting('app.current_organization_id', true)
        )
    );

-- Telemetry Events Isolation Policy (via Experiment -> Project)
DROP POLICY IF EXISTS "pulsepilot_app_telemetry_events_isolation" ON public.telemetry_events;
CREATE POLICY "pulsepilot_app_telemetry_events_isolation" ON public.telemetry_events
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.experiments e
            JOIN public.projects p ON p.id = e."projectId"
            WHERE e.id = public.telemetry_events."experimentId"
            AND p."organizationId" = current_setting('app.current_organization_id', true)
        )
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.experiments e
            JOIN public.projects p ON p.id = e."projectId"
            WHERE e.id = public.telemetry_events."experimentId"
            AND p."organizationId" = current_setting('app.current_organization_id', true)
        )
    );

-- Agent Runs Isolation Policy
DROP POLICY IF EXISTS "pulsepilot_app_agent_runs_isolation" ON public.agent_runs;
CREATE POLICY "pulsepilot_app_agent_runs_isolation" ON public.agent_runs
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = public.agent_runs."userId"
            AND u."organizationId" = current_setting('app.current_organization_id', true)
        )
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = public.agent_runs."userId"
            AND u."organizationId" = current_setting('app.current_organization_id', true)
        )
    );

-- Audit Logs Policy (Append-only ledger access)
DROP POLICY IF EXISTS "pulsepilot_app_audit_logs_isolation" ON public.audit_logs;
CREATE POLICY "pulsepilot_app_audit_logs_isolation" ON public.audit_logs
    FOR ALL TO pulsepilot_app
    USING (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR "organizationId" = current_setting('app.current_organization_id', true)
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
        OR "organizationId" = current_setting('app.current_organization_id', true)
    );

-- Revoked Tokens Policy (Active access check)
DROP POLICY IF EXISTS "pulsepilot_app_revoked_tokens_policy" ON public.revoked_tokens;
CREATE POLICY "pulsepilot_app_revoked_tokens_policy" ON public.revoked_tokens
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);

-- Experiment Proposals Policy
DROP POLICY IF EXISTS "pulsepilot_app_experiment_proposals_isolation" ON public.experiment_proposals;
CREATE POLICY "pulsepilot_app_experiment_proposals_isolation" ON public.experiment_proposals
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);
