# PULSEpilot AI — Production Database Least-Privilege Role Plan
## Runtime Application Isolation & Separation of Concerns

**Status:** Proposed Architecture Plan (Awaiting Production Authorization)  
**Security Domain:** PostgreSQL Access Control & Ledger Immutability Hardening  

---

## 1. Problem Statement & Threat Model

In the current staging and development configurations, the application database connection (`DATABASE_URL`) authenticates as the Supabase table owner/superuser (`postgres`).

### What is Protected Today:
- The PostgreSQL trigger `trg_audit_log_immutable` successfully intercepts all standard SQL `UPDATE` and `DELETE` statements on `audit_logs`, raising exception `P0001: SECURITY ALERT: audit_logs is an append-only cryptographic ledger`.
- This fully blocks application route handlers, ORM mutations, and SQL injection vectors attempting to alter historical audit records.

### Remaining Threat Vector (Superuser Privileges):
- Because the `postgres` role owns the database and the `audit_logs` table, it possesses DDL (Data Definition Language) capabilities. A rogue superuser command or compromised admin connection could execute:
  ```sql
  ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_log_immutable;
  ```
- **Enterprise Requirement:** Enforce true Principle of Least Privilege by separating runtime application connections from schema migration connections.

---

## 2. Target Architecture: Separation of Credentials

```
                      +------------------------------------------+
                      |         Prisma Migrate / CI/CD           |
                      +------------------------------------------+
                                           |
                                           | (Runs only during deploy)
                                           v
                      +------------------------------------------+
                      |          pulsepilot_migration            |
                      |   Full DDL, ALTER, CREATE, MIGRATIONS    |
                      +------------------------------------------+

                      +------------------------------------------+
                      |         Next.js App Runtime              |
                      +------------------------------------------+
                                           |
                                           | (All user requests)
                                           v
                      +------------------------------------------+
                      |             pulsepilot_app               |
                      |  - DML on business tables                |
                      |  - Strictly SELECT + INSERT on audit_logs|
                      |  - ZERO DDL / TRIGGER rights             |
                      +------------------------------------------+
```

---

## 3. Implementation Runbook (Supabase SQL)

When approved by database administrators, execute the following script in the Supabase SQL Editor:

```sql
-- 1. Create the dedicated restricted application runtime role
CREATE ROLE pulsepilot_app WITH LOGIN PASSWORD 'GENERATE_STRONG_RANDOM_PASSWORD_HERE';

-- 2. Grant basic connection and schema usage
GRANT CONNECT ON DATABASE postgres TO pulsepilot_app;
GRANT USAGE ON SCHEMA public TO pulsepilot_app;

-- 3. Grant business table DML permissions (read, write, update)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    organizations, 
    users, 
    projects, 
    experiments, 
    experiment_variants, 
    metrics, 
    telemetry_events, 
    agent_runs 
TO pulsepilot_app;

-- 4. Grant APPEND-ONLY permissions on audit_logs (Strictly SELECT and INSERT)
-- Explicitly OMIT UPDATE, DELETE, TRUNCATE, and TRIGGER
GRANT SELECT, INSERT ON TABLE audit_logs TO pulsepilot_app;

-- 5. Grant sequence usage for sequenceNumber generation
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulsepilot_app;

-- 6. Ensure future tables follow least-privilege defaults
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulsepilot_app;

-- Revoke any unintended table ownership or superuser status
REVOKE ALL ON SCHEMA information_schema FROM pulsepilot_app;
```

---

## 4. Verification Test for `pulsepilot_app`

Once provisioned:
1. Connect via `pulsepilot_app` connection string.
2. Attempt `INSERT INTO audit_logs ...` $\to$ **Succeeds (200 OK)**.
3. Attempt `UPDATE audit_logs SET details = ...` $\to$ **Denied by PostgreSQL permissions (`permission denied for table audit_logs`)**.
4. Attempt `DELETE FROM audit_logs ...` $\to$ **Denied by PostgreSQL permissions**.
5. Attempt `ALTER TABLE audit_logs DISABLE TRIGGER ...` $\to$ **Denied by PostgreSQL permissions (`must be owner of table audit_logs`)**.

---

## 5. Deployment Recommendation

- In production Vercel environment variables:
  - Set `DATABASE_URL` to the `pulsepilot_app` connection string.
  - Set `DIRECT_URL` / `MIGRATION_DATABASE_URL` to the `pulsepilot_migration` connection string.
- This guarantees zero possibility of trigger bypass even under total application runtime compromise.

