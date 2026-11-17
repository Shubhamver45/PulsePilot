-- Fail-closed tenant isolation for the restricted PulsePilot runtime role.
-- Missing/empty context returns no rows and rejects writes.
-- Legacy proposals without organization_id remain quarantined rather than guessed.
ALTER TABLE public.experiment_proposals ADD COLUMN IF NOT EXISTS organization_id TEXT;
CREATE INDEX IF NOT EXISTS experiment_proposals_organization_status_idx
  ON public.experiment_proposals (organization_id, status);
ALTER TABLE public.experiment_proposals
  DROP CONSTRAINT IF EXISTS experiment_proposals_org_required;
ALTER TABLE public.experiment_proposals
  ADD CONSTRAINT experiment_proposals_org_required
  CHECK (organization_id IS NOT NULL) NOT VALID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN
    ALTER ROLE pulsepilot_app NOBYPASSRLS;
  END IF;
END $$;

DROP POLICY IF EXISTS "pulsepilot_app_organizations_isolation" ON public.organizations;
CREATE POLICY "pulsepilot_app_organizations_isolation" ON public.organizations FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND id = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND id = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "pulsepilot_app_users_isolation" ON public.users;
CREATE POLICY "pulsepilot_app_users_isolation" ON public.users FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND "organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND "organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "pulsepilot_app_projects_isolation" ON public.projects;
CREATE POLICY "pulsepilot_app_projects_isolation" ON public.projects FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND "organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND "organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "pulsepilot_app_experiments_isolation" ON public.experiments;
CREATE POLICY "pulsepilot_app_experiments_isolation" ON public.experiments FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = public.experiments."projectId"
      AND p."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = public.experiments."projectId"
      AND p."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "pulsepilot_app_experiment_variants_isolation" ON public.experiment_variants;
CREATE POLICY "pulsepilot_app_experiment_variants_isolation" ON public.experiment_variants FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.experiments e JOIN public.projects p ON p.id = e."projectId"
    WHERE e.id = public.experiment_variants."experimentId"
      AND p."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.experiments e JOIN public.projects p ON p.id = e."projectId"
    WHERE e.id = public.experiment_variants."experimentId"
      AND p."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "pulsepilot_app_metrics_isolation" ON public.metrics;
CREATE POLICY "pulsepilot_app_metrics_isolation" ON public.metrics FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = public.metrics."projectId"
      AND p."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = public.metrics."projectId"
      AND p."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "pulsepilot_app_telemetry_events_isolation" ON public.telemetry_events;
CREATE POLICY "pulsepilot_app_telemetry_events_isolation" ON public.telemetry_events FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.experiments e JOIN public.projects p ON p.id = e."projectId"
    WHERE e.id = public.telemetry_events."experimentId"
      AND p."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.experiments e JOIN public.projects p ON p.id = e."projectId"
    WHERE e.id = public.telemetry_events."experimentId"
      AND p."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "pulsepilot_app_agent_runs_isolation" ON public.agent_runs;
CREATE POLICY "pulsepilot_app_agent_runs_isolation" ON public.agent_runs FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = public.agent_runs."userId"
      AND u."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = public.agent_runs."userId"
      AND u."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "pulsepilot_app_audit_logs_isolation" ON public.audit_logs;
CREATE POLICY "pulsepilot_app_audit_logs_isolation" ON public.audit_logs FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND "organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND "organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "pulsepilot_app_experiment_proposals_isolation" ON public.experiment_proposals;
CREATE POLICY "pulsepilot_app_experiment_proposals_isolation" ON public.experiment_proposals FOR ALL TO pulsepilot_app
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.current_organization_id', true), ''));
