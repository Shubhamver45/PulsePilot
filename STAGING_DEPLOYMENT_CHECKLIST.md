# PULSEPILOT AI — STAGING DEPLOYMENT ISOLATION CHECKLIST

**Document Reference:** `STAGING-DEPLOY-CHECKLIST-V1`  
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
| **`DATABASE_URL`** | `...db.czqhiuidekvozuoqdmyd...` | `...db.<STAGING_PROJECT_REF>...` | Staging runtime connects to staging DB only. |
| **`DIRECT_URL`** | `...db.czqhiuidekvozuoqdmyd...` | `...db.<STAGING_PROJECT_REF>...` | Staging migrations connect to staging DB only. |
| **`NEXT_PUBLIC_SUPABASE_URL`** | `https://czqhiuidekvozuoqdmyd.supabase.co` | `https://<STAGING_PROJECT_REF>.supabase.co` | Client calls isolated Supabase project. |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | Production Anon Key | Staging Anon Key | Isolated JWT validation. |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Production Service Key | Staging Service Key | Zero cross-project administrative access. |
| **`SESSION_SECRET`** | Production Secret (32+ chars) | Distinct Staging Secret (32+ chars) | Session tokens from staging cannot decode in production. |
| **`NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY`**| Production Client Key | Staging Client Key | Feature flags isolated between environments. |
| **`FLAGSMITH_SERVER_SIDE_API_KEY`** | Production Server Key | Staging Server Key | Staging rollout API mutations cannot touch production flags. |

---

## 3. Pre-Promotion Verification Probes

Execute these probes against the deployed staging environment:

### Probe 1: PostgREST Public API Exposure Check
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<STAGING_PROJECT_REF>.supabase.co/rest/v1/organizations" \
  -H "apikey: $STAGING_ANON_KEY"
# Expected Result: 403 Forbidden or 401 Unauthorized
```

### Probe 2: Unauthenticated Rollout Mutation Rejection
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://pulse-pilot-two-git-staging-shubhamver45s-projects.vercel.app/api/flagsmith/rollout" \
  -H "Content-Type: application/json" \
  -d '{"flagsmithFeatureName": "exp_checkout_social_proof", "action": "EMERGENCY_KILL_SWITCH", "rationale": "unauthenticated probe"}'
# Expected Result: 401 Unauthorized
```

### Probe 3: Non-Admin Rollout Rejection
```bash
# Log in as non-admin user on staging, attempt rollout:
# Expected Result: 403 Forbidden (FORBIDDEN)
```

### Probe 4: Session Revocation Cross-Container Invalidation
```bash
# 1. Log in on staging to obtain valid session token.
# 2. Call /api/auth/logout.
# 3. Present the logged-out token to /api/flagsmith/rollout.
# Expected Result: 401 Unauthorized (INVALID_SESSION).
```

### Probe 5: Production State Immutability Assurance
```bash
# Query production database / health endpoint:
# Verify that experiment count, audit log count, and feature flag values in production have not changed!
```

---

## 4. Staging Promotion Gates

| Gate ID | Condition | Status | Action Required |
| :--- | :--- | :---: | :--- |
| **GATE-01** | Dedicated Supabase staging project created | ⏳ PENDING | Operator must create project in Supabase dashboard. |
| **GATE-02** | Staging database initialized via code migrations | ⏳ PENDING | Run `npm run prisma:migrate:staging`. |
| **GATE-03** | Live SEC-03.1 acceptance tests pass (13/13) | ⏳ PENDING | Run `psql "$STAGING_DATABASE_URL" -f scripts/staging-dba-execution.sql`. |
| **GATE-04** | Vercel preview deployment scoped to staging env | ⏳ PENDING | Configure Vercel preview environment variables. |
| **GATE-05** | Production database and flags verified untouched | ✅ PASS | Continuous verification: zero production mutations. |

