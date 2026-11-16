# PULSEPILOT AI — STAGING ENVIRONMENT PROVISIONING & DBA RUNBOOK

**Document Reference:** `STAGING-ENV-SETUP-V3`  
**Security Architect:** Principal Cloud Infrastructure Engineer & Database Architect  
**Classification:** Infrastructure Provisioning, Environment Isolation & Verification Guide  
**Status:** **READY FOR OPERATOR PROVISIONING**  
**Date:** November 16, 2026  

---

## 1. Executive Summary & Infrastructure Baseline

To satisfy the requirements of **SEC-03.1 and SEC-03.2** without risking production state, PulsePilot AI enforces an **air-gapped staging database architecture**.

### 1.1 Production Infrastructure Under Absolute Protection
- **Production Supabase Project:** `czqhiuidekvozuoqdmyd`
- **Production Database Host:** `db.czqhiuidekvozuoqdmyd.supabase.co:5432`
- **Production Vercel Deployment:** `https://pulse-pilot-two.vercel.app/`
- **Safety Directive:** Under no circumstances may SQL migrations, inspection queries, or role mutations be executed against `czqhiuidekvozuoqdmyd`.

### 1.2 Staging Architecture & Identity Assurance Model
1. **Endpoint Hostname Validation:** Parses and validates that the connection URL strictly targets the expected Supabase host (`db.<staging-ref>.supabase.co`).
2. **Mandatory Full TLS Certificate & Hostname Verification:** Enforces strict TLS encryption, certificate chain validation, and hostname matching (`sslmode=verify-full`) during connection establishment, preventing DNS spoofing or MITM attacks. All other modes (`require`, `verify-ca`, `disable`, `allow`, `prefer`, `no-verify`) and `rejectUnauthorized=false` are strictly rejected.
3. **Read-Only Session Inspection:** Queries connected PostgreSQL session attributes (`current_database()`, `current_user`, `session_user`, `inet_server_addr()`, `version()`).
4. **Architectural Limitation Notice:** Supabase exposes no native PostgreSQL catalog variable for cloud project references. Therefore, `current_database() = 'postgres'` is standard on all Supabase databases and does NOT alone prove staging identity. Assurance is derived from the combination of endpoint hostname validation, TLS certificate verification, and PostgreSQL session checks.

---

## 2. Step-by-Step Manual Provisioning Instructions for the Operator

> **Notice:** As an automated assistant operating in a secure sandbox, I cannot log into your web browser or create cloud infrastructure accounts on your behalf. Please execute the following steps in the Supabase Dashboard:

### Step 1: Create a Dedicated Staging Supabase Project
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project**.
3. Configure project details:
   - **Name:** `pulsepilot-staging`
   - **Organization:** Select your active organization.
   - **Database Password:** Generate a secure 32+ character random password. Store this securely in your password manager.
   - **Region:** Select the same region as your production database (e.g., US East / AWS us-east-1).
   - **Pricing Plan:** Free / Pro tier.
4. Click **Create new project** and wait ~2 minutes for database provisioning to complete.
5. Record your new **Staging Project Reference** (the 20-character identifier in your project URL, e.g. `abcdefghijklmnopqrst`). Verify that it differs from `czqhiuidekvozuoqdmyd`.

### Step 2: Retrieve Staging Connection Strings
1. In your new staging project, navigate to **Project Settings** $\to$ **Database**.
2. Scroll to **Connection string** $\to$ select the **URI** tab.
3. Copy the **Direct Connection** URI:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[STAGING_PROJECT_REF].supabase.co:5432/postgres
   ```
4. Copy the **Transaction Pooler** URI (port 6543):
   ```
   postgresql://postgres.[STAGING_PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```

### Step 3: Retrieve Staging API Credentials
1. Navigate to **Project Settings** $\to$ **API**.
2. Copy the **Project URL** (`https://[STAGING_PROJECT_REF].supabase.co`).
3. Copy the **anon / public** API key.
4. Copy the **service_role / secret** API key.

---

## 3. Environment Variable Configuration

Create a local environment file `.env.staging` (or set shell environment variables) using the template from [`.env.staging.example`](file:///Users/shubham/Desktop/pulsepilot/.env.staging.example):

```bash
# 1. Mandatory Staging Project Reference
export STAGING_PROJECT_REF="<YOUR_STAGING_PROJECT_REF>"

# 2. Dedicated Staging PostgreSQL Connections (Direct & Pooled - Mandatory sslmode=verify-full)
export STAGING_DATABASE_URL="postgresql://postgres:<YOUR_STAGING_PASSWORD>@db.<YOUR_STAGING_PROJECT_REF>.supabase.co:5432/postgres?sslmode=verify-full"
export STAGING_DIRECT_URL="postgresql://postgres:<YOUR_STAGING_PASSWORD>@db.<YOUR_STAGING_PROJECT_REF>.supabase.co:5432/postgres?sslmode=verify-full"

# 3. Supabase API Credentials
export NEXT_PUBLIC_SUPABASE_URL="https://<YOUR_STAGING_PROJECT_REF>.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="<YOUR_STAGING_ANON_KEY>"
export SUPABASE_SERVICE_ROLE_KEY="<YOUR_STAGING_SERVICE_ROLE_KEY>"

# 4. Separate random 32+ char secret for staging session tokens
export SESSION_SECRET="staging_sec_token_random_secret_string_32chars_min"

# 5. Staging Flagsmith feature flag environment
export NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY="<YOUR_STAGING_FLAGSMITH_CLIENT_KEY>"
export FLAGSMITH_SERVER_SIDE_API_KEY="<YOUR_STAGING_FLAGSMITH_SERVER_KEY>"
```

> **Security Rule:** Never check `.env.staging` into Git. `.gitignore` is pre-configured to ignore `.env.staging`, `.env*.staging`, and `.env.staging.*`.

---

## 4. Five-Stage Execution Sequence

Execute the following initialization and acceptance commands in order:

### Phase 1: Automated Unit & Safety Tests (Offline)
Verifies runner invariants, savepoint transaction recovery, exact SQLSTATE 42501 assertion, isolated TLS fixtures, and SQL hardening rules:
```bash
npm run test:staging-safety    # 28/28 unit tests across 7 suites
npm run test:sql-hardening      # 10/10 SQL hardening invariants
```

### Phase 2: Read-Only Staging Preflight Inspection
Connects to the staging direct endpoint, verifies TLS certificate validation, queries PostgreSQL session attributes, and checks role presence:
```bash
npm run staging:preflight
```
- **Note:** Preflight is strictly read-only. Preflight success does NOT indicate acceptance tests have passed.

### Phase 3: Prerequisite Role Provisioning (Before Migration)
In the Supabase SQL Editor of your **staging project**, execute Stage 2 of `scripts/staging-dba-execution.sql`:
- Creates `pulsepilot_app` with `LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS`.
- Creates `pulsepilot_revocation_maint` with `NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS`.

### Phase 4: Apply Authoritative Migrations (Prisma)
Prisma is the **single authoritative schema path**. Apply migrations once:
```bash
npm run prisma:migrate:staging
```
Applies:
1. `20261116000000_init_production_schema` (10 base application tables)
2. `20261116010000_create_revoked_tokens` (Hardened persistent revocation storage)
3. `20261116020000_audit_log_truncate_protection` (Statement-level TRUNCATE trigger)

### Phase 5: Execute Live Acceptance Test Suite (Consistent Target)
Execute the 13 live acceptance tests directly over the exact validated connection:
```bash
npm run staging:acceptance
```
- **Target Consistency:** The runner connects directly to the exact validated `STAGING_DIRECT_URL`.
- **Self-Reverting:** All 13 tests execute inside an interactive transaction with rollback; zero test data persists.
- **Fail-Closed:** Returns nonzero exit code (1) if any assertion fails.

---

## 5. Verification Criteria Checklist

- [ ] **LIVE-01:** `pulsepilot_app` can SELECT active test revocation records.
- [ ] **LIVE-02:** `pulsepilot_app` can INSERT new revocation records.
- [ ] **LIVE-03:** `pulsepilot_app` UPDATE rejected with verified SQLSTATE `42501`.
- [ ] **LIVE-04:** `pulsepilot_app` DELETE rejected with verified SQLSTATE `42501`.
- [ ] **LIVE-05:** `pulsepilot_app` TRUNCATE rejected with verified SQLSTATE `42501`.
- [ ] **LIVE-06:** `anon` SELECT / INSERT rejected with verified SQLSTATE `42501`.
- [ ] **LIVE-07:** `authenticated` SELECT rejected with verified SQLSTATE `42501`.
- [ ] **LIVE-08:** `pulsepilot_app` EXECUTE cleanup function rejected with verified SQLSTATE `42501`.
- [ ] **LIVE-09a:** Maintenance role under FORCE RLS leaves active records untouched (0 rows affected).
- [ ] **LIVE-09b:** Maintenance role under FORCE RLS deletes expired record (1 row affected).
- [ ] **LIVE-10:** Authorized `service_role` executes cleanup function successfully.
- [ ] **LIVE-11 (Dual Proof):** Injected hostile `public.now()` shadow function: active token preserved (`COUNT = 1`) AND expired token deleted (`COUNT = 0`).
- [ ] **LIVE-12:** `service_role` denied direct table operations (SQLSTATE `42501`).
- [ ] **LIVE-13:** `pulsepilot_app` cannot ALTER or hijack maintenance function (SQLSTATE `42501`).
- [ ] **Clean Exit:** Transaction rolls back; zero test records persist on staging.
