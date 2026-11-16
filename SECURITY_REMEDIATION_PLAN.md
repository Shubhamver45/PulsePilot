# PULSEpilot AI — Security Remediation Plan
## Technical Remediation Roadmap & Execution Runbook

**Document Version:** 1.0.0 (Production Security Audit)  
**Security Status:** Action Plan for Production Readiness  
**Target Architecture:** Supabase Managed PostgreSQL + Next.js Serverless on Vercel  

---

## 1. Remediation Priority Summary

| Priority | Finding ID | Vulnerability / Hardening Target | Complexity | Production Impact | Approval Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0 (Critical)** | **SEC-02** | Enable Row-Level Security (RLS) on all public tables & shield Supabase PostgREST | Low | Prevents direct data extraction via public `anon` key | Yes (DBA Execution) |
| **P1 (High)** | **SEC-01** | Provision restricted `pulsepilot_app` runtime role; decouple from `postgres` owner | Medium | Isolates runtime queries to least-privilege DML | Yes (DBA Execution) |
| **P1 (High)** | **SEC-03** | Enforce session authentication & RBAC on `/api/flagsmith/rollout` route | Low | Prevents unauthenticated remote flag actuation | Yes (Code PR) |
| **P1 (High)** | **SEC-04** | Install statement-level trigger blocking `TRUNCATE` on `audit_logs` | Low | Eliminates ledger wipe vulnerability | Yes (DBA Execution) |
| **P2 (Medium)** | **SEC-05** | Enforce rate limiting on telemetry ingestion endpoint (`/api/telemetry/track`) | Low | Prevents storage exhaustion attacks | Yes (Code PR) |
| **P3 (Low)** | **SEC-06** | Sanitize documentation code spans in UI to prevent secret scanner false alerts | Low | Improves static analysis hygiene | Yes (Code PR) |

---

## 2. Proposed SQL Changes (Runbook for Supabase SQL Editor)

> [!IMPORTANT]
> The following SQL script must be reviewed by the Database Administrator and executed in the Supabase SQL Editor against the production database. Do not run destructive modifications.

```sql
-- =============================================================================
-- PART 1: REMEDIATE SEC-02 (ENABLE RLS & SHIELD POSTGREST FROM ANON ROLE)
-- =============================================================================

-- 1. Enable RLS on all application tables in public schema
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

-- 2. Revoke direct access from public PostgREST roles (anon and authenticated)
-- Because PulsePilot routes all requests through Next.js server route handlers,
-- direct PostgREST HTTP queries should be completely closed to public visitors.
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

-- =============================================================================
-- PART 2: REMEDIATE SEC-04 (BLOCK TRUNCATE ON AUDIT LEDGER)
-- =============================================================================

-- Install statement-level trigger preventing TRUNCATE TABLE audit_logs
DROP TRIGGER IF EXISTS trg_audit_log_prevent_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_log_prevent_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_audit_log_modification();

-- =============================================================================
-- PART 3: REMEDIATE SEC-01 (PROVISION RESTRICTED RUNTIME ROLE pulsepilot_app)
-- =============================================================================

-- 1. Create the dedicated restricted application login role
-- REPLACE 'SET_STRONG_PRODUCTION_PASSWORD_HERE' with a secure random secret (32+ chars)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN
        CREATE ROLE pulsepilot_app WITH LOGIN PASSWORD 'SET_STRONG_PRODUCTION_PASSWORD_HERE';
    END IF;
END $$;

-- 2. Grant connection and schema usage
GRANT CONNECT ON DATABASE postgres TO pulsepilot_app;
GRANT USAGE ON SCHEMA public TO pulsepilot_app;

-- 3. Grant business table DML privileges (NO DDL, NO TRUNCATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    public.organizations, 
    public.users, 
    public.projects, 
    public.experiments, 
    public.experiment_variants, 
    public.metrics, 
    public.agent_runs 
TO pulsepilot_app;

-- 4. Grant APPEND-ONLY privileges on telemetry_events (No UPDATE or DELETE)
GRANT SELECT, INSERT ON TABLE public.telemetry_events TO pulsepilot_app;

-- 5. Grant APPEND-ONLY privileges on audit_logs (Strictly SELECT and INSERT)
-- Explicitly DENY UPDATE, DELETE, TRUNCATE, TRIGGER, ALTER
GRANT SELECT, INSERT ON TABLE public.audit_logs TO pulsepilot_app;

-- 6. Grant sequence usage for any auto-increment sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulsepilot_app;

-- 7. Configure future tables created by postgres/migration to inherit these grants
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulsepilot_app;

-- Revoke internal schema access
REVOKE ALL ON SCHEMA information_schema FROM pulsepilot_app;
REVOKE ALL ON SCHEMA pg_catalog FROM pulsepilot_app;
GRANT USAGE ON SCHEMA pg_catalog TO pulsepilot_app;
```

---

## 3. Proposed Application & Route Changes

### Remediate SEC-03: Enforce Session Verification on `/api/flagsmith/rollout`

In `src/app/api/flagsmith/rollout/route.ts`:
```typescript
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";

export async function POST(request: Request) {
  // 1. Enforce authenticated session
  const cookieStore = cookies();
  const sessionToken = cookieStore.get("pulsepilot_session")?.value;
  const user = await getSessionUser(sessionToken);

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json(
      {
        success: false,
        error: "UNAUTHORIZED_RELEASE_ACTION",
        message: "Production flag mutations require an authenticated Administrator session.",
      },
      { status: 401 }
    );
  }

  // Use authenticated user's name as authorizer (never accept arbitrary payload authorizer)
  const authorizerName = `${user.fullName || user.email} (${user.role})`;
  ...
}
```

---

## 4. Required Vercel Configuration Changes

1. **Production `DATABASE_URL`:**
   Update the connection string to authenticate as `pulsepilot_app`:
   ```
   DATABASE_URL="postgresql://pulsepilot_app:SET_STRONG_PRODUCTION_PASSWORD_HERE@db.czqhiuidekvozuoqdmyd.supabase.co:5432/postgres"
   ```
2. **Dedicated Migration Connection `DIRECT_URL` / `MIGRATION_DATABASE_URL`:**
   Maintain the table-owner connection (`postgres`) strictly for CI/CD migration scripts (`prisma migrate deploy`).

---

## 5. Verification & Testing Steps

1. **Verify PostgREST Closure:**
   ```bash
   curl -i "https://czqhiuidekvozuoqdmyd.supabase.co/rest/v1/organizations" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
   # Expected Output: HTTP 401 Unauthorized or HTTP 403 Forbidden
   ```
2. **Verify `pulsepilot_app` DML & Immutability:**
   Connect using `pulsepilot_app` connection string and run:
   - `INSERT INTO audit_logs ...` $\to$ **Succeeds (200 OK)**.
   - `UPDATE audit_logs SET details = ...` $\to$ **Blocked by PostgreSQL permissions (`permission denied for table audit_logs`)**.
   - `TRUNCATE TABLE audit_logs` $\to$ **Blocked by trigger `trg_audit_log_prevent_truncate` and permission denied**.
   - `ALTER TABLE audit_logs DISABLE TRIGGER ...` $\to$ **Blocked (`must be owner of table audit_logs`)**.
3. **Verify Rollout Route Session Protection:**
   ```bash
   curl -X POST "https://pulse-pilot-two.vercel.app/api/flagsmith/rollout" \
     -H "Content-Type: application/json" \
     -d '{"flagsmithFeatureName": "exp_checkout_layout_v2", "action": "EMERGENCY_KILL_SWITCH"}'
   # Expected Output: HTTP 401 Unauthorized
   ```

---

## 6. Rollback Considerations

If `pulsepilot_app` permissions cause any unexpected query errors during deployment:
1. Reverting Vercel `DATABASE_URL` to the `postgres` user connection string takes under 30 seconds via the Vercel dashboard.
2. Dropping or disabling the `pulsepilot_app` role does not affect existing tables or data.
3. RLS policies can be temporarily disabled on individual tables with `ALTER TABLE <tablename> DISABLE ROW LEVEL SECURITY;` if needed.

