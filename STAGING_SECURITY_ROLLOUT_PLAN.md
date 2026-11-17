# PULSEpilot AI — Staging Security Rollout & Verification Plan
## Step-by-Step Implementation Sequence, Test Verification, and Rollback Runbook

**Document Version:** 2.0.0 (Remediation Architecture V2)  
**Security Status:** Execution Runbook for Isolated & Staging Environments  
**Target Environments:** Supabase Staging Database & Vercel Staging Deployment  
**Strict Safety Rule:** Zero modifications or SQL executions may be run against the production database or production Vercel environment.

---

## 1. Rollout Sequence Overview

```
 [STAGE 1] Authentication Foundation (HMAC-SHA256 Stateless Tokens)
     │
     ▼
 [STAGE 2] Rollout Endpoint Authorization (/api/flagsmith/rollout)
     │
     ▼
 [STAGE 3] Database Role Provisioning (pulsepilot_app on Staging DB)
     │
     ▼
 [STAGE 4] RLS Policy & PostgREST Shield Deployment (Staging DB)
     │
     ▼
 [STAGE 5] Runtime Connection Migration (Staging DATABASE_URL)
     │
     ▼
 [STAGE 6] Audit Ledger TRUNCATE Protection (Statement Trigger)
     │
     ▼
 [STAGE 7] Complete Application Regression Tests (npm test suites)
     │
     ▼
 [STAGE 8] Staging Security Verification (PostgREST & Immutability Probing)
     │
     ▼
 [STAGE 9] Production Change Authorization Gate (HITL Sign-Off)
```

---

## 2. Detailed Stage-by-Stage Implementation

### STAGE 1: Authentication Foundation (HMAC-SHA256 Stateless Tokens)

#### 1. Preconditions:
- Local/staging environment running Node.js 18+.
- Environment variable `SESSION_SECRET` configured in staging Vercel environment (min 32 random alphanumeric characters). If unset, defaults to internal development secret.

#### 2. Code Proposal:
In `src/lib/auth/auth-service.ts`:
- Import `crypto` from `"crypto"`.
- Implement `createSignedToken(user: AuthUser, expiresInMs?: number): string`.
- Implement `verifySignedToken(token: string): AuthUser | null` using `crypto.timingSafeEqual`.
- In `loginUser` and `registerUser`, issue the signed token as `result.token`.
- In `getUserFromToken`, check for signed token prefix (`pps_`) and verify signature statelessly before falling back to in-memory map.

#### 3. Expected Behavior:
- Tokens issued at login survive serverless container recycling.
- Any serverless container with `SESSION_SECRET` can verify user identity and role in under 1 millisecond without database or network queries.

#### 4. Verification Tests:
```bash
node --experimental-strip-types -e '
import { loginUser, getUserFromToken } from "./src/lib/auth/auth-service.ts";
async function test() {
  const login = await loginUser({ email: "sarah@pulsepilot.ai", password: "pulsepilot2026" });
  console.assert(login.success && login.token.startsWith("pps_"), "Token format pps_");
  const user = await getUserFromToken(login.token);
  console.assert(user && user.role === "ADMIN", "Verified role ADMIN");
  console.log("✅ STAGE 1 PASS: Stateless token created and verified.");
}
test();'
```

#### 5. Rollback Procedure:
Revert changes to `src/lib/auth/auth-service.ts` via Git.

#### 6. Failure Conditions:
Signature verification failure, expired token rejection errors, or malformed Base64 decoding exceptions.

---

### STAGE 2: Rollout Endpoint Authorization (`/api/flagsmith/rollout`)

#### 1. Preconditions:
- Stage 1 completed and verified.
- `src/lib/flagsmith/flagsmith-admin.ts` functional.

#### 2. Code Proposal:
In `src/app/api/flagsmith/rollout/route.ts`:
- Remove `authorizer` from `RolloutRequestSchema`.
- Extract token from `Authorization: Bearer <token>` header or `pulsepilot_session` cookie.
- Call `await getUserFromToken(token)`.
- If missing token: return HTTP 401 (`UNAUTHORIZED`).
- If invalid token: return HTTP 401 (`INVALID_SESSION`).
- If `user.role !== "ADMIN"`: return HTTP 403 (`FORBIDDEN`).
- Derive authorizer strictly as `${user.fullName} (${user.role} - ${user.email})`.
- In `scripts/production-smoke-test.ts`, update step 13 to log in as Sarah Lin before calling rollout.

#### 3. Expected Behavior:
- Unauthenticated POST requests are rejected with HTTP 401.
- Non-admin users are rejected with HTTP 403.
- Authenticated admin requests succeed and attribute the audit record to the genuine user.

#### 4. Verification Tests:
```bash
# 1. Test unauthenticated POST -> Expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/flagsmith/rollout" \
  -H "Content-Type: application/json" \
  -d '{"flagsmithFeatureName": "exp_checkout_social_proof", "action": "EMERGENCY_KILL_SWITCH", "rationale": "test"}'
# Expected Output: 401

# 2. Test authenticated admin POST -> Expect 200
```

#### 5. Rollback Procedure:
Revert `src/app/api/flagsmith/rollout/route.ts` via Git.

#### 6. Failure Conditions:
Authenticated admin received 401 or 403, or smoke test step 13 failed to authenticate.

---

### STAGE 3: Database Role Provisioning on Staging Database

#### 1. Preconditions:
- Access to isolated staging PostgreSQL database as `postgres`.
- Database Administrator approval.
- Zero traffic on staging during role creation.

#### 2. SQL Proposal:
Execute `DATABASE_ROLE_PROVISIONING_V2.md` SQL in Supabase SQL Editor on staging:
```sql
BEGIN;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN
        CREATE ROLE pulsepilot_app WITH 
            LOGIN 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            NOBYPASSRLS 
            PASSWORD 'STAGING_SECURE_PASSWORD_32_CHARS';
    END IF;
END $$;

GRANT CONNECT ON DATABASE postgres TO pulsepilot_app;
GRANT USAGE ON SCHEMA public TO pulsepilot_app;
REVOKE CREATE ON SCHEMA public FROM pulsepilot_app;
GRANT USAGE ON ALL TYPES IN SCHEMA public TO pulsepilot_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    public.experiments, public.experiment_variants, public.metrics 
TO pulsepilot_app;

GRANT SELECT, INSERT, UPDATE ON TABLE 
    public.organizations, public.users, public.projects, public.agent_runs 
TO pulsepilot_app;

GRANT SELECT, INSERT ON TABLE public.telemetry_events TO pulsepilot_app;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO pulsepilot_app;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.telemetry_events FROM pulsepilot_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM pulsepilot_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulsepilot_app;
COMMIT;
```

#### 3. Expected Behavior:
- `pulsepilot_app` is provisioned with zero administrative attributes.
- Has minimum required DML grants on application tables.

#### 4. Verification Tests:
```sql
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls 
FROM pg_roles WHERE rolname = 'pulsepilot_app';
-- Expect: rolsuper=false, rolcreaterole=false, rolcreatedb=false, rolbypassrls=false
```

#### 5. Rollback Procedure:
```sql
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM pulsepilot_app;
REVOKE USAGE ON SCHEMA public FROM pulsepilot_app;
DROP ROLE IF EXISTS pulsepilot_app;
```

#### 6. Failure Conditions:
Role creation syntax error, lock contention on database schema.

---

### STAGE 4: RLS Policy Deployment on Staging Database

#### 1. Preconditions:
- Stage 3 completed (`pulsepilot_app` exists).
- Connected to staging database as `postgres`.

#### 2. SQL Proposal:
Execute `RLS_POLICY_MATRIX.md` SQL:
- Enable RLS and `FORCE ROW LEVEL SECURITY` on all 10 tables.
- `REVOKE ALL ON TABLE <all_tables> FROM anon, authenticated;`
- Create explicit policies for `pulsepilot_app` (`org_app_policy`, `usr_app_policy`, `aud_app_insert`, `aud_app_select`, etc.).

#### 3. Expected Behavior:
- All 10 tables show `rowsecurity = true`.
- PostgREST requests with anonymous key receive HTTP 403 Forbidden.
- `pulsepilot_app` queries succeed through explicit policies.

#### 4. Verification Tests:
```sql
-- Check RLS status across all public tables
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check PostgREST from shell
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<staging-ref>.supabase.co/rest/v1/organizations" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# Expect: 403
```

#### 5. Rollback Procedure:
```sql
BEGIN;
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

#### 6. Failure Conditions:
Prisma queries fail with permission denied or return empty result sets.

---

### STAGE 5: Runtime Connection Migration in Staging

#### 1. Preconditions:
- Stages 3 & 4 verified.
- Staging Vercel deployment credentials ready.

#### 2. Configuration Proposal:
In Staging Vercel project environment variables:
- Set `DATABASE_URL` to:
  `postgresql://pulsepilot_app:STAGING_SECURE_PASSWORD_32_CHARS@db.<staging-ref>.supabase.co:5432/postgres`
- Set `DIRECT_URL` / `MIGRATION_DATABASE_URL` to maintain the `postgres` user connection strictly for deployment migrations (`prisma migrate deploy`).

#### 3. Expected Behavior:
- Next.js serverless functions connect as `pulsepilot_app`.
- Queries execute without superuser rights.

#### 4. Verification Tests:
Trigger staging health check or query:
```typescript
const currentUser = await prisma.$queryRaw`SELECT current_user;`;
// Expect: [{ current_user: 'pulsepilot_app' }]
```

#### 5. Rollback Procedure:
Switch Vercel `DATABASE_URL` back to the `postgres` connection string and redeploy (under 60 seconds).

#### 6. Failure Conditions:
Prisma connection refused, password authentication failure, or query timeout.

---

### STAGE 6: Audit Ledger `TRUNCATE` Statement-Level Protection

#### 1. Preconditions:
- Connected to staging database as `postgres`.
- `public.audit_logs` table active.

#### 2. SQL Proposal:
```sql
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
```

#### 3. Expected Behavior:
- Attempting `TRUNCATE TABLE audit_logs;` as `postgres` or any user raises exception `P0001` and aborts.

#### 4. Verification Tests:
In an isolated staging transaction:
```sql
BEGIN;
TRUNCATE TABLE audit_logs;
-- Expect: ERROR: SECURITY ALERT: audit_logs is an append-only cryptographic ledger...
ROLLBACK;
```

#### 5. Rollback Procedure:
```sql
DROP TRIGGER IF EXISTS trg_audit_log_prevent_truncate ON public.audit_logs;
```

#### 6. Failure Conditions:
Trigger creation syntax error or function compilation failure.

---

### STAGE 7: Complete Application Regression Testing

#### 1. Preconditions:
- Stages 1 through 6 deployed in staging environment.

#### 2. Action:
Execute full automated test suite against the staging database:
```bash
npm run test
npm run test:flagsmith
npm run test:audit
npm run test:live-flagsmith
npm run test:prod-smoke
```

#### 3. Expected Behavior:
- All unit, integration, statistical, audit chain, and telemetry tests pass with zero errors.

#### 4. Verification Tests:
- 100% pass rate across test suites.
- Distributed concurrency advisory lock tests pass with continuous sequence numbering.

#### 5. Rollback Procedure:
Diagnose failing test, apply targeted fix, re-run test suite.

#### 6. Failure Conditions:
Any test failure or assertion error.

---

### STAGE 8: Staging Security Verification & Penetration Audit

#### 1. Preconditions:
- Staging environment online and operational.

#### 2. Action:
Execute the 4 verification probes:
1. **Probe PostgREST:** Ensure `/rest/v1/organizations` returns 403 Forbidden.
2. **Probe Rollout Route:** Ensure unauthenticated POST to `/api/flagsmith/rollout` returns 401 Unauthorized.
3. **Probe Immutability:** Attempt `UPDATE` and `DELETE` on `audit_logs` $\to$ verify blocked by trigger and RLS.
4. **Probe Role Attributes:** Verify `current_user` is `pulsepilot_app` and `rolsuper = false`.

#### 3. Expected Behavior:
All 4 probes confirm active security controls without application regression.

#### 4. Verification Tests:
Documented evidence recorded in staging test log.

---

### STAGE 9: Production Change Authorization Gate (HITL Sign-Off)

#### 1. Preconditions:
- Stages 1–8 completed with 100% success on staging.
- Security review document reviewed by engineering lead.
- Explicit human approval received to schedule production maintenance window.

#### 2. Production Execution Scope:
- Execute SQL migration during scheduled low-traffic window.
- Update production Vercel environment variables (`DATABASE_URL`, `SESSION_SECRET`).
- Promote verified staging Git commit to `main`.
- Run production smoke test (`npm run test:prod-smoke`).

---

## 3. Comprehensive Rollback Matrix

| Failure Event | Stage Affected | Rollback Action | Estimated Recovery Time |
| :--- | :---: | :--- | :--- |
| **Prisma query permissions error** | Stage 5 | Revert Vercel `DATABASE_URL` to `postgres` user string | < 60 seconds |
| **RLS default-deny blocks legitimate data** | Stage 4 | Execute `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` | < 30 seconds |
| **Rollout authentication rejection in UI** | Stage 2 | Revert route handler commit via Git | < 2 minutes |
| **Trigger prevents legitimate migration** | Stage 6 | Run `DROP TRIGGER trg_audit_log_prevent_truncate` | < 15 seconds |
| **Session cookie invalidation** | Stage 1 | Revert `auth-service.ts` commit | < 2 minutes |

