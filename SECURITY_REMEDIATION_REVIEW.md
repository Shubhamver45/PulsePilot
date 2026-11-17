# PULSEpilot AI — Security Remediation Review Before Production Execution
## Independent Technical, Architectural, and Security Pre-Execution Assessment

**Review Date:** November 16, 2026  
**Auditor:** Principal PostgreSQL Security Architect & Application Security Engineer  
**Security Status:** Technical Review & Defect Identification  
**Target Environments:** Supabase Managed PostgreSQL + Next.js Serverless on Vercel  
**Review Target:** `docs/DATABASE_LEAST_PRIVILEGE_PLAN.md`, `DATABASE_PRIVILEGE_MATRIX.md`, `SECURITY_REMEDIATION_PLAN.md`, `src/app/api/flagsmith/rollout/route.ts`, `src/lib/audit/audit-logger.ts`, `prisma/schema.prisma`

---

## 1. Executive Summary

This pre-execution review evaluates the proposed remediation plans for the four production security blockers identified in the PulsePilot AI security audit:
- **SEC-01:** Supabase runtime connection uses unrestricted `postgres` superuser/table-owner role.
- **SEC-02:** Public `anon` role can access public PostgREST tables directly without Row-Level Security (`rls_enabled: false` across all tables).
- **SEC-03:** Route `/api/flagsmith/rollout` accepts unauthenticated `POST` requests and trusts arbitrary client-supplied authorizer strings.
- **SEC-04:** Audit-log immutability trigger (`trg_audit_log_immutable`) operates `FOR EACH ROW` and does not prevent `TRUNCATE TABLE audit_logs`.

### Critical Finding:
**The proposed remediation plan contains fatal defects and cannot be executed as written.** 
If executed in its current form:
1. **Total Application Outage from SEC-02 + SEC-01 interaction:** Enabling RLS on all 10 tables without defining explicit RLS policies for `pulsepilot_app` will trigger PostgreSQL's default-deny behavior. Because `pulsepilot_app` is not table owner and lacks `BYPASS RLS`, all Prisma runtime queries will return zero rows or fail immediately.
2. **Immediate Build Failure from SEC-03:** The proposed code patch in `SECURITY_REMEDIATION_PLAN.md` imports `getSessionUser` from `@/lib/auth/session`—a file that **does not exist** in the repository.
3. **Serverless Session Invalidation:** The existing authentication implementation in `src/lib/auth/auth-service.ts` stores sessions in an ephemeral in-memory `Map` (`SESSIONS_STORE`), which is not shared across Vercel serverless Lambda instances. Gating `/api/flagsmith/rollout` on this in-memory store will cause cold starts and multi-instance requests to fail with HTTP 401 Unauthorized during evaluation.

### Overall Status Recommendation:
**`NOT SAFE — REVISIONS REQUIRED`**

---

## 2. Exact Files and SQL Reviewed

### Repository Files Reviewed:
- `docs/DATABASE_LEAST_PRIVILEGE_PLAN.md` (Least privilege role design)
- `DATABASE_PRIVILEGE_MATRIX.md` (Object-level privilege specifications)
- `SECURITY_REMEDIATION_PLAN.md` (Proposed SQL and application remediation runbook)
- `src/app/api/flagsmith/rollout/route.ts` (Remote Flagsmith actuation handler)
- `src/lib/audit/audit-logger.ts` (Distributed advisory-locked audit trail logger)
- `src/lib/auth/auth-service.ts` (Authentication service and in-memory session store)
- `src/app/api/auth/me/route.ts` (Current session verification endpoint)
- `src/app/api/auth/login/route.ts` (Login handler setting `pulsepilot_session` cookie)
- `src/app/api/auth/register/route.ts` (User registration and Supabase Auth client invocation)
- `prisma/schema.prisma` (Database models and enum definitions)
- `prisma/migrations/20261116000000_init_production_schema/migration.sql` (Baseline migration)
- `tests/isolated-500-concurrency.test.ts` (Empirical concurrency and trigger tests)

### SQL Scripts Evaluated:
1. `SECURITY_REMEDIATION_PLAN.md` Lines 29–118:
   - Part 1: Enable RLS on 10 tables and REVOKE ALL from `anon, authenticated`.
   - Part 2: Statement-level trigger `trg_audit_log_prevent_truncate` on `audit_logs`.
   - Part 3: `CREATE ROLE pulsepilot_app`, table GRANTs, sequence USAGE, and schema permissions.
2. `docs/DATABASE_LEAST_PRIVILEGE_PLAN.md` Lines 60–93:
   - Initial privilege definitions for `pulsepilot_app`.

---

## 3. Deep-Dive Security & Architectural Reviews

### 3.1 SEC-01 Review — Runtime Role (`pulsepilot_app`) Decoupling
**Status:** `REQUIRES REVISION`

#### Strengths of Proposed Architecture:
- Separation of concerns between CI/CD migration owner (`postgres` / `pulsepilot_migration`) and runtime execution (`pulsepilot_app`) is standard enterprise security practice.
- Restricting `pulsepilot_app` to `SELECT, INSERT` on `audit_logs` and `telemetry_events` eliminates the capability of the runtime connection to tamper with historical ledgers.
- Denial of DDL (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`) prevents SQL injection attacks from disabling triggers (`ALTER TABLE ... DISABLE TRIGGER`).

#### Identified Flaws & Necessary Revisions:
1. **Dangerous Catalog Revocation:**
   In `SECURITY_REMEDIATION_PLAN.md` lines 116–117:
   ```sql
   REVOKE ALL ON SCHEMA pg_catalog FROM pulsepilot_app;
   GRANT USAGE ON SCHEMA pg_catalog TO pulsepilot_app;
   ```
   Revoking `ALL ON SCHEMA pg_catalog` from a login role can strip default execution rights on internal PostgreSQL type conversion, operator, and introspection functions that Prisma ORM requires during connection initialization. `pg_catalog` already restricts writes by default; revoking standard access is hazardous and unnecessary.
2. **Missing Enum Type Grants:**
   The database uses PostgreSQL custom ENUM types (`UserRole`, `ExperimentStatus`, `EventType`, `MetricType`, `AgentType`, `AuditAction`). In PostgreSQL, `pulsepilot_app` must hold `USAGE` privileges on these types if defined outside default public visibility, or explicit grants if schema rights are modified.
3. **Transaction Advisory Lock Compatibility:**
   `src/lib/audit/audit-logger.ts` uses `pg_advisory_xact_lock(bigint)`. In PostgreSQL, advisory lock functions are executable by `PUBLIC`. `pulsepilot_app` can execute this function inside Prisma `$transaction`. However, if connecting via Supabase Transaction Pooler (Supavisor on port 6543), transaction-scoped advisory locks (`xact_lock`) are released at transaction end (`COMMIT`), which is compatible with transaction pooling, whereas session-scoped locks (`pg_advisory_lock`) are broken by pooling. PulsePilot uses `pg_advisory_xact_lock`, so it is safe under transaction pooling.
4. **Prisma Migration Isolation:**
   `pulsepilot_app` is not granted access to `_prisma_migrations`. This is correct for runtime, but requires that CI/CD deployment pipelines maintain a distinct `DIRECT_URL` / `MIGRATION_DATABASE_URL` authenticated as `postgres` for running `prisma migrate deploy`.

---

### 3.2 SEC-02 Review — Row-Level Security (RLS) & PostgREST Shielding
**Status:** `REQUIRES REVISION`

#### Current Vulnerability Profile:
All 10 public schema tables currently have `rls_enabled: false`. As demonstrated in live testing, Supabase PostgREST exposes table data over HTTP to anyone holding the public `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

#### Fatal Defect in Proposed Remediation:
The proposed remediation in `SECURITY_REMEDIATION_PLAN.md` specifies:
```sql
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
-- [repeated for all 10 tables]
REVOKE ALL ON TABLE public.organizations ... FROM anon, authenticated;
```
**The Failure Mechanism:**
- In PostgreSQL, when Row-Level Security is enabled on a table, **default-deny is immediately enforced for all non-owner roles lacking `BYPASS RLS`**.
- Table owner is `postgres`. Role `pulsepilot_app` is **not** the table owner and has `rolbypassrls: false`.
- If no RLS policies are created for `pulsepilot_app`, **PostgreSQL blocks `pulsepilot_app` from selecting or inserting any rows whatsoever**.
- If this script is executed and `DATABASE_URL` is switched to `pulsepilot_app`, the entire application will immediately fail on every database read and write.

#### Required Fix for SEC-02:
To safely shield PostgREST while permitting `pulsepilot_app` full operational DML access:
Either:
1. Define explicit operational policies for `pulsepilot_app` across all tables:
   ```sql
   CREATE POLICY pulsepilot_app_policy ON public.organizations
     FOR ALL TO pulsepilot_app USING (true) WITH CHECK (true);
   -- [apply to all 10 tables]
   ```
2. Or grant `BYPASS RLS` attribute specifically to `pulsepilot_app`:
   ```sql
   ALTER ROLE pulsepilot_app BYPASSRLS;
   ```
   *Analysis:* Granting `BYPASSRLS` to `pulsepilot_app` keeps `pulsepilot_app` as a non-superuser with zero DDL/TRUNCATE rights, while allowing it to query all tables directly without policy overhead, while `anon` and `authenticated` remain strictly blocked by RLS and REVOKE. This is the cleanest, most performant approach for backend-only ORM connections in Supabase.

#### Table-by-Table RLS Assessment:

| # | Table Name | RLS Status | Anon/Auth Grant | Actual App Requirement | Proposed Action | Breakage Risk |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `_prisma_migrations` | Disabled | Revoke | None (Prisma deploy only) | Enable RLS, Revoke from anon/auth | None |
| 2 | `organizations` | Disabled | Revoke | Backend CRUD via Prisma | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |
| 3 | `users` | Disabled | Revoke | Backend CRUD via Prisma | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |
| 4 | `projects` | Disabled | Revoke | Backend CRUD via Prisma | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |
| 5 | `experiments` | Disabled | Revoke | Backend CRUD via Prisma | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |
| 6 | `experiment_variants`| Disabled | Revoke | Backend CRUD via Prisma | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |
| 7 | `metrics` | Disabled | Revoke | Backend CRUD via Prisma | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |
| 8 | `telemetry_events` | Disabled | Revoke | Ingestion & Aggregation | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |
| 9 | `agent_runs` | Disabled | Revoke | AI Logging & Insights | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |
| 10 | `audit_logs` | Disabled | Revoke | Append-only Ledger | Enable RLS, Revoke anon/auth, Policy/Bypass for `pulsepilot_app` | High if policy omitted |

---

### 3.3 SEC-03 Review — Rollout Route (`/api/flagsmith/rollout`) Authorization
**Status:** `BLOCKED BY MISSING AUTHENTICATION OR CONFIGURATION`

#### Current Vulnerability Profile:
`src/app/api/flagsmith/rollout/route.ts` contains zero authentication or authorization checks.
- Any unauthenticated HTTP client can issue a `POST` request with action `EMERGENCY_KILL_SWITCH`, `GRADUAL_STAGE`, or `ROLLOUT_WINNER`.
- The request body accepts an arbitrary `authorizer` string (defaulting to `"Sarah Lin (Product Lead)"`).
- The route executes remote Flagsmith mutations and records a cryptographically signed audit log attributing the actuation to the unverified string.

#### Fatal Defects in Proposed Remediation:
1. **Non-Existent Module Import:**
   `SECURITY_REMEDIATION_PLAN.md` line 129 instructs:
   ```typescript
   import { getSessionUser } from "@/lib/auth/session";
   ```
   There is no file `src/lib/auth/session.ts` in the codebase. Compiling this change will immediately break the Next.js build.
2. **Ephemeral In-Memory Sessions on Serverless Vercel:**
   The actual authentication logic is in `src/lib/auth/auth-service.ts`, which uses:
   ```typescript
   const SESSIONS_STORE: Map<string, { userId: string; expiresAt: number }> = new Map();
   ```
   On Vercel, every API request may execute in an independent, stateless serverless container. In-memory `Map` state is not shared across containers and does not survive cold starts.
   - If User A logs in on Container 1, their token is stored in Container 1's memory.
   - When User A clicks "Rollout Winner" in the UI, Vercel routes the `POST` request to Container 2.
   - Container 2 checks `SESSIONS_STORE.get(token)`, finds nothing, and returns HTTP 401 Unauthorized.
3. **Absence of CSRF Defense for Cookie-Based Post:**
   If relying strictly on a browser cookie (`pulsepilot_session`), a state-changing POST endpoint is vulnerable to Cross-Site Request Forgery (CSRF) unless custom headers (e.g. `X-Requested-With`, `Authorization: Bearer <token>`, or a CSRF token) are required.

#### Required Architecture for SEC-03:
Before `/api/flagsmith/rollout` can enforce authentication reliably in production:
1. **Stateless Signed Session Token (JWT) or DB-Backed Session:**
   Replace the in-memory `SESSIONS_STORE` with either a signed HMAC-SHA256 JWT stored in the HTTP-only cookie, or persist active sessions in a PostgreSQL table.
2. **Strict Authorizer Binding:**
   The `authorizer` parameter in `RolloutRequestSchema` must be ignored or removed. The recorded audit log actor must be derived strictly from `sessionUser.fullName` and `sessionUser.email`.
3. **Dual Token Extraction:**
   Support both `Authorization: Bearer <token>` (for programmatic / CI / test calls) and `pulsepilot_session` cookie (for browser UI calls).

---

### 3.4 SEC-04 Review — Audit Ledger `TRUNCATE` Protection
**Status:** `READY FOR STAGING TEST` (Minor SQL enhancement recommended)

#### Technical Mechanism Analysis:
- `audit_logs` has a row-level trigger:
  ```sql
  CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();
  ```
- In PostgreSQL, `TRUNCATE TABLE` bypasses all `FOR EACH ROW` triggers because it deallocates table pages without firing per-row handlers.
- The proposed fix installs a statement-level trigger:
  ```sql
  DROP TRIGGER IF EXISTS trg_audit_log_prevent_truncate ON public.audit_logs;
  CREATE TRIGGER trg_audit_log_prevent_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_audit_log_modification();
  ```
- When `TRUNCATE TABLE audit_logs` is executed, PostgreSQL invokes `prevent_audit_log_modification()`, which raises exception `P0001` and aborts the transaction.

#### Trigger Ownership & Bypass Boundary:
- Who can drop or disable this trigger? Only a role with table ownership or superuser privileges (`postgres`).
- Under the least-privilege runtime architecture (`pulsepilot_app`), the runtime role has no DDL permissions, cannot execute `DROP TRIGGER`, cannot execute `ALTER TABLE ... DISABLE TRIGGER`, and does not have `TRUNCATE` granted.
- **Verdict:** SEC-04's statement-level trigger is syntactically correct and provides robust defense-in-depth when combined with `pulsepilot_app` permission restrictions.

---

## 4. SQL Correctness Assessment

### Flaws in Proposed SQL Script:

| Line Range | SQL Statement in Remediation Plan | Defect Identified | Remediation Required |
| :--- | :--- | :--- | :--- |
| **Lines 34–43** | `ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;` | Blocks `pulsepilot_app` under default-deny because no policy is defined. | Add `ALTER ROLE pulsepilot_app BYPASSRLS;` OR define `CREATE POLICY ... TO pulsepilot_app`. |
| **Lines 111–113** | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulsepilot_app;` | Omits sequences and grants UPDATE/DELETE on future append-only tables. | Add default privileges for sequences; restrict tables as needed. |
| **Lines 115–116** | `REVOKE ALL ON SCHEMA pg_catalog FROM pulsepilot_app;` | Strips catalog access; risks breaking standard driver connection handshakes. | **Remove this statement completely.** |
| **Line 81** | `CREATE ROLE pulsepilot_app WITH LOGIN PASSWORD '...';` | Hardcoded placeholder in plain text. | Use parameterized DBA secret injection. |

### Revised, Production-Grade SQL Script:

```sql
-- =============================================================================
-- REVISED PRODUCTION SECURITY REMEDIATION SCRIPT (PULSEPILOT AI)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. SEC-04: Statement-Level Immutability Trigger (Prevent TRUNCATE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY ALERT: audit_logs is an append-only cryptographic ledger. UPDATE, DELETE, and TRUNCATE operations are strictly forbidden.'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_prevent_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_log_prevent_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_audit_log_modification();

-- -----------------------------------------------------------------------------
-- 2. SEC-01: Dedicated Application Runtime Role (pulsepilot_app)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN
        -- Password should be injected securely by DBA
        CREATE ROLE pulsepilot_app WITH LOGIN PASSWORD :'PULSEPILOT_APP_PASSWORD';
    END IF;
END $$;

-- Connection & Schema Usage
GRANT CONNECT ON DATABASE postgres TO pulsepilot_app;
GRANT USAGE ON SCHEMA public TO pulsepilot_app;
GRANT USAGE ON ALL TYPES IN SCHEMA public TO pulsepilot_app;

-- Business Tables: DML Allowed (NO DDL, NO TRUNCATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    public.organizations, 
    public.users, 
    public.projects, 
    public.experiments, 
    public.experiment_variants, 
    public.metrics, 
    public.agent_runs 
TO pulsepilot_app;

-- Append-Only Ledgers: SELECT & INSERT ONLY (NO UPDATE, NO DELETE, NO TRUNCATE)
GRANT SELECT, INSERT ON TABLE public.telemetry_events TO pulsepilot_app;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO pulsepilot_app;

-- Sequences for autoincrement & IDs
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulsepilot_app;

-- -----------------------------------------------------------------------------
-- 3. SEC-02: Enable RLS & Shield PostgREST from Public Roles
-- -----------------------------------------------------------------------------
-- Enable RLS across all application tables
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

-- Revoke all direct PostgREST access from public anonymous & authenticated roles
REVOKE ALL ON TABLE 
    public.organizations,
    public.users,
    public.projects,
    public.experiments,
    public.experiment_variants,
    public.metrics,
    public.telemetry_events,
    public.agent_runs,
    public.audit_logs,
    public._prisma_migrations
FROM anon, authenticated;

-- Allow pulsepilot_app to operate cleanly without being blocked by RML default-deny
ALTER ROLE pulsepilot_app BYPASSRLS;

-- Future tables created by postgres inherit grants
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulsepilot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
GRANT USAGE, SELECT ON SEQUENCES TO pulsepilot_app;

COMMIT;
```

---

## 5. Application Compatibility Assessment

| Component / Subsystem | Impact of Proposed Remediation | Risk Level | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Prisma ORM Runtime** | If `pulsepilot_app` has `BYPASSRLS` and table grants, normal queries function identically. | Low | Verify connection string syntax and pooling mode in staging. |
| **Prisma Migrations (`prisma migrate`)** | Must **not** use `pulsepilot_app` (lacks DDL). Must continue using `postgres` via `DIRECT_URL`. | Low | Explicitly document role separation in CI/CD pipeline docs. |
| **Audit Ledger (`audit-logger.ts`)** | `pg_advisory_xact_lock` and `INSERT INTO audit_logs` are fully permitted for `pulsepilot_app`. | Zero | Verified; advisory locks are executable by `PUBLIC`. |
| **Telemetry Ingestion (`/api/telemetry/track`)** | `INSERT INTO telemetry_events` is permitted; `UPDATE/DELETE` denied. | Zero | Telemetry ingestion uses insert-only deduplication. |
| **Flagsmith Rollout Route (`/api/flagsmith/rollout`)** | Proposed code patch breaks build (`@/lib/auth/session` missing). | **Critical** | Must rewrite auth verification using stateless signed session token or existing `auth-service.ts`. |
| **Release Center UI (`/release-center`)** | Rollout buttons will fail with HTTP 401 if user is not logged in as Admin. | Medium | Add clear UI login indicator and redirect unauthenticated users to `/login`. |
| **Supabase PostgREST Endpoints** | Will return HTTP 403 Forbidden on all tables to anon key. | Intended | PulsePilot does not use PostgREST; all traffic routes through Next.js server. |

---

## 6. Staging Test Plan

Before executing any changes against production Supabase or Vercel:

### Phase 1: Isolated / Staging Database SQL Execution
1. Connect to isolated staging PostgreSQL instance as `postgres`.
2. Execute the revised SQL script above.
3. Verify role creation:
   ```sql
   SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls 
   FROM pg_roles WHERE rolname = 'pulsepilot_app';
   ```
4. Verify RLS enabled on all 10 tables:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   -- Expect rowsecurity = true on all tables
   ```
5. Verify `anon` and `authenticated` have zero permissions:
   ```sql
   SELECT grantee, table_name, privilege_type 
   FROM information_schema.role_table_grants 
   WHERE grantee IN ('anon', 'authenticated') AND table_schema = 'public';
   -- Expect 0 rows
   ```

### Phase 2: Role Permission & Immutability Verification
Connect as `pulsepilot_app` and execute:
1. `INSERT INTO audit_logs ...` $\to$ **PASS (200 OK)**.
2. `UPDATE audit_logs SET details = 'hacked' WHERE ...` $\to$ **FAIL (Permission Denied)**.
3. `DELETE FROM audit_logs WHERE ...` $\to$ **FAIL (Permission Denied)**.
4. `TRUNCATE TABLE audit_logs;` $\to$ **FAIL (Permission Denied + Trigger Block)**.
5. `ALTER TABLE audit_logs DISABLE TRIGGER ALL;` $\to$ **FAIL (Must be owner of table)**.
6. `SELECT COUNT(*) FROM organizations;` $\to$ **PASS (Returns actual count)**.

### Phase 3: PostgREST External Probing
Using curl against the Supabase staging URL:
```bash
curl -i "https://<supabase-staging-project>.supabase.co/rest/v1/organizations" \
  -H "apikey: <supabase-anon-key>"
# Expected: HTTP 403 Forbidden or HTTP 401 Unauthorized
```

### Phase 4: Application Integration & Concurrency Test
Run full application test suite against staging database with `DATABASE_URL` pointing to `pulsepilot_app`:
```bash
npm run test
npm run test:flagsmith
npm run test:audit
```

---

## 7. Rollback Plan

If unexpected failures occur during staging or production application of this remediation:

### Database Rollback (Under 60 seconds):
1. **Revert Vercel `DATABASE_URL`:**
   Switch `DATABASE_URL` back to the `postgres` user connection string in Vercel project environment variables and redeploy/restart.
2. **Revert Table RLS and Grants (Emergency SQL):**
   ```sql
   BEGIN;
   -- Disable RLS if application access is blocked
   ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.experiments DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.experiment_variants DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.metrics DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.telemetry_events DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.agent_runs DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public._prisma_migrations DISABLE ROW LEVEL SECURITY;
   COMMIT;
   ```
3. **Revert Code Changes:**
   Revert any commit modifying `src/app/api/flagsmith/rollout/route.ts` via Git.

---

## 8. Unresolved Questions & Architectural Decisions

1. **Authentication Session Persistence Architecture:**
   - Will PulsePilot implement a persistent `sessions` table in Prisma, or transition to stateless signed JWTs (`jose` / `jsonwebtoken`) stored in the `pulsepilot_session` HTTP-only cookie?
   - *Recommendation:* Stateless signed HMAC-SHA256 JWT cookie is the cleanest, zero-database-overhead solution for serverless Next.js on Vercel.
2. **Demo & Evaluation Access for Hackathon Judges:**
   - If `/api/flagsmith/rollout` strictly enforces `ADMIN` role, judges exploring the live site without first logging in at `/login` will receive HTTP 401 errors when testing the Release Center.
   - *Recommendation:* Ensure the UI displays an intuitive *"Demo Login Active: Sarah Lin (Admin)"* banner with a 1-click authentication switcher, ensuring judges are authenticated prior to executing rollouts.
3. **Supabase Connection Pooler (`DIRECT_URL` vs `DATABASE_URL`):**
   - Does Supabase require pooler password configuration when creating roles via SQL?
   - *Recommendation:* Direct connection (port 5432) uses database user credentials directly. If using the Supavisor pooler (port 6543), ensure the role password is synchronized.

---

## 9. Blocker-by-Blocker Status Summary

| Blocker ID | Description | Assigned Status | Justification |
| :--- | :--- | :--- | :--- |
| **SEC-01** | Unrestricted `postgres` runtime connection | **`REQUIRES REVISION`** | Proposed SQL contains dangerous catalog revocation and misses sequence default privileges. Must be revised and tested on staging. |
| **SEC-02** | Unprotected PostgREST API with public `anon` access | **`REQUIRES REVISION`** | Proposed SQL enables RLS without policies for `pulsepilot_app`, which will lock out the application under PostgreSQL default-deny. |
| **SEC-03** | Unauthenticated `/api/flagsmith/rollout` endpoint | **`BLOCKED BY MISSING AUTHENTICATION OR CONFIGURATION`** | Proposed code imports non-existent `@/lib/auth/session`. Repo lacks distributed session persistence across serverless instances. |
| **SEC-04** | Immutability trigger bypass via `TRUNCATE` | **`READY FOR STAGING TEST`** | Statement-level trigger `trg_audit_log_prevent_truncate` correctly blocks `TRUNCATE TABLE audit_logs`. Ready for staging deployment. |

---

## 10. Final Execution Recommendation

### Recommendation:
# `NOT SAFE — REVISIONS REQUIRED`

### Explicit Pre-Execution Conditions:
1. **Do NOT run the SQL script from `SECURITY_REMEDIATION_PLAN.md` against production.** It will cause an application outage due to RLS default-deny and catalog revocation.
2. **Do NOT apply the proposed code snippet to `/api/flagsmith/rollout`.** It will break the Next.js build.
3. Adopt the revised SQL script provided in Section 4 of this report.
4. Implement stateless signed JWT session verification for SEC-03.
5. Validate all four remediations end-to-end in an isolated staging environment before scheduling production deployment.

