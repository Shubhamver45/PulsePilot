# PULSEPILOT AI — SEC-03.2 CRITICAL STAGING RUNNER HARDENING & SECURITY SIGNOFF

**Document Reference:** `SEC03-REVOCATION-SIGNOFF-V7`  
**Security Architect:** Principal PostgreSQL Database Security Architect & DevSecOps Auditor  
**Classification:** Staging Database Execution, Live Verification & Audit Signoff  
**Static SQL Hardening Status:** **PASS (10/10 Invariants Verified)**  
**Local Application Verification:** **PASS (23/23 Scenarios Verified)**  
**Staging Safety Gate & Runner Unit Tests:** **PASS (17/17 Automated Hardening Tests Passed)**  
**DBA Harness Hardening Review (V4):** **PASS (Independent Ref, Endpoint Agreement, No Duplicate DDL, Role Isolation)**  
**Git Secret Protection:** **PASS (.env.staging, .env*.staging, .env.staging.* strictly ignored)**  
**Live Staging Execution Status:** **GATED ON LOCAL STAGING CREDENTIAL CONFIGURATION**  
**Final Status:** **STAGING RUNNER HARDENED — AWAITING DEDICATED STAGING DATABASE**  
**Date:** November 16, 2026  

---

## 1. Executive Summary & Safety Mandate

The remote staging runner tooling and DBA execution harness have undergone rigorous hardening to enforce strict database identity validation, isolate migration execution, and establish a single authoritative schema initialization path.

In strict compliance with the **Cardinal Safety Rules**:
1. **Zero SQL Executed Against Production:** No migration, inspection query, or test transaction was executed against the production project `czqhiuidekvozuoqdmyd`.
2. **Actual Database Identity Verification:** The runner and harness no longer treat `current_database()` (which defaults to `'postgres'` on all Supabase databases) as proof of staging. Physical identity is validated through mandatory `STAGING_PROJECT_REF`, parsed hostname agreement (`db.<ref>.supabase.co`), and an active connected server read-only inspection query.
3. **Zero Fallback to Production:** Both [`scripts/run-staging-dba-tests.ts`](file:///Users/shubham/Desktop/pulsepilot/scripts/run-staging-dba-tests.ts) and [`scripts/staging-prisma-migrate.ts`](file:///Users/shubham/Desktop/pulsepilot/scripts/staging-prisma-migrate.ts) fail closed with exit code 1 if either `STAGING_DATABASE_URL` or `STAGING_DIRECT_URL` is omitted, strictly refusing to fall back to `DATABASE_URL` or `DIRECT_URL`.
4. **Single Authoritative Schema Initialization Path:** The DBA execution harness ([`scripts/staging-dba-execution.sql`](file:///Users/shubham/Desktop/pulsepilot/scripts/staging-dba-execution.sql)) has been refactored into a 5-stage runbook. It does NOT duplicate table or function DDL already owned by Prisma migrations; instead, Stage 3 asserts that Prisma migrations were applied once via `npm run prisma:migrate:staging`.
5. **Git Secret Protection:** Updated [`.gitignore`](file:///Users/shubham/Desktop/pulsepilot/.gitignore) with `.env.staging`, `.env*.staging`, and `.env.staging.*`. All credentials remain completely excluded from version control.

---

## 2. Hardened Architecture & Security Invariants

### 2.1 Actual Database Identity Verification (Critical)
- **Mandatory `STAGING_PROJECT_REF`:** Must be supplied via environment variable or `.env.staging`. Must be a valid lowercase alphanumeric string (12–40 chars).
- **Parsed Hostname Validation:** Enforces official Supabase hosts (`.supabase.co` direct or `.supabase.com` pooler).
- **Exact Project Reference Agreement:** Extracted hostname project reference must match `STAGING_PROJECT_REF` exactly. Mismatch throws `PROJECT_REF_MISMATCH`.
- **Production Collision Guard:** Any match against known production reference `czqhiuidekvozuoqdmyd` in project ref or hostname immediately aborts with `PRODUCTION_COLLISION` (exit code 1).
- **Connected Server Identity Inspection:** Connects using read-only query:
  ```sql
  SELECT current_database(), current_user, session_user, inet_server_addr()::text, inet_server_port(), version()
  ```
- **Database Name Awareness:** Explicitly warns that `current_database() = 'postgres'` is standard on all Supabase databases and does NOT alone constitute proof of staging identity.

### 2.2 Migration Runner Environment Isolation
- `STAGING_DATABASE_URL` and `STAGING_DIRECT_URL` are both strictly mandatory.
- Both URLs are parsed and validated independently; both must target the identical staging project reference.
- Executes `prisma migrate deploy` via child process with an isolated environment dictionary, overriding `DATABASE_URL` and `DIRECT_URL` to ensure the Prisma CLI cannot load production values from local `.env` files.
- Inspects database for prerequisite role `pulsepilot_app` before invoking migrations.

### 2.3 One Authoritative Schema Initialization Path
The 5-stage sequence defined in [`scripts/staging-dba-execution.sql`](file:///Users/shubham/Desktop/pulsepilot/scripts/staging-dba-execution.sql):
1. **STAGE 1: Safety Gate & Independent Staging Identity Verification**
   - Requires `SET app.target_environment = 'staging';`
   - Requires `SET app.expected_staging_project_ref = '<staging-ref>';`
   - Validates that `app.expected_staging_project_ref` is valid, non-placeholder, and not `czqhiuidekvozuoqdmyd`.
2. **STAGE 2: Prerequisite Role Provisioning (Before Migrations)**
   - Provisions `pulsepilot_app` (LOGIN, NOSUPERUSER, NOBYPASSRLS).
   - Provisions `pulsepilot_revocation_maint` (NOLOGIN, NOSUPERUSER, NOBYPASSRLS).
   - Asserts non-superuser and no-bypass attributes for both roles.
3. **STAGE 3: Authoritative Prisma Migration Assertion**
   - Verifies table `public.revoked_tokens` and function `cleanup_expired_revoked_tokens()` exist (applied via `npm run prisma:migrate:staging`).
   - Zero duplicate DDL in the DBA harness.
4. **STAGE 4: Read-Only Evidence & Attribute Inspection**
   - Inspects table RLS status, role table grants, active RLS policies, function attributes (`SECURITY DEFINER`, `search_path=pg_catalog`), and execute permissions.
5. **STAGE 5: Live PostgreSQL Acceptance Tests**
   - 13 transaction-isolated tests executed inside a top-level `BEGIN ... ROLLBACK` block to keep staging clean.

---

## 3. Automated Verification Evidence

### 3.1 Hardened Runner Unit Test Suite (`tests/staging-runner-safety.test.ts`)
Executed `npm run test:staging-safety`:
```
=====================================================================
   PULSEPILOT AI — SEC-03.2 STAGING RUNNER HARDENING UNIT TESTS      
=====================================================================

TEST SUITE 1: Mandatory STAGING_PROJECT_REF Validation
  ✅ [PASS] Threw expected error containing "MISSING_STAGING_PROJECT_REF": Missing STAGING_PROJECT_REF must throw
  ✅ [PASS] Threw expected error containing "MISSING_STAGING_PROJECT_REF": Empty STAGING_PROJECT_REF must throw
  ✅ [PASS] Threw expected error containing "INVALID_STAGING_PROJECT_REF": Placeholder STAGING_PROJECT_REF must throw
  ✅ [PASS] Threw expected error containing "INVALID_STAGING_PROJECT_REF": Database name 'postgres' cannot be used as STAGING_PROJECT_REF
  ✅ [PASS] Threw expected error containing "MALFORMED_STAGING_PROJECT_REF": Symbols in project ref must be rejected
  ✅ [PASS] Threw expected error containing "MALFORMED_STAGING_PROJECT_REF": Under-length project ref (<12 chars) must be rejected
  ✅ [PASS] Threw expected error containing "PRODUCTION_COLLISION": Exact production project ref collision must be rejected
  ✅ [PASS] Valid staging project reference parses and trims cleanly
  ✅ Test Suite 1 Passed.

TEST SUITE 2: Endpoint Parsing & Hostname Validation
  ✅ [PASS] Threw expected error containing "MISSING_STAGING_DATABASE_URL": Missing STAGING_DATABASE_URL must throw
  ✅ [PASS] Threw expected error containing "MALFORMED_URL": Malformed URL must throw
  ✅ [PASS] Threw expected error containing "INVALID_PROTOCOL": HTTP protocol must be rejected
  ✅ [PASS] Threw expected error containing "UNSUPPORTED_HOST": Non-Supabase hostname must be rejected
  ✅ [PASS] Threw expected error containing "PRODUCTION_COLLISION": Production project reference in URL must be rejected
  ✅ [PASS] Threw expected error containing "PROJECT_REF_MISMATCH": Mismatch between URL hostname and expected STAGING_PROJECT_REF must be rejected
  ✅ [PASS] Extracted projectRef matches expected staging ref
  ✅ [PASS] Sanitized URL masks password completely
  ✅ Test Suite 2 Passed.

TEST SUITE 3: Prohibited Fallback Invariants
  ✅ [PASS] Threw expected error containing "MISSING_STAGING_DATABASE_URL": Runner must fail closed when STAGING_DATABASE_URL is missing, never falling back to DATABASE_URL
  ✅ [PASS] Threw expected error containing "MISSING_STAGING_DIRECT_URL": Runner must fail closed when STAGING_DIRECT_URL is missing, never falling back to DIRECT_URL
  ✅ [PASS] Threw expected error containing "PROJECT_REF_MISMATCH": Differing direct URL target must be rejected
  ✅ [PASS] Valid staging config loaded successfully
  ✅ Test Suite 3 Passed.

TEST SUITE 4: Live Server Identity Invariants
  ✅ [PASS] Valid server identity verified
  ✅ [PASS] current_database() = 'postgres' explicitly generates warning and is NOT treated as staging proof
  ✅ [PASS] Threw expected error containing "PRODUCTION_COLLISION": Server reporting production database name must be rejected
  ✅ [PASS] Threw expected error containing "SERVER_IDENTITY_MISMATCH": Server identity mismatch against expected staging project reference must be rejected
  ✅ Test Suite 4 Passed.

TEST SUITE 5: CLI Runner Fail-Closed Process Validation
  ✅ [PASS] staging-prisma-migrate exits nonzero when STAGING_PROJECT_REF is missing
  ✅ [PASS] staging-prisma-migrate reports clear safety halt error
  ✅ [PASS] run-staging-dba-tests exits nonzero when STAGING_PROJECT_REF is missing
  ✅ [PASS] run-staging-dba-tests reports clear safety halt error
  ✅ [PASS] staging-prisma-migrate exits nonzero when production collision occurs
  ✅ [PASS] staging-prisma-migrate explicitly halts with PRODUCTION_COLLISION
  ✅ Test Suite 5 Passed.

=====================================================================
   🎉 ALL 17 FORMAL RUNNER HARDENING TESTS PASSED (5/5 suites)        
=====================================================================
```

### 3.2 SQL Hardening Tests (`tests/revocation-sql-hardening.test.ts`)
Executed `npm run test:sql-hardening`:
- **Result:** 7/7 suites passed (10/10 formal SQL invariants verified).

### 3.3 TypeScript & Production Build Verification
- **`npx tsc --noEmit`**: Clean (0 errors).
- **`npm run build`**: Clean (Prisma Client generated, 45/45 routes compiled, exit code 0).

---

## 4. Required Operator Action to Unblock Live Verification

To execute live staging verification against the newly provisioned Supabase staging project:

1. Create a local `.env.staging` file (ignored by Git):
   ```bash
   cp .env.staging.example .env.staging
   ```
2. Populate `.env.staging` with your staging project credentials:
   ```env
   STAGING_PROJECT_REF="<YOUR_STAGING_PROJECT_REF>"
   STAGING_DATABASE_URL="postgresql://postgres:<YOUR_STAGING_PASSWORD>@db.<YOUR_STAGING_PROJECT_REF>.supabase.co:5432/postgres"
   STAGING_DIRECT_URL="postgresql://postgres:<YOUR_STAGING_PASSWORD>@db.<YOUR_STAGING_PROJECT_REF>.supabase.co:5432/postgres"
   ```
3. Run the live acceptance workflow:
   ```bash
   # Stage 1 & 2: Provision prerequisite roles via DBA script
   psql "$STAGING_DIRECT_URL" -c "SET app.target_environment = 'staging'; SET app.expected_staging_project_ref = '<YOUR_STAGING_PROJECT_REF>';" -f scripts/staging-dba-execution.sql

   # Stage 3: Apply authoritative Prisma migrations
   npm run prisma:migrate:staging

   # Stage 4 & 5: Run automated DBA acceptance tests
   node --experimental-strip-types scripts/run-staging-dba-tests.ts
   ```

---

## 5. Final Remediation Status

```
=====================================================================
                    FINAL REMEDIATION STATUS:
      STAGING RUNNER HARDENED — AWAITING DEDICATED STAGING DATABASE
=====================================================================
- Database Identity Verification:              ✅ HARDENED (STAGING_PROJECT_REF mandatory)
- Hostname & Endpoint Agreement:               ✅ ENFORCED (Exact hostname validation)
- Fallback Prohibitions:                       ✅ ENFORCED (DATABASE_URL fallback blocked)
- Single Authoritative Schema Path:            ✅ RECONCILED (Prisma migrations authoritative)
- Staging DBA Harness (V4):                    ✅ HARDENED (No duplicate DDL, 13 live tests)
- Automated Hardening Unit Tests:              ✅ PASS (17/17 tests passing)
- TypeScript & Production Build Checks:        ✅ PASS (0 errors, 45/45 routes compiled)
- Git Target Branch:                           ✅ staging (Isolated from main)
- Live PostgreSQL Staging Execution:           ⏳ AWAITING DEDICATED STAGING DATABASE
=====================================================================
```
