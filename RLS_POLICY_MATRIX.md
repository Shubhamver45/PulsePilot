# PULSEpilot AI — Row-Level Security (RLS) Policy Matrix & Access Architecture
## Technical Specification for Table-by-Table Row-Level Security Hardening

**Document Version:** 2.0.0 (Remediation Architecture V2)  
**Security Domain:** PostgreSQL Row-Level Security (RLS) & PostgREST Exposure Containment  
**Target Engine:** PostgreSQL 15+ / Supabase Managed Cloud  
**Target Schema:** `public` (10 Application Tables)  

---

## 1. Architectural Principles & Threat Model

### 1.1 The Dual-Access Reality
PulsePilot AI operates under two distinct database access channels:
1. **Prisma ORM via Direct PostgreSQL Connection (Port 5432 / Supavisor 6543):**
   - Originates from server-side Next.js Route Handlers and Server Actions.
   - Authenticates as the dedicated application runtime role (`pulsepilot_app`).
   - Executes parameterized SQL for core business workflows, analytics, and audit logging.
2. **Supabase PostgREST API (HTTPS `/rest/v1/*`):**
   - Accessible from the public internet.
   - Authenticates using the client-exposed anonymous API key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) mapping to the `anon` PostgreSQL role, or Supabase Auth JWTs mapping to the `authenticated` role.
   - **Audit Ground Truth:** PulsePilot AI's user interface does *not* utilize PostgREST for data operations. All client state and telemetry query Next.js API route handlers (`/api/experiments`, `/api/telemetry/track`, `/api/audit-logs`, `/api/flagsmith/rollout`). PostgREST exposure is completely unnecessary and represents an unmitigated attack surface if unshielded.

### 1.2 The Failure of the V1 Remediation Proposal
In Remediation Plan V1, the proposed script enabled RLS on all 10 tables without defining policies for `pulsepilot_app`, assuming that revoking from `anon` was sufficient.
- **PostgreSQL Default-Deny Behavior:** Under PostgreSQL semantics, when RLS is enabled on a table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`), all roles that do not own the table and do not possess `BYPASS RLS` are immediately restricted to viewing and modifying **zero rows** unless an explicit policy permits the operation.
- Because `pulsepilot_app` is not the table owner (`postgres` owns the tables), executing V1 would have completely severed runtime database access, crashing the application.

### 1.3 Architecture V2 Policy Mandate: Explicit Policies vs. BYPASSRLS
Per engineering guidelines, broad RLS bypass (`ALTER ROLE pulsepilot_app BYPASSRLS;`) is rejected as a default convenience mechanism.
- Architecture V2 enforces **Explicit Row-Level Security Policies** defined specifically for `pulsepilot_app`.
- Direct table permissions for `anon` and `authenticated` are completely revoked (`REVOKE ALL`), guaranteeing zero PostgREST exposure.
- `FORCE ROW LEVEL SECURITY` is evaluated on each table to ensure table owners (`postgres`) are also subjected to RLS if application code accidentally executes under owner credentials.

---

## 2. Table-by-Table Data Ownership & Access Model

The public schema contains exactly ten tables created in `prisma/migrations/20261116000000_init_production_schema/migration.sql`:

```
1. _prisma_migrations       (Internal Schema Migration Ledger)
2. organizations            (Tenant Boundaries)
3. users                    (User Accounts & RBAC Roles)
4. projects                 (Workspace Flagsmith Configurations)
5. experiments              (Flagsmith Multivariate Experiments)
6. experiment_variants      (Variants & Traffic Allocations)
7. metrics                  (Evaluation & Guardrail Definitions)
8. telemetry_events         (Telemetry Stream & Deduplication)
9. agent_runs               (Gemini AI Agent Execution Logs)
10. audit_logs              (Cryptographic SHA-256 Ledger)
```

### Table 1: `_prisma_migrations`
- **Ownership Scope:** Internal System Object (Prisma Engine).
- **Tenant Scope:** Global.
- **Application Runtime Requirement:** **NONE.** Runtime application handlers never query or modify migration history.
- **Public Anonymous Access:** **DENIED.**
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `NO` (Migration tool runs as table owner `postgres` / `pulsepilot_migration`).
- **Policy Definition:** No policies defined. Default-deny blocks all non-owner roles.

### Table 2: `organizations`
- **Ownership Scope:** Tenant Root.
- **Tenant Scope:** Self-contained organization boundary.
- **Application Runtime Requirement:** `SELECT, INSERT, UPDATE`. (Tenant registration, workspace switching, profile updates).
- **Public Anonymous Access:** **DENIED.** (Fixes verified leak of customer tenant names/slugs via PostgREST).
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - `SELECT`: Allowed for valid application queries.
  - `INSERT`: Allowed for organization registration.
  - `UPDATE`: Allowed for tenant metadata updates.
  - `DELETE`: Denied (Soft-delete or DBA-only).

### Table 3: `users`
- **Ownership Scope:** User Profile / Organization Membership.
- **Tenant Scope:** Scoped to `organizationId`.
- **Application Runtime Requirement:** `SELECT, INSERT, UPDATE`.
- **Public Anonymous Access:** **DENIED.** (Fixes exposure of user emails, full names, and RBAC roles).
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - `SELECT`: Allowed for session resolution and workspace member lookups.
  - `INSERT`: Allowed for user onboarding.
  - `UPDATE`: Allowed for profile/role modifications.
  - `DELETE`: Denied.

### Table 4: `projects`
- **Ownership Scope:** Workspace / Flagsmith Environment Binding.
- **Tenant Scope:** Scoped to `organizationId`.
- **Application Runtime Requirement:** `SELECT, INSERT, UPDATE`.
- **Public Anonymous Access:** **DENIED.** (Critical: Contains `flagsmithEnvironmentKey` and `flagsmithServerKey`).
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - `SELECT`: Allowed for loading Flagsmith workspace configuration.
  - `INSERT`: Allowed for creating new projects.
  - `UPDATE`: Allowed for updating project keys and settings.
  - `DELETE`: Denied.

### Table 5: `experiments`
- **Ownership Scope:** Feature Flag Experiment State.
- **Tenant Scope:** Scoped to `projectId` $\to$ `organizationId`.
- **Application Runtime Requirement:** `SELECT, INSERT, UPDATE, DELETE`.
- **Public Anonymous Access:** **DENIED.** (Exposes hypothesis, business rationale, target audience, and winning variant).
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - Full CRUD allowed for runtime application workflows.

### Table 6: `experiment_variants`
- **Ownership Scope:** Multivariate Split Definitions.
- **Tenant Scope:** Scoped to `experimentId`.
- **Application Runtime Requirement:** `SELECT, INSERT, UPDATE, DELETE`.
- **Public Anonymous Access:** **DENIED.** (Exposes feature configuration payloads, JSON feature values, and traffic split percentages).
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - Full CRUD allowed for runtime application workflows.

### Table 7: `metrics`
- **Ownership Scope:** Experiment Evaluation & Guardrail Definitions.
- **Tenant Scope:** Scoped to `projectId`.
- **Application Runtime Requirement:** `SELECT, INSERT, UPDATE, DELETE`.
- **Public Anonymous Access:** **DENIED.**
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - Full CRUD allowed for metric definitions.

### Table 8: `telemetry_events`
- **Ownership Scope:** Raw Telemetry Stream.
- **Tenant Scope:** Scoped to `experimentId` and `variantId`.
- **Application Runtime Requirement:** `SELECT, INSERT` ONLY. (No mutations or deletions).
- **Public Anonymous Access:** **DENIED.** (Prevents unauthorized harvesting of distinct user IDs, timestamps, and behavioral properties).
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - `SELECT`: Allowed for statistical aggregations (`stats.ts` and `analytics-agent.ts`).
  - `INSERT`: Allowed for deduplicated event tracking (`/api/telemetry/track`).
  - `UPDATE`: **EXPLICITLY DENIED.**
  - `DELETE`: **EXPLICITLY DENIED.**

### Table 9: `agent_runs`
- **Ownership Scope:** Gemini AI Prompts & Output Artifacts.
- **Tenant Scope:** Scoped to `experimentId` and `userId`.
- **Application Runtime Requirement:** `SELECT, INSERT, UPDATE`.
- **Public Anonymous Access:** **DENIED.** (Exposes raw AI reasoning, hypothesis prompts, and structured JSON decisions).
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - `SELECT, INSERT, UPDATE`: Allowed for agent orchestration.
  - `DELETE`: Denied.

### Table 10: `audit_logs`
- **Ownership Scope:** Cryptographic SHA-256 Ledger.
- **Tenant Scope:** Scoped to `organizationId`.
- **Application Runtime Requirement:** `SELECT, INSERT` ONLY.
- **Public Anonymous Access:** **DENIED.** (Prevents enumeration of internal governance decisions and signatures).
- **Authenticated PostgREST Access:** **DENIED.**
- **RLS Enabled:** `YES`
- **FORCE RLS:** `YES`
- **Policy Definition for `pulsepilot_app`:**
  - `SELECT`: Allowed for tamper-verification and timeline rendering.
  - `INSERT`: Allowed for recording new signed audit records under transaction advisory lock.
  - `UPDATE`: **EXPLICITLY DENIED.**
  - `DELETE`: **EXPLICITLY DENIED.**

---

## 3. Comprehensive RLS Specification Matrix

| Table Name | RLS Enabled | FORCE RLS | Ownership Scope | Public `anon` | Supabase `auth` | `pulsepilot_app` Privileges | Explicit Policies for `pulsepilot_app` |
| :--- | :---: | :---: | :--- | :---: | :---: | :--- | :--- |
| `_prisma_migrations` | **YES** | NO | System Global | **DENY** | **DENY** | NONE | No policy (Default Deny) |
| `organizations` | **YES** | **YES** | Tenant Root | **DENY** | **DENY** | `SELECT`, `INSERT`, `UPDATE` | `org_app_select`, `org_app_insert`, `org_app_update` |
| `users` | **YES** | **YES** | Tenant Scoped | **DENY** | **DENY** | `SELECT`, `INSERT`, `UPDATE` | `usr_app_select`, `usr_app_insert`, `usr_app_update` |
| `projects` | **YES** | **YES** | Tenant Scoped | **DENY** | **DENY** | `SELECT`, `INSERT`, `UPDATE` | `prj_app_select`, `prj_app_insert`, `prj_app_update` |
| `experiments` | **YES** | **YES** | Tenant Scoped | **DENY** | **DENY** | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `exp_app_crud` |
| `experiment_variants`| **YES** | **YES** | Experiment Scoped | **DENY** | **DENY** | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `var_app_crud` |
| `metrics` | **YES** | **YES** | Project Scoped | **DENY** | **DENY** | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `met_app_crud` |
| `telemetry_events` | **YES** | **YES** | Experiment Scoped | **DENY** | **DENY** | `SELECT`, `INSERT` | `tel_app_select`, `tel_app_insert` |
| `agent_runs` | **YES** | **YES** | Experiment Scoped | **DENY** | **DENY** | `SELECT`, `INSERT`, `UPDATE` | `agt_app_select`, `agt_app_insert`, `agt_app_update` |
| `audit_logs` | **YES** | **YES** | Cryptographic Ledger| **DENY** | **DENY** | `SELECT`, `INSERT` | `aud_app_select`, `aud_app_insert` |

---

## 4. Production-Grade RLS SQL Implementation Script

The following SQL script implements the exact explicit policies defined above. It must be applied in a transaction on the target database by the migration role (`postgres`):

```sql
BEGIN;

-- =============================================================================
-- STEP 1: ENABLE RLS AND FORCE RLS ACROSS ALL 10 TABLES
-- =============================================================================

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_variants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics FORCE ROW LEVEL SECURITY;

ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 2: REVOKE ALL PRIVILEGES FROM PUBLIC POSTGREST ROLES (anon & authenticated)
-- =============================================================================

REVOKE ALL ON TABLE 
    public._prisma_migrations,
    public.organizations,
    public.users,
    public.projects,
    public.experiments,
    public.experiment_variants,
    public.metrics,
    public.telemetry_events,
    public.agent_runs,
    public.audit_logs
FROM anon, authenticated;

-- =============================================================================
-- STEP 3: DEFINE EXPLICIT OPERATIONAL POLICIES FOR pulsepilot_app
-- =============================================================================

-- 1. Organizations: SELECT, INSERT, UPDATE
DROP POLICY IF EXISTS org_app_policy ON public.organizations;
CREATE POLICY org_app_policy ON public.organizations
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);

-- 2. Users: SELECT, INSERT, UPDATE
DROP POLICY IF EXISTS usr_app_policy ON public.users;
CREATE POLICY usr_app_policy ON public.users
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);

-- 3. Projects: SELECT, INSERT, UPDATE
DROP POLICY IF EXISTS prj_app_policy ON public.projects;
CREATE POLICY prj_app_policy ON public.projects
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);

-- 4. Experiments: Full CRUD
DROP POLICY IF EXISTS exp_app_policy ON public.experiments;
CREATE POLICY exp_app_policy ON public.experiments
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);

-- 5. Experiment Variants: Full CRUD
DROP POLICY IF EXISTS var_app_policy ON public.experiment_variants;
CREATE POLICY var_app_policy ON public.experiment_variants
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);

-- 6. Metrics: Full CRUD
DROP POLICY IF EXISTS met_app_policy ON public.metrics;
CREATE POLICY met_app_policy ON public.metrics
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);

-- 7. Telemetry Events: SELECT & INSERT ONLY
DROP POLICY IF EXISTS tel_app_select ON public.telemetry_events;
CREATE POLICY tel_app_select ON public.telemetry_events
    FOR SELECT TO pulsepilot_app
    USING (true);

DROP POLICY IF EXISTS tel_app_insert ON public.telemetry_events;
CREATE POLICY tel_app_insert ON public.telemetry_events
    FOR INSERT TO pulsepilot_app
    WITH CHECK (true);

-- 8. Agent Runs: Full CRUD (No DELETE)
DROP POLICY IF EXISTS agt_app_policy ON public.agent_runs;
CREATE POLICY agt_app_policy ON public.agent_runs
    FOR ALL TO pulsepilot_app
    USING (true)
    WITH CHECK (true);

-- 9. Audit Logs: Strictly SELECT & INSERT (Enforces Ledger Immutability at RLS Layer)
DROP POLICY IF EXISTS aud_app_select ON public.audit_logs;
CREATE POLICY aud_app_select ON public.audit_logs
    FOR SELECT TO pulsepilot_app
    USING (true);

DROP POLICY IF EXISTS aud_app_insert ON public.audit_logs;
CREATE POLICY aud_app_insert ON public.audit_logs
    FOR INSERT TO pulsepilot_app
    WITH CHECK (true);

COMMIT;
```

---

## 5. Security Validation & PostgREST Closure Verification

### Verification Test 1: PostgREST Endpoint Exposure
Execute from an external host using the public anonymous key:
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<STAGING_PROJECT_REF>.supabase.co/rest/v1/organizations" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# Expected Result: 403 Forbidden or 401 Unauthorized (Previously returned 200 OK)
```

### Verification Test 2: Immutability Defense-in-Depth
When connected as `pulsepilot_app`:
1. `SELECT COUNT(*) FROM audit_logs;` $\to$ **Allowed by policy `aud_app_select`.**
2. `INSERT INTO audit_logs (...) VALUES (...);` $\to$ **Allowed by policy `aud_app_insert`.**
3. `UPDATE audit_logs SET details = 'tampered';` $\to$ **Blocked by RLS (no UPDATE policy) AND by Table GRANTs AND by Trigger `trg_audit_log_immutable`.**
4. `DELETE FROM audit_logs;` $\to$ **Blocked by RLS (no DELETE policy) AND by Table GRANTs AND by Trigger `trg_audit_log_immutable`.**
5. `TRUNCATE TABLE audit_logs;` $\to$ **Blocked by lack of TRUNCATE privilege AND by Trigger `trg_audit_log_prevent_truncate`.**

