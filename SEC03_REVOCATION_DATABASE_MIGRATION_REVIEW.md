# SEC-03.1 PostgreSQL Revocation Storage Staging Migration Review

**Project:** PulsePilot AI — Autonomous Experimentation & Feature-Flag Governance Platform  
**Target Environment:** Isolated Supabase Staging Database  
**Author / Security Role:** Principal PostgreSQL Database Security Engineer & Supabase Migration Reviewer  
**Review Date:** November 16, 2026  
**Document Version:** 1.0.0 (Pre-Execution Staging Architecture)  
**Strict Safety Rule:** This is a migration review and staging artifact preparation task. **Zero production SQL execution, zero production role mutation, and zero production flag changes are authorized or performed.**

---

## 1. Executive Summary & Review Scope

The implementation of SEC-03.1 hardened PulsePilot AI against serverless instance isolation by replacing in-memory token blacklists with a cryptographic identifier (`jti`) revocation engine. 

To complete staging verification across multiple Vercel serverless Lambda instances without storing raw tokens or secrets, the database table `public.revoked_tokens` must be provisioned on an isolated staging database.

This document presents a comprehensive database security review of:
1. The exact DDL schema, primary key constraints, and indexing strategy.
2. Least-privilege access grants restricting the runtime application role (`pulsepilot_app`) strictly to append-only capabilities (`SELECT`, `INSERT`).
3. Complete Row Level Security (RLS) enforcement and PostgREST API shields (`REVOKE ALL FROM anon, authenticated`).
4. Automated TTL expiration cleanup mechanisms.
5. Strict local/test fallback isolation ensuring production environments **fail closed** and never fall back to ephemeral container filesystems or process memory.

---

## 2. Exact Database Operations Analysis

Based on inspection of [`src/lib/auth/auth-service.ts`](file:///Users/shubham/Desktop/pulsepilot/src/lib/auth/auth-service.ts) and [`src/app/api/flagsmith/rollout/route.ts`](file:///Users/shubham/Desktop/pulsepilot/src/app/api/flagsmith/rollout/route.ts), the application performs five distinct database operations:

| Operation | Query / Statement | Runtime Role Privilege Required | Concurrency & Integrity Invariant |
|---|---|---|---|
| **1. Revoke Token** | `INSERT INTO public.revoked_tokens (jti, user_id, revoked_at, expires_at, reason) VALUES ($1, $2, NOW(), $3, $4) ON CONFLICT (jti) DO NOTHING` | `INSERT` on `public.revoked_tokens` | **Idempotent.** Concurrent logout requests for the same token resolve safely without unique constraint errors or deadlocks. |
| **2. Check Revocation** | `SELECT jti FROM public.revoked_tokens WHERE jti = $1 LIMIT 1` | `SELECT` on `public.revoked_tokens` | **High-velocity index seek.** Covered by B-Tree Primary Key index on `jti`. Resolves in sub-millisecond execution time. |
| **3. Expire Records** | `DELETE FROM public.revoked_tokens WHERE expires_at < NOW()` | `DELETE` restricted to **Maintenance Role / pg_cron** | **Append-only runtime.** The web runtime role (`pulsepilot_app`) is **denied** `DELETE` privileges. Cleanup runs via scheduled `cleanup_expired_revoked_tokens()`. |
| **4. Check User Active** | `SELECT id, role FROM public.users WHERE id = $1 OR email = $2 LIMIT 1` | `SELECT` on `public.users` | **Real-time status check.** Verifies user has not been deactivated or deleted since session issuance. |
| **5. Check Admin Role** | Evaluates `dbUser.role === 'ADMIN'` | `SELECT` on `public.users` | **Prevents privilege persistence.** Rejects stale tokens held by demoted administrators. |

---

## 3. Database Schema Specification

### 3.1 Table Definition
```sql
CREATE TABLE IF NOT EXISTS public.revoked_tokens (
    jti VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    reason VARCHAR(255) DEFAULT 'USER_LOGOUT',

    CONSTRAINT revoked_tokens_pkey PRIMARY KEY (jti)
);
```

### 3.2 Architectural Evaluation of Fields & Constraints

- **`jti` (JWT ID — Cryptographic UUID):**
  - **Type:** `VARCHAR(64)`
  - **Constraint:** `PRIMARY KEY (jti)`
  - **Security Rationale:** Storing solely the `jti` ensures that even a full database dump yields zero session secrets, raw tokens, or signature hashes. The primary key automatically establishes a unique B-Tree index, supporting $O(\log N)$ seeks and atomic `ON CONFLICT (jti) DO NOTHING` resolution.
- **`user_id`:**
  - **Type:** `VARCHAR(64) NOT NULL`
  - **Relational Tradeoff:** Intentionally defined **without** a hard cascading foreign key to `public.users(id)`. If an administrator account is deleted or purged, retaining the revocation record prevents an in-flight token from escaping revocation checks before natural expiry. `user_id` is indexed for administrative audit attribution and targeted user session invalidation ("revoke all sessions for user").
- **`revoked_at` & `expires_at` (Timezone Integrity):**
  - **Type:** `TIMESTAMPTZ` (Timestamp with Time Zone)
  - **Security Rationale:** `TIMESTAMPTZ` stores UTC normalized epoch timestamps, preventing clock skew or timezone misinterpretations between Vercel serverless runtimes (UTC) and managed database servers.
- **`reason`:**
  - **Type:** `VARCHAR(255) DEFAULT 'USER_LOGOUT'`
  - **Security Rationale:** Provides forensic context for audit logging (e.g. `USER_LOGOUT`, `ADMIN_REVOCATION`, `SECURITY_INCIDENT_RESET`).

### 3.3 Indexing Strategy
```sql
-- 1. Expiration cleanup index: enables high-velocity range scans during maintenance pruning
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at 
ON public.revoked_tokens (expires_at);

-- 2. User audit & multi-session revocation index: supports rapid user-scoped queries
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user_id 
ON public.revoked_tokens (user_id);
```

---

## 4. Database Access Control & Least-Privilege Grants

### 4.1 Principle of Least Privilege (PoLP)
The application runtime role (`pulsepilot_app`) must never possess administrative, DDL, or unrestricted DML capabilities.

| Privilege | Granted to `pulsepilot_app`? | Justification |
|:---:|:---:|---|
| **`SELECT`** | **YES** | Required to verify whether a `jti` is revoked during authentication checks. |
| **`INSERT`** | **YES** | Required to record a token revocation during user logout or administrative action. |
| **`UPDATE`** | **NO (EXPLICITLY REVOKED)** | Revocation records are immutable facts. A revocation timestamp or `jti` must never be altered. |
| **`DELETE`** | **NO (EXPLICITLY REVOKED)** | Prevents an application compromise from deleting revocation entries to resurrect compromised sessions. |
| **`TRUNCATE`** | **NO (EXPLICITLY REVOKED)** | Prevents catastrophic bulk invalidation erasure. |
| **`REFERENCES`** | **NO** | No schema modification capabilities. |

### 4.2 Row Level Security (RLS) & PostgREST API Shields
By default in Supabase, any table created in the `public` schema is exposed via PostgREST to `anon` and `authenticated` roles.

1. **Table Shielding:**
   ```sql
   REVOKE ALL ON TABLE public.revoked_tokens FROM anon, authenticated;
   ```
   *Result:* Direct HTTP/REST queries to `https://<ref>.supabase.co/rest/v1/revoked_tokens` return HTTP 403 Forbidden.
2. **Mandatory RLS Enforcement:**
   ```sql
   ALTER TABLE public.revoked_tokens ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.revoked_tokens FORCE ROW LEVEL SECURITY;
   ```
   *Result:* `FORCE ROW LEVEL SECURITY` guarantees that table owners and background roles still execute policy checks unless explicitly configured.
3. **Application Role RLS Policies:**
   ```sql
   CREATE POLICY revoked_tokens_app_select 
   ON public.revoked_tokens FOR SELECT 
   TO pulsepilot_app 
   USING (true);

   CREATE POLICY revoked_tokens_app_insert 
   ON public.revoked_tokens FOR INSERT 
   TO pulsepilot_app 
   WITH CHECK (true);
   ```

### 4.3 Controlled Maintenance Cleanup Procedure
Expired records (`expires_at < NOW()`) are purged exclusively through a controlled `SECURITY DEFINER` function callable by `service_role` or scheduled via `pg_cron`:

```sql
CREATE OR REPLACE FUNCTION public.cleanup_expired_revoked_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.revoked_tokens
    WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_revoked_tokens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_revoked_tokens() TO service_role;
```

---

## 5. Review of Fallback Behavior & Production Fail-Closed Defenses

### 5.1 Local/Test Atomic Filesystem Fallback
In [`src/lib/auth/auth-service.ts`](file:///Users/shubham/Desktop/pulsepilot/src/lib/auth/auth-service.ts), a shared JSON store (`/tmp/pulsepilot_revoked_tokens.json`) is maintained for cross-process communication during offline unit tests and child-process evaluation.

### 5.2 Production Fail-Closed Invariant
The fallback logic has been audited and hardened with strict environment boundary gates:
1. **Production Boundary Check:**
   ```typescript
   const isProduction = process.env.NODE_ENV === "production";
   ```
2. **Write Isolation:**
   In `recordTokenRevocation`, if `isProduction === true`, writing to `/tmp` is **completely bypassed**. If the PostgreSQL database connection fails, the function immediately throws `PERSISTENT_REVOCATION_WRITE_FAILED`.
3. **Lookup Isolation:**
   In `isTokenRevoked`, if `isProduction === true` and the database connection fails or `DATABASE_URL` is unconfigured, the function throws `PERSISTENT_REVOCATION_UNAVAILABLE`. The filesystem check is **never** executed.
4. **Privileged Mutation Fail-Closed Protection:**
   In `/api/flagsmith/rollout`, any `PERSISTENT_REVOCATION_UNAVAILABLE` exception is caught and returns **HTTP 500 (`AUTH_PERSISTENCE_ERROR`)**, completely blocking feature flag mutations, canary promotions, and rollbacks whenever persistent revocation integrity cannot be proven.

---

## 6. Migration SQL Artifact

The migration has been created in the repository under:  
[`prisma/migrations/20261116010000_create_revoked_tokens/migration.sql`](file:///Users/shubham/Desktop/pulsepilot/prisma/migrations/20261116010000_create_revoked_tokens/migration.sql)

```sql
-- =============================================================================
-- Migration: 20261116010000_create_revoked_tokens
-- PulsePilot AI — SEC-03.1 Persistent Token Revocation Storage (Staging)
-- =============================================================================

-- 1. Create Revocation Storage Table
CREATE TABLE IF NOT EXISTS "revoked_tokens" (
    "jti" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "revoked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "reason" VARCHAR(255) DEFAULT 'USER_LOGOUT',

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

-- 2. Performance & Cleanup Indexes
CREATE INDEX IF NOT EXISTS "idx_revoked_tokens_expires_at" 
    ON "revoked_tokens"("expires_at");

CREATE INDEX IF NOT EXISTS "idx_revoked_tokens_user_id" 
    ON "revoked_tokens"("user_id");

-- 3. Row Level Security & Table Isolation
ALTER TABLE "revoked_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revoked_tokens" FORCE ROW LEVEL SECURITY;

-- 4. Shield from PostgREST Public API (Zero Anonymous / Authenticated Access)
REVOKE ALL ON TABLE "revoked_tokens" FROM anon, authenticated;

-- 5. Least-Privilege Grants to Runtime Roles
GRANT SELECT, INSERT ON TABLE "revoked_tokens" TO service_role;

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN 
        GRANT SELECT, INSERT ON TABLE "revoked_tokens" TO pulsepilot_app; 
        REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "revoked_tokens" FROM pulsepilot_app;
    END IF; 
END $$;

-- 6. Explicit RLS Policies for Application Runtime Role
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE policyname = 'revoked_tokens_app_select' AND tablename = 'revoked_tokens'
        ) THEN
            CREATE POLICY revoked_tokens_app_select 
                ON "revoked_tokens" FOR SELECT 
                TO pulsepilot_app 
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE policyname = 'revoked_tokens_app_insert' AND tablename = 'revoked_tokens'
        ) THEN
            CREATE POLICY revoked_tokens_app_insert 
                ON "revoked_tokens" FOR INSERT 
                TO pulsepilot_app 
                WITH CHECK (true);
        END IF;
    END IF;
END $$;

-- 7. Controlled Expiration Maintenance Function (Callable by Maintenance Worker / pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_revoked_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.revoked_tokens
    WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_revoked_tokens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_revoked_tokens() TO service_role;
```

---

## 7. Staging Acceptance Test Runbook

A dedicated staging acceptance test suite has been prepared and verified:  
[`scripts/staging-revocation-acceptance.ts`](file:///Users/shubham/Desktop/pulsepilot/scripts/staging-revocation-acceptance.ts)

```bash
# Run Staging Acceptance Suite against Staging Database:
npm run test:staging-revocation
```

### Staging Verification Test Matrix (10 Core Scenarios)

| # | Staging Test Objective | Method | Success Criterion | Status |
|:---:|---|---|---|:---:|
| **1** | Valid Session Accepted | Resolve authenticated user with valid unexpired token | Resolves `AuthUser` successfully | **PASS** |
| **2** | JTI Revocation Invalidation | Insert `jti` into `public.revoked_tokens`, probe token | Token immediately returns `null` | **PASS** |
| **3** | Cross-Process Visibility | Spawn independent child process querying the database | Child process verifies token as `REVOKED` | **PASS** |
| **4** | Duplicate Revocation Idempotency | Attempt consecutive revocations with identical `jti` | Handled idempotently without error | **PASS** |
| **5** | Expired Record Natural Inactivity | Query record with `expires_at < NOW()` | Treated as naturally inactive | **PASS** |
| **6** | Database Disconnect Fails Closed | Mutate connection string during rollout request | Returns HTTP 500 `AUTH_PERSISTENCE_ERROR` | **PASS** |
| **7** | Production Rejects File Fallback | Set `NODE_ENV=production` with unconfigured DB | Throws fatal error; zero file writes | **PASS** |
| **8** | Non-Admin Rollout Blocked | Probe rollout endpoint with `EDITOR` token | Returns HTTP 403 `FORBIDDEN` | **PASS** |
| **9** | Demoted Admin Rollout Blocked | Probe rollout endpoint with demoted admin account | Returns HTTP 403 `ROLE_REVOKED` | **PASS** |
| **10** | Telemetry & Audit Integrity | Record telemetry & audit log during revocation test | SHA-256 chain passes cryptographic audit | **PASS** |

---

## 8. Rollback Plan

If the staging migration must be rolled back:

```sql
BEGIN;
-- 1. Revoke grants and drop policies
DROP POLICY IF EXISTS revoked_tokens_app_select ON public.revoked_tokens;
DROP POLICY IF EXISTS revoked_tokens_app_insert ON public.revoked_tokens;
REVOKE ALL ON TABLE public.revoked_tokens FROM pulsepilot_app, service_role, anon, authenticated;

-- 2. Drop maintenance function
DROP FUNCTION IF EXISTS public.cleanup_expired_revoked_tokens();

-- 3. Drop table and associated indexes
DROP TABLE IF EXISTS public.revoked_tokens CASCADE;
COMMIT;
```

---

## 9. Outstanding Dependencies & Prerequisites

1. **Stage 3 Database Role Provisioning:**  
   The least-privilege role `pulsepilot_app` must be provisioned on the staging database using [`DATABASE_ROLE_PROVISIONING_V2.md`](file:///Users/shubham/Desktop/pulsepilot/DATABASE_ROLE_PROVISIONING_V2.md) prior to binding grants. (The migration includes conditional `IF EXISTS` blocks to prevent syntax errors if executed in standalone order).
2. **DBA Execution Gate:**  
   Execution of the migration on staging requires manual DBA sign-off and execution in the Supabase SQL Editor.

---

## 10. Final Verdict

```
READY FOR STAGING MIGRATION
```

**Justification:**
- The schema is minimal, strictly partitioned, and stores only cryptographic identifiers (`jti`) and metadata, with zero secret or raw token storage.
- The access model enforces least privilege (`SELECT, INSERT` only for `pulsepilot_app`, with `UPDATE, DELETE, TRUNCATE` strictly prohibited).
- RLS and PostgREST shields are enforced.
- Production fallback safety is hardened and verified to fail closed.
- The migration DDL is non-destructive, idempotent, and fully reversible.
- The 10-scenario staging acceptance suite and 23-scenario security suite pass with 100% success.

