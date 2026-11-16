# PULSEpilot AI — Security Remediation Architecture V2
## Comprehensive Technical Architecture for Production Hardening & Least-Privilege Enforcement

**Document Version:** 2.0.0 (Post-Review Engineering Architecture)  
**Security Status:** Approved Technical Architecture for Staging Rollout  
**Target Environments:** Supabase Cloud PostgreSQL 15+ & Next.js 14 Serverless on Vercel  
**Hackathon Track:** WeMakeDevs × Flagsmith Toggle Wars — Track 02: AI Agents & Feature Flags  

---

## 1. Executive Summary & Review of V1 Failure Modes

The previous pre-execution review properly issued a determination of `NOT SAFE — REVISIONS REQUIRED`.  
Remediation Plan V1 failed because of three structural defects:
1. **The RLS Default-Deny Trap (SEC-02 + SEC-01):** Enabling Row-Level Security on all 10 tables without defining explicit operational policies for `pulsepilot_app` would have triggered PostgreSQL's default-deny behavior, causing every query executed by the non-owner role `pulsepilot_app` to return zero rows.
2. **The Non-Existent Auth Import (SEC-03):** The proposed route patch imported `@/lib/auth/session`, a module not present in the repository, guaranteeing an immediate build failure.
3. **The Ephemeral Serverless Session Defect (SEC-03):** The existing authentication system used an in-memory `Map` (`SESSIONS_STORE`). On Vercel, separate Lambda instances do not share memory; cold starts and cross-instance routing would randomly fail legitimate human rollout authorizations with HTTP 401.

**Architecture V2 completely resolves these failure modes** through:
- Explicit, table-by-table RLS policies granting least-privilege DML to `pulsepilot_app` while completely closing PostgREST access from `anon` and `authenticated`.
- A stateless, cryptographically signed session token architecture using Node.js native `crypto` (HMAC-SHA256), immune to serverless cold starts.
- A statement-level `BEFORE TRUNCATE` trigger coupled with non-owner role isolation on `audit_logs`.

---

## 2. Four-Pillar Security Architecture (SEC-01 through SEC-04)

```
+===================================================================================================+
|                                    PULSEPILOT AI ARCHITECTURE V2                                  |
+===================================================================================================+
|                                                                                                   |
|  [ SEC-03: PERSISTENT AUTHENTICATION ]                                                            |
|  Next.js Serverless Route Handlers (Vercel)                                                       |
|  - Stateless HMAC-SHA256 Signed Tokens (pps_<claims>.<sig>) in HTTP-only Cookie / Bearer Header   |
|  - Role-Based Access Control: role === 'ADMIN' strictly enforced on /api/flagsmith/rollout        |
|  - Strict Zod validation: authorizer stripped from client body; bound to verified user identity   |
|                                                                                                   |
|                                  |                                                                |
|                                  | Prisma ORM (Port 5432 / Supavisor 6543)                        |
|                                  v                                                                |
|                                                                                                   |
|  [ SEC-01: LEAST-PRIVILEGE ROLE ISOLATION ]                                                       |
|  PostgreSQL Connection authenticated as 'pulsepilot_app' (NOT 'postgres')                         |
|  - NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS                              |
|  - Zero DDL rights: cannot CREATE, ALTER, DROP, or TRUNCATE tables                                |
|  - Cannot ALTER TABLE ... DISABLE TRIGGER                                                         |
|  - SELECT, INSERT, UPDATE, DELETE on business tables                                              |
|  - Strictly SELECT and INSERT on audit_logs and telemetry_events                                  |
|                                                                                                   |
|                                  |                                                                |
|                                  v                                                                |
|                                                                                                   |
|  [ SEC-02: EXPLICIT ROW-LEVEL SECURITY & POSTGREST SHIELDING ]                                    |
|  PostgreSQL Table Access Layer (All 10 Tables)                                                    |
|  - RLS ENABLED & FORCE ROW LEVEL SECURITY on all application tables                               |
|  - Explicit per-table policies for 'pulsepilot_app' (e.g. org_app_policy, aud_app_insert)         |
|  - REVOKE ALL ON ALL TABLES FROM anon, authenticated (Closes PostgREST attack surface)           |
|                                                                                                   |
|                                  |                                                                |
|                                  v                                                                |
|                                                                                                   |
|  [ SEC-04: AUDIT LEDGER STATEMENT-LEVEL TRUNCATE PROTECTION ]                                     |
|  public.audit_logs Storage Engine                                                                 |
|  - Row-Level Trigger: trg_audit_log_immutable (blocks UPDATE & DELETE FOR EACH ROW)               |
|  - Statement-Level Trigger: trg_audit_log_prevent_truncate (blocks TRUNCATE FOR EACH STATEMENT)    |
|  - Dual Defense: Lack of TRUNCATE table grant + Trigger abort exception P0001                     |
|                                                                                                   |
+===================================================================================================+
```

---

## 3. Detailed Component Architecture

### 3.1 SEC-01: Least-Privilege Role Separation
- **Migration Owner Role (`postgres` / `pulsepilot_migration`):**
  - Holds schema ownership and executes CI/CD migrations via `DIRECT_URL`.
  - Never exposed to runtime application queries.
- **Application Runtime Role (`pulsepilot_app`):**
  - Configured as `DATABASE_URL` in Vercel.
  - Granted minimum necessary DML on application tables.
  - Denied all `UPDATE`, `DELETE`, and `TRUNCATE` operations on `audit_logs` and `telemetry_events`.
  - Default read access to `pg_catalog` and `information_schema` is strictly preserved, preventing driver initialization failures.
  - *Full details in [`DATABASE_ROLE_PROVISIONING_V2.md`](file:///Users/shubham/Desktop/pulsepilot/DATABASE_ROLE_PROVISIONING_V2.md).*

### 3.2 SEC-02: Explicit Row-Level Security Policies
- **PostgREST Exposure Neutralization:**
  - `REVOKE ALL ON TABLE <all_tables> FROM anon, authenticated;`
  - Guarantees that requests to `https://<ref>.supabase.co/rest/v1/*` with `NEXT_PUBLIC_SUPABASE_ANON_KEY` receive HTTP 403 Forbidden.
- **Explicit Operational Policies:**
  - Rather than granting broad `BYPASSRLS`, explicit policies are defined for `pulsepilot_app` across all 10 tables.
  - For `audit_logs`, only `SELECT` and `INSERT` policies are defined. Even if table-level permissions were mistakenly granted, RLS blocks any attempt to `UPDATE` or `DELETE` audit rows.
  - `FORCE ROW LEVEL SECURITY` ensures policies apply even if connection pooling or configuration drifts.
  - *Full details in [`RLS_POLICY_MATRIX.md`](file:///Users/shubham/Desktop/pulsepilot/RLS_POLICY_MATRIX.md).*

### 3.3 SEC-03: Persistent Authentication & Rollout Authorization
- **Stateless HMAC-SHA256 Token Engine:**
  - Implemented in `src/lib/auth/auth-service.ts` using Node.js native `crypto`.
  - Format: `pps_<base64url_claims>.<hmac_sha256_signature>`.
  - Validates expiry and cryptographic signature in microseconds without external network dependencies.
  - Works seamlessly across concurrent Vercel serverless containers.
- **Hardened `/api/flagsmith/rollout` Route:**
  - Gated by dual token extraction (Cookie + Bearer header).
  - Enforces `role === "ADMIN"`. Rejects unauthorized users with HTTP 403 and unauthenticated visitors with HTTP 401.
  - Deletes `authorizer` from the client request schema. Automatically derives the recorded audit actor from the validated session.
  - Incorporates CSRF protection and server-side Flagsmith management credential verification.
  - *Full details in [`AUTHENTICATION_ARCHITECTURE_REVIEW.md`](file:///Users/shubham/Desktop/pulsepilot/AUTHENTICATION_ARCHITECTURE_REVIEW.md).*

### 3.4 SEC-04: Statement-Level Audit Ledger Protection
- **The PostgreSQL Gap in V1:** Row-level triggers (`FOR EACH ROW`) do not fire during `TRUNCATE TABLE`.
- **The V2 Statement-Level Defense:**
  ```sql
  CREATE TRIGGER trg_audit_log_prevent_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_audit_log_modification();
  ```
- **Defense-in-Depth:**
  1. `pulsepilot_app` does not hold the `TRUNCATE` privilege on `audit_logs`.
  2. If an administrative connection or SQL injection vector attempts `TRUNCATE TABLE audit_logs;`, `trg_audit_log_prevent_truncate` intercepts the statement and raises exception `P0001`, rolling back the transaction.
  3. `pulsepilot_app` does not own the table and cannot execute `ALTER TABLE ... DISABLE TRIGGER`.

---

## 4. Trust Boundaries & Residual Risk Analysis

### 4.1 What is Cryptographically Guaranteed:
1. **Application Runtime Tamper Resistance:**
   Even in the event of Remote Code Execution (RCE) in a Next.js serverless route handler, the compromised process connects as `pulsepilot_app`. It cannot alter existing audit records, cannot truncate the ledger, cannot drop tables, and cannot disable triggers.
2. **Zero PostgREST Data Leakage:**
   Direct HTTP queries to Supabase using the client-exposed anonymous key are rejected at the database permission layer (`HTTP 403 Forbidden`).
3. **Impersonation Prevention on Feature Flags:**
   Remote Flagsmith mutations cannot be triggered anonymously, and audit logs cannot falsely claim that "Sarah Lin" approved an action unless an authenticated admin session token was presented.

### 4.2 The Legitimate Trust Boundary (Residual Risks):
- **Superuser & Cloud Infrastructure Boundary:**
  A cloud database superuser (`postgres`) holding physical host access or Supabase dashboard credentials can technically execute `ALTER TABLE audit_logs DISABLE TRIGGER ALL` or drop the database. Triggers and RLS protect against application and network-level attacks; they do not replace physical or cloud account security.
- **Flagsmith Management Key Security:**
  `FLAGSMITH_MANAGEMENT_KEY` resides in Vercel server-side environment variables. Server-side environment variables must never be prefixed with `NEXT_PUBLIC_`.

---

## 5. Architectural Deliverables Directory

| Document | Primary Domain | Contents |
| :--- | :--- | :--- |
| [`RLS_POLICY_MATRIX.md`](file:///Users/shubham/Desktop/pulsepilot/RLS_POLICY_MATRIX.md) | Database Security (SEC-02) | 10-table data ownership models, explicit policies, PostgREST closure SQL. |
| [`DATABASE_ROLE_PROVISIONING_V2.md`](file:///Users/shubham/Desktop/pulsepilot/DATABASE_ROLE_PROVISIONING_V2.md) | Database Security (SEC-01) | Role separation, DML vs DDL privilege matrix, sequence grants, SQL runbook. |
| [`AUTHENTICATION_ARCHITECTURE_REVIEW.md`](file:///Users/shubham/Desktop/pulsepilot/AUTHENTICATION_ARCHITECTURE_REVIEW.md) | Application Security (SEC-03) | Serverless session persistence, HMAC-SHA256 design, route authorization. |
| [`STAGING_SECURITY_ROLLOUT_PLAN.md`](file:///Users/shubham/Desktop/pulsepilot/STAGING_SECURITY_ROLLOUT_PLAN.md) | Release Engineering | 9-stage rollout sequence with preconditions, tests, rollbacks, and exit criteria. |

