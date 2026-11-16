# PULSEPILOT AI — STAGING ENVIRONMENT PROVISIONING & DBA RUNBOOK

**Document Reference:** `STAGING-ENV-SETUP-V1`  
**Security Architect:** Principal Cloud Infrastructure Engineer & Database Architect  
**Classification:** Infrastructure Provisioning, Environment Isolation & Verification Guide  
**Status:** **READY FOR USER EXECUTION**  
**Date:** November 16, 2026  

---

## 1. Executive Summary & Infrastructure Baseline

To satisfy the requirements of **SEC-03.1** without risking production state, PulsePilot AI enforces an **air-gapped staging database architecture**.

### 1.1 Production Infrastructure Under Protection
- **Production Supabase Project:** `czqhiuidekvozuoqdmyd`
- **Production Database Host:** `db.czqhiuidekvozuoqdmyd.supabase.co:5432`
- **Production Vercel Deployment:** `https://pulse-pilot-two.vercel.app/`
- **Safety Directive:** Under no circumstances may SQL migrations, inspection queries, or role mutations be executed against `czqhiuidekvozuoqdmyd`.

### 1.2 Staging Architecture Requirements
- **Independent Project:** Dedicated Supabase project hosted on isolated cloud infrastructure.
- **Dedicated Credentials:** Unique database passwords, service role keys, and API keys.
- **No Production Data Copy:** Clean schema initialized via code migrations; zero production user records or audit history copied.
- **Zero Shared State:** Separate Flagsmith feature flag environment and isolated session HMAC signing secrets.

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

Create a local environment file `.env.staging` (or set shell environment variables) using the template from `.env.staging.example`:

```bash
# Set environment variables in your terminal:
export STAGING_DATABASE_URL="postgresql://postgres:<YOUR_STAGING_PASSWORD>@db.<STAGING_PROJECT_REF>.supabase.co:5432/postgres"
export STAGING_DIRECT_URL="postgresql://postgres:<YOUR_STAGING_PASSWORD>@db.<STAGING_PROJECT_REF>.supabase.co:5432/postgres"

export NEXT_PUBLIC_SUPABASE_URL="https://<STAGING_PROJECT_REF>.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="<YOUR_STAGING_ANON_KEY>"
export SUPABASE_SERVICE_ROLE_KEY="<YOUR_STAGING_SERVICE_ROLE_KEY>"

# Separate random 32+ char secret for staging session tokens
export SESSION_SECRET="staging_sec_token_random_secret_string_32chars_min"

# Staging Flagsmith feature flag environment
export NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY="<YOUR_STAGING_FLAGSMITH_CLIENT_KEY>"
export FLAGSMITH_SERVER_SIDE_API_KEY="<YOUR_STAGING_FLAGSMITH_SERVER_KEY>"
```

> **Security Rule:** Never check `.env.staging` into Git. `.gitignore` is pre-configured to ignore all `.env*` files except `.env.example` and `.env.staging.example`.

---

## 4. Staging Database Initialization Sequence

Execute the following initialization commands in order:

### Step 4.1: Verify Staging Target Isolation
Run the automated safety gate to guarantee the target is not production:
```bash
node --experimental-strip-types scripts/run-staging-dba-tests.ts
```
- **Expected Output:** Confirms non-production project reference and outputs sanitized parameters.
- **Fail-Safe:** If `czqhiuidekvozuoqdmyd` is detected, execution aborts immediately.

### Step 4.2: Provision Least-Privilege Roles (Stage 3)
In the Supabase SQL Editor of your **staging project**, execute the provisioning script from [`DATABASE_ROLE_PROVISIONING_V2.md`](file:///Users/shubham/Desktop/pulsepilot/DATABASE_ROLE_PROVISIONING_V2.md):
- Creates `pulsepilot_app` with `LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS`.
- Creates `pulsepilot_reporting` as read-only.
- Configures schema grants.

### Step 4.3: Apply Base and Hardened Migrations (Prisma)
Apply all repository migrations in sequence against staging:
```bash
npm run prisma:migrate:staging
```
This executes `npx prisma migrate deploy` strictly targeted at `STAGING_DATABASE_URL`:
1. `20261116000000_init_production_schema` (10 base application tables)
2. `20261116010000_create_revoked_tokens` (Hardened persistent revocation storage)
3. `20261116020000_audit_log_truncate_protection` (Statement-level TRUNCATE trigger)

### Step 4.4: Apply PostgREST Shields & Operational RLS (Stage 4)
In the staging Supabase SQL Editor, execute the policy script from [`RLS_POLICY_MATRIX.md`](file:///Users/shubham/Desktop/pulsepilot/RLS_POLICY_MATRIX.md):
- Enables `FORCE ROW LEVEL SECURITY` on all tables.
- Revokes all permissions from `anon` and `authenticated`.
- Defines explicit operational policies for `pulsepilot_app`.

---

## 5. Live PostgreSQL SEC-03.1 Acceptance Verification

Once the database is initialized, execute the live acceptance test suite:

```bash
# Execute the live 13-test transaction suite in psql:
psql "$STAGING_DATABASE_URL" -f scripts/staging-dba-execution.sql
```

### Verification Criteria Checklist:
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

---

## 6. Rollback Procedures & Safeguards

If a rollback is required during staging testing:
1. **Never Automate Rollback:** Destructive table drops must be authorized by a human DBA.
2. **Session Resurrection Warning:** Dropping `public.revoked_tokens` will resurrect any sessions that were revoked prior to the drop until their `exp` claim lapses.
3. **Execution Script:** Use the manual rollback script documented in Section 5 of [`SEC03_REVOCATION_FINAL_SECURITY_SIGNOFF.md`](file:///Users/shubham/Desktop/pulsepilot/SEC03_REVOCATION_FINAL_SECURITY_SIGNOFF.md).

