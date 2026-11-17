# PULSEpilot AI — Database Role Provisioning & Least-Privilege Architecture V2
## Technical Specification for PostgreSQL Access Control Separation

**Document Version:** 2.0.0 (Remediation Architecture V2)  
**Security Domain:** Role Separation, Least-Privilege DML, & System Schema Preservation  
**Target Engine:** PostgreSQL 15+ / Supabase Managed Cloud  

---

## 1. Overview & Architecture of Distinct Roles

PulsePilot AI separates database operations across three distinct roles to guarantee that a compromise of the application runtime environment or an SQL injection vulnerability cannot alter schemas, disable triggers, drop tables, or wipe audit history.

```
                      +------------------------------------------+
                      |         Prisma Migrate / CI/CD           |
                      +------------------------------------------+
                                           |
                                           | (Runs only during deploy)
                                           v
                      +------------------------------------------+
                      |          pulsepilot_migration            |
                      |        (or Supabase 'postgres')          |
                      |   - Table Owner & DDL Controller         |
                      |   - Runs 'prisma migrate deploy'         |
                      +------------------------------------------+

                      +------------------------------------------+
                      |           Next.js App Runtime            |
                      |         (Vercel Serverless Handlers)     |
                      +------------------------------------------+
                                           |
                                           | (Handles all user traffic)
                                           v
                      +------------------------------------------+
                      |             pulsepilot_app               |
                      |  - Non-owner DML role                    |
                      |  - SELECT, INSERT, UPDATE, DELETE on app |
                      |  - Strictly SELECT + INSERT on ledgers   |
                      |  - ZERO DDL, ZERO TRUNCATE               |
                      |  - Cannot ALTER or DISABLE triggers      |
                      +------------------------------------------+

                      +------------------------------------------+
                      |     External Auditors & Analytics        |
                      +------------------------------------------+
                                           |
                                           | (Read-Only Offline Audits)
                                           v
                      +------------------------------------------+
                      |           pulsepilot_reporting           |
                      |  - Strictly SELECT on designated views   |
                      |  - ZERO mutation privileges              |
                      +------------------------------------------+
```

---

## 2. Role Attribute Security Profiles

| Attribute / Privilege | Migration Owner (`postgres` / `pulsepilot_migration`) | Runtime Application (`pulsepilot_app`) | Reporting Role (`pulsepilot_reporting`) | Security Rationale |
| :--- | :---: | :---: | :---: | :--- |
| **`rolsuper` (Superuser)** | Superuser (Cloud DBA) | **NO (`NOSUPERUSER`)** | **NO (`NOSUPERUSER`)** | Prevents system configuration tampering. |
| **`rolcreatedb` (Create DB)**| YES | **NO (`NOCREATEDB`)** | **NO (`NOCREATEDB`)** | Prevents rogue database provisioning. |
| **`rolcreaterole` (Create Role)**| YES | **NO (`NOCREATEROLE`)** | **NO (`NOCREATEROLE`)** | Prevents privilege escalation. |
| **`rolreplication`** | YES (or Cloud Default) | **NO (`NOREPLICATION`)** | **NO (`NOREPLICATION`)** | Prevents logical replication hijacking. |
| **`rolbypassrls`** | YES | **NO (`NOBYPASSRLS`)** | **NO (`NOBYPASSRLS`)** | Governed strictly by explicit RLS policies. |
| **Table Ownership** | **YES (Owner of all tables)**| **NO (Zero table ownership)** | **NO (Zero table ownership)** | Only table owners can disable triggers or drop tables. |
| **DDL (`CREATE TABLE`, etc.)**| Allowed in `public` | **DENIED** | **DENIED** | `REVOKE CREATE ON SCHEMA public FROM pulsepilot_app`. |
| **`TRUNCATE` Privilege** | Allowed (Controlled) | **STRICTLY DENIED** | **STRICTLY DENIED** | Runtime cannot wipe tables. |

---

## 3. Analysis of Prisma ORM Operations & System Privileges

### 3.1 Why V1's `REVOKE ALL ON SCHEMA pg_catalog` was Fatal
In Remediation Plan V1, lines 116–117 included:
```sql
REVOKE ALL ON SCHEMA pg_catalog FROM pulsepilot_app;
GRANT USAGE ON SCHEMA pg_catalog TO pulsepilot_app;
```
**Architectural Defect:**
In PostgreSQL, `pg_catalog` contains internal system catalogs, functions, operators, and type conversion casts.
- When `@prisma/client` connects via standard PostgreSQL protocols, it executes internal discovery queries against `pg_catalog` to detect server version, connection parameters, timezone handling, and custom enum definitions.
- Revoking standard privileges on `pg_catalog` strips default execution rights on internal PostgreSQL functions.
- **Rule for V2:** Do **not** alter privileges on `pg_catalog` or `information_schema`. PostgreSQL already restricts writes on these schemas by default; modifying their default read access breaks drivers and ORM connection pools.

### 3.2 Advisory Locks & Concurrency
PulsePilot AI enforces distributed concurrency on the audit ledger using PostgreSQL advisory locks:
```typescript
// src/lib/audit/audit-logger.ts (Line 132)
await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(847291047291047);`);
```
- In PostgreSQL, `pg_advisory_xact_lock(bigint)` is executable by role `PUBLIC` by default.
- It is a **transaction-scoped lock**: it acquires an exclusive lock on the 64-bit integer at invocation and automatically releases the lock when the surrounding SQL transaction commits or rolls back.
- **Connection Pool Compatibility:** Because the lock is transaction-scoped (`xact_lock`) and held strictly inside Prisma's `$transaction`, it is fully compatible with transaction-mode connection poolers (e.g. Supabase Supavisor on port 6543 or PgBouncer). Session-scoped locks (`pg_advisory_lock`) would fail under transaction pooling; transaction-scoped locks succeed reliably.

### 3.3 Sequence Number Generation
Audit log records require continuous sequence numbers:
```typescript
// src/lib/audit/audit-logger.ts (Line 139)
SELECT COALESCE(MAX("sequenceNumber"), 0) FROM audit_logs
```
Any auxiliary autoincrement sequences or future sequences in schema `public` require:
```sql
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulsepilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO pulsepilot_app;
```

---

## 4. Table-by-Table Privilege Matrix (DML vs. DDL)

| Object Name | Migration Role (`postgres`) | Runtime Role (`pulsepilot_app`) | Reporting Role (`pulsepilot_reporting`) | Security Boundary & Application Rationale |
| :--- | :---: | :---: | :---: | :--- |
| **`_prisma_migrations`** | `ALL` | **DENY ALL** | **DENY ALL** | Internal Prisma migration ledger. Runtime application has zero need to read or write. |
| **`organizations`** | `ALL` | `SELECT`, `INSERT`, `UPDATE` | `SELECT` | Workspace boundaries. Application creates/updates workspaces. `DELETE` denied. |
| **`users`** | `ALL` | `SELECT`, `INSERT`, `UPDATE` | `SELECT` (Masked) | User profiles and session mapping. `DELETE` denied. |
| **`projects`** | `ALL` | `SELECT`, `INSERT`, `UPDATE` | `SELECT` | Project workspace configurations and Flagsmith keys. `DELETE` denied. |
| **`experiments`** | `ALL` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT` | Core experimentation state, statuses, rationales, and winning variant metadata. |
| **`experiment_variants`** | `ALL` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT` | Multivariate variations, traffic splits, and JSON feature values. |
| **`metrics`** | `ALL` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT` | Metric definitions and guardrail thresholds. |
| **`telemetry_events`** | `ALL` | **`SELECT`, `INSERT` ONLY** | `SELECT` | Immutable event log. Deduplication enforced via unique composite `dedupKey`. **`UPDATE` and `DELETE` strictly DENIED**. |
| **`agent_runs`** | `ALL` | `SELECT`, `INSERT`, `UPDATE` | `SELECT` | Gemini AI agent prompts, structured plans, token metrics, and run status. `DELETE` denied. |
| **`audit_logs`** | `ALL` | **`SELECT`, `INSERT` ONLY** | `SELECT` | Append-only SHA-256 hash-chained ledger. **STRICTLY DENY `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER`**. |

---

## 5. Production-Ready SQL Role Provisioning Script V2

The following SQL script should be executed by the database administrator in the Supabase SQL Editor on staging/isolated environments:

```sql
-- =============================================================================
-- PULSEPILOT AI — ROLE PROVISIONING SCRIPT V2 (LEAST-PRIVILEGE ARCHITECTURE)
-- =============================================================================

BEGIN;

-- 1. Create pulsepilot_app as a restricted login role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') THEN
        -- Password placeholder to be replaced securely via DBA environment variables
        CREATE ROLE pulsepilot_app WITH 
            LOGIN 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            NOBYPASSRLS 
            PASSWORD :'PULSEPILOT_APP_PASSWORD';
    END IF;
END $$;

-- 2. Create pulsepilot_reporting as a read-only role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_reporting') THEN
        CREATE ROLE pulsepilot_reporting WITH 
            LOGIN 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            NOBYPASSRLS 
            PASSWORD :'PULSEPILOT_REPORTING_PASSWORD';
    END IF;
END $$;

-- 3. Database connection & Public schema usage
GRANT CONNECT ON DATABASE postgres TO pulsepilot_app;
GRANT CONNECT ON DATABASE postgres TO pulsepilot_reporting;

GRANT USAGE ON SCHEMA public TO pulsepilot_app;
GRANT USAGE ON SCHEMA public TO pulsepilot_reporting;

-- Explicitly revoke table creation in public schema (Zero DDL rights)
REVOKE CREATE ON SCHEMA public FROM pulsepilot_app;
REVOKE CREATE ON SCHEMA public FROM pulsepilot_reporting;

-- Grant usage on all PostgreSQL custom enum types
GRANT USAGE ON ALL TYPES IN SCHEMA public TO pulsepilot_app;
GRANT USAGE ON ALL TYPES IN SCHEMA public TO pulsepilot_reporting;

-- 4. Grant DML on business tables to pulsepilot_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    public.experiments, 
    public.experiment_variants, 
    public.metrics 
TO pulsepilot_app;

GRANT SELECT, INSERT, UPDATE ON TABLE 
    public.organizations, 
    public.users, 
    public.projects, 
    public.agent_runs 
TO pulsepilot_app;

-- 5. Grant APPEND-ONLY privileges on telemetry and audit ledgers
GRANT SELECT, INSERT ON TABLE public.telemetry_events TO pulsepilot_app;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO pulsepilot_app;

-- Strictly ensure NO UPDATE, DELETE, or TRUNCATE on audit and telemetry
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.telemetry_events FROM pulsepilot_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM pulsepilot_app;

-- 6. Grant read-only access to pulsepilot_reporting
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pulsepilot_reporting;
REVOKE SELECT ON TABLE public._prisma_migrations FROM pulsepilot_reporting;

-- 7. Grant sequence usage to pulsepilot_app
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulsepilot_app;

-- 8. Configure default privileges for future objects created by postgres/migration
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulsepilot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
GRANT USAGE, SELECT ON SEQUENCES TO pulsepilot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
GRANT SELECT ON TABLES TO pulsepilot_reporting;

COMMIT;
```

---

## 6. Verification & Privilege Auditing Commands

To verify that `pulsepilot_app` has the exact least-privilege boundary:

```sql
-- Verify Role Attributes: Ensure all superuser/admin flags are false
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
FROM pg_roles 
WHERE rolname IN ('pulsepilot_app', 'pulsepilot_reporting');

-- Verify Table Grants: Ensure zero DELETE or UPDATE on audit_logs
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'pulsepilot_app'
ORDER BY table_name, privilege_type;
```

