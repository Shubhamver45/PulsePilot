# PULSEpilot AI — Database Privilege Matrix
## Least-Privilege Role Architecture & Access Control Specification

**Document Version:** 1.0.0 (Production Security Audit)  
**Security Classification:** Highly Confidential / Architecture Specification  
**Database Engine:** PostgreSQL 15+ / Supabase Managed Cloud  

---

## 1. Overview of Defined Roles

PulsePilot AI separates database responsibilities across three distinct roles:

1. **`pulsepilot_migration` (or Supabase `postgres` / Table Owner):**
   - Strictly reserved for deployment pipelines (CI/CD) and running `prisma migrate deploy`.
   - Never used for normal application traffic or user requests.
   - Holds schema ownership and DDL execution rights.

2. **`pulsepilot_app` (Application Runtime Role):**
   - The single role used by Next.js serverless route handlers (`DATABASE_URL`).
   - Restricted to minimum required Data Manipulation Language (DML) privileges.
   - Zero DDL privileges (cannot `DROP`, `ALTER`, `CREATE`, or `TRUNCATE`).
   - Strictly `SELECT` and `INSERT` on `audit_logs`.

3. **`pulsepilot_reporting` (Read-Only Audit & Analytics Role):**
   - Optional dedicated read-only role for offline compliance reviews, auditors, or external data visualization tools.
   - Granted strictly `SELECT` on designated reporting tables.
   - Denied all write, mutation, or configuration access.

---

## 2. Table-by-Table Privilege Matrix

| Object Name | Object Type | Migration Role (`pulsepilot_migration`) | Runtime Application Role (`pulsepilot_app`) | Reporting Role (`pulsepilot_reporting`) | Justification / Security Boundary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`_prisma_migrations`** | Internal Table | **Full Access** (`ALL`) | **DENY ALL** | **DENY ALL** | Internal migration ledger. Runtime application must never read or modify. |
| **`organizations`** | Business Table | **Full Access** (`ALL`) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` | Workspace boundaries. Application creates/updates workspaces. Deletions strictly gated. |
| **`users`** | Business Table | **Full Access** (`ALL`) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` (Masked) | User profiles and session mapping. User deletion handled via soft-disable. |
| **`projects`** | Business Table | **Full Access** (`ALL`) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` | Project workspace configurations and Flagsmith environment keys. |
| **`experiments`** | Business Table | **Full Access** (`ALL`) | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT` | Core experimentation state, statuses, rationales, and winning variant metadata. |
| **`experiment_variants`** | Business Table | **Full Access** (`ALL`) | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT` | Experiment multivariate variations, traffic splits, and JSON feature values. |
| **`metrics`** | Business Table | **Full Access** (`ALL`) | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT` | Primary and guardrail metric definitions. |
| **`telemetry_events`** | Business Table | **Full Access** (`ALL`) | `SELECT`, `INSERT` | `SELECT` | Immutable event log. Deduplication enforced via unique composite `dedupKey`. No `UPDATE`/`DELETE`. |
| **`agent_runs`** | Business Table | **Full Access** (`ALL`) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` | Records Gemini AI agent prompts, structured plans, token metrics, and run status. |
| **`audit_logs`** | Cryptographic Ledger | **Full Access** (`ALL`) | **`SELECT`, `INSERT` ONLY** | `SELECT` | Append-only SHA-256 hash-chained ledger. **STRICTLY DENY `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER`**. |

---

## 3. Operations & DDL Privilege Matrix

| Operation / Privilege Category | Migration Role (`pulsepilot_migration`) | Runtime Role (`pulsepilot_app`) | Reporting Role (`pulsepilot_reporting`) | Security Enforcement Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **`SELECT`** | Allowed (All Tables) | Allowed (Required Tables) | Allowed (Reporting Tables) | Table GRANTs |
| **`INSERT`** | Allowed (All Tables) | Allowed (Required Tables) | **DENY** | Table GRANTs |
| **`UPDATE`** | Allowed (All Tables) | Allowed on business tables; **BLOCKED on `audit_logs` & `telemetry_events`** | **DENY** | Table GRANTs + Trigger `trg_audit_log_immutable` |
| **`DELETE`** | Allowed (All Tables) | Allowed on draft experiments; **BLOCKED on `audit_logs` & `telemetry_events`** | **DENY** | Table GRANTs + Trigger `trg_audit_log_immutable` |
| **`TRUNCATE`** | Allowed (Controlled) | **DENY ALL** | **DENY ALL** | Omission from table GRANTs + Trigger `trg_audit_log_prevent_truncate` |
| **`CREATE TABLE`** | Allowed (public schema) | **DENY** | **DENY** | `REVOKE CREATE ON SCHEMA public` |
| **`ALTER TABLE`** | Allowed (public schema) | **DENY** | **DENY** | Table ownership restricted to Migration role |
| **`DROP TABLE`** | Allowed (Controlled) | **DENY** | **DENY** | Table ownership restricted to Migration role |
| **`DISABLE TRIGGER`** | Allowed (Superuser/Owner) | **DENY** | **DENY** | Non-owner cannot alter table triggers |
| **`CREATE ROLE`** | Allowed (Admin) | **DENY** | **DENY** | `rolcreaterole: false` |
| **`BYPASS RLS`** | Allowed (Migration Only) | **DENY** (`rolbypassrls: false`) | **DENY** (`rolbypassrls: false`) | PostgreSQL Role Attribute |
| **`pg_advisory_xact_lock`** | Allowed | Allowed | **DENY** | Default `PUBLIC` execution |

---

## 4. Supabase Exposure & PostgREST Shielding

| Role | PostgREST Direct Access (`/rest/v1/*`) | Public API Exposure Status | Recommended Policy |
| :--- | :--- | :--- | :--- |
| **`anon` (Public Frontend)** | Currently Active (`HTTP 200`) | **CRITICAL VULNERABILITY** | **REVOKE ALL** permissions or enable RLS default deny. |
| **`authenticated` (JWT)** | Currently Active (`HTTP 200`) | **CRITICAL VULNERABILITY** | Enable RLS scoped strictly to `auth.uid() = user_id`. |
| **`service_role` (Backend)** | Allowed (Internal) | Restricted to Server Route Handlers | Keep secret on server; never expose to client bundles. |
| **`pulsepilot_app` (Prisma)** | Direct TCP / Supavisor Only (Port 5432/6543) | Not exposed via HTTP PostgREST | Protected by database password and connection firewall. |

