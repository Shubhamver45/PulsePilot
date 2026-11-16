# PULSEPILOT AI — STAGING DEPLOYMENT ISOLATION CHECKLIST

**Document Reference:** `STAGING-DEPLOY-CHECKLIST-V2`  
**Security Architect:** Principal Application Security Architect & DevOps Engineer  
**Classification:** Staging Deployment Verification & Production Protection  
**Status:** **ACTIVE CHECKLIST**  
**Date:** November 16, 2026  

---

## 1. Deployment Topology & Isolation Boundaries

```
[GIT REPOSITORY: Shubhamver45/PulsePilot]
   │
   ├── main branch ────────────► VERCEL PRODUCTION DEPLOYMENT
   │                             (https://pulse-pilot-two.vercel.app/)
   │                             ├── DATABASE_URL -> czqhiuidekvozuoqdmyd (Prod)
   │                             └── Flagsmith Environment -> Production
   │
   └── staging branch ─────────► VERCEL PREVIEW / STAGING DEPLOYMENT
                                 (https://pulse-pilot-two-git-staging-shubhamver45s-projects.vercel.app/)
                                 ├── DATABASE_URL -> <STAGING_PROJECT_REF> (Staging)
                                 └── Flagsmith Environment -> Staging
```

---

## 2. Vercel Environment Variable Scoping Checklist

In the [Vercel Dashboard](https://vercel.com/) $\to$ **Project Settings** $\to$ **Environment Variables**, ensure environment variables are scoped strictly by environment:

| Variable Name | Production Scope Value | Preview / Staging Scope Value | Security Verification |
| :--- | :--- | :--- | :--- |
| **`STAGING_PROJECT_REF`** | *(Not defined in prod)* | `<STAGING_PROJECT_REF>` | Identifies isolated staging project. |
| **`DATABASE_URL`** | `...db.czqhiuidekvozuoqdmyd...` | `...db.<STAGING_PROJECT_REF>...` | Staging runtime connects to staging DB only. |
| **`DIRECT_URL`** | `...db.czqhiuidekvozuoqdmyd...` | `...db.<STAGING_PROJECT_REF>...` | Staging migrations connect to staging DB only. |
| **`NEXT_PUBLIC_SUPABASE_URL`** | `https://czqhiuidekvozuoqdmyd.supabase.co` | `https://<STAGING_PROJECT_REF>.supabase.co` | Client calls isolated Supabase project. |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | Production Anon Key | Staging Anon Key | Isolated JWT validation. |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Production Service Key | Staging Service Key | Zero cross-project administrative access. |
| **`SESSION_SECRET`** | Production Secret (32+ chars) | Distinct Staging Secret (32+ chars) | Session tokens from staging cannot decode in production. |
| **`NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY`**| Production Client Key | Staging Client Key | Feature flags isolated between environments. |
| **`FLAGSMITH_SERVER_SIDE_API_KEY`** | Production Server Key | Staging Server Key | Staging rollout API mutations cannot touch production flags. |

---

## 3. Verification Phases (Clearly Delineated)

### Phase 1: Static Code Review & SQL Invariants
- `npm run test:sql-hardening`
- Status: **PASS (10/10 Invariants Verified)**

### Phase 2: Automated Unit & Process Safety Tests
- `npm run test:staging-safety`
- Status: **PASS (21/21 Unit Tests Verified)**

### Phase 3: Read-Only Staging Preflight Inspection
- `npm run staging:preflight`
- Status: **GATED (Pending operator provisioning of dedicated staging database)**
- Preflight success verifies connection and session state only; does NOT indicate acceptance tests have passed.

### Phase 4: Authoritative Schema Migration
- `npm run prisma:migrate:staging`
- Status: **GATED (Pending operator provisioning)**

### Phase 5: Live PostgreSQL Acceptance Tests
- `npm run staging:acceptance`
- Status: **GATED (Pending operator provisioning)**
- Executes all 13 live behavioral tests over the exact validated connection in a self-reverting transaction.

### Phase 6: Remote Staging End-to-End Probes
Execute against deployed Vercel preview URL once provisioned:
- Probe 1: PostgREST Public API exposure blocked (`401`/`403`).
- Probe 2: Unauthenticated rollout rejected (`401`).
- Probe 3: Non-admin rollout rejected (`403`).
- Probe 4: Session revocation cross-instance rejection (`401`).
- Probe 5: Production state immutability confirmed.

---

## 4. Staging Promotion Gates

| Gate ID | Condition | Status | Action Required |
| :--- | :--- | :---: | :--- |
| **GATE-01** | Dedicated Supabase staging project created | ⏳ PENDING | Operator creates project in Supabase dashboard. |
| **GATE-02** | Staging preflight read-only inspection succeeds | ⏳ PENDING | Run `npm run staging:preflight`. |
| **GATE-03** | Staging database initialized via Prisma migrations | ⏳ PENDING | Run `npm run prisma:migrate:staging`. |
| **GATE-04** | Live SEC-03.1 acceptance tests pass (13/13) | ⏳ PENDING | Run `npm run staging:acceptance`. |
| **GATE-05** | Vercel preview deployment scoped to staging env | ⏳ PENDING | Configure Vercel preview environment variables. |
| **GATE-06** | Production database and flags verified untouched | ✅ PASS | Continuous verification: zero production mutations. |
