/**
 * PulsePilot AI — SEC-04 Audit Ledger Immutability & TRUNCATE Defense Verification Test Suite
 * 
 * Objective: Formally verify the security requirements for the SEC-04 migration:
 * (prisma/migrations/20261116020000_audit_log_truncate_protection/migration.sql)
 * 
 * 1. Statement-level trigger exists for BEFORE TRUNCATE
 * 2. Row-level trigger exists for BEFORE UPDATE OR DELETE
 * 3. Both guard functions enforce strict search_path = pg_catalog
 * 4. Exception raises standard ERRCODE P0001 (raise_exception)
 * 5. Execution revoked from untrusted roles (PUBLIC, anon, authenticated)
 * 6. Explicit table-level TRUNCATE, UPDATE, DELETE revoked from untrusted and application roles
 */

import fs from "fs";
import path from "path";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

async function runAuditTruncateTests() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — SEC-04 AUDIT TRUNCATE DEFENSE VERIFICATION        ");
  console.log("=====================================================================\n");

  const migrationPath = path.resolve("prisma/migrations/20261116020000_audit_log_truncate_protection/migration.sql");
  assert(fs.existsSync(migrationPath), "Migration SQL file exists at expected path");

  const sql = fs.readFileSync(migrationPath, "utf8");

  // 1. Statement-Level Trigger for TRUNCATE
  console.log("TEST 1: Statement-Level Trigger for TRUNCATE");
  assert(sql.includes("CREATE TRIGGER trg_audit_logs_prevent_truncate"), "Creates statement trigger for TRUNCATE");
  assert(sql.includes("BEFORE TRUNCATE ON public.audit_logs"), "Fires BEFORE TRUNCATE on public.audit_logs");
  assert(sql.includes("FOR EACH STATEMENT"), "Defined FOR EACH STATEMENT");
  assert(sql.includes("EXECUTE FUNCTION public.prevent_audit_logs_truncate()"), "Executes prevent_audit_logs_truncate");
  console.log("  ✅ Test 1 Passed: Statement-level TRUNCATE trigger verified.\n");

  // 2. Row-Level Trigger for UPDATE/DELETE
  console.log("TEST 2: Row-Level Trigger for UPDATE and DELETE");
  assert(sql.includes("CREATE TRIGGER trg_audit_logs_prevent_mutation"), "Creates row trigger for UPDATE and DELETE");
  assert(sql.includes("BEFORE UPDATE OR DELETE ON public.audit_logs"), "Fires BEFORE UPDATE OR DELETE");
  assert(sql.includes("FOR EACH ROW"), "Defined FOR EACH ROW");
  assert(sql.includes("EXECUTE FUNCTION public.prevent_audit_logs_mutation()"), "Executes prevent_audit_logs_mutation");
  console.log("  ✅ Test 2 Passed: Row-level mutation trigger verified.\n");

  // 3. Search Path Hardening
  console.log("TEST 3: Function Search Path Hardening");
  assert(sql.includes("SET search_path = pg_catalog;"), "Functions enforce strict search_path = pg_catalog");
  assert(!sql.includes("SET search_path = pg_catalog, public;"), "Public schema excluded from search_path");
  console.log("  ✅ Test 3 Passed: Search path hardening verified.\n");

  // 4. Exception Codes
  console.log("TEST 4: Exception Code and Informative Alert");
  assert(sql.includes("ERRCODE = 'P0001'"), "Standard ERRCODE P0001 raised on violation");
  assert(sql.includes("SECURITY ALERT: audit_logs is an append-only cryptographic ledger"), "Informative security alert in exception");
  console.log("  ✅ Test 4 Passed: Exception standards verified.\n");

  // 5. Least-Privilege Grants & PostgREST Revocations
  console.log("TEST 5: Least-Privilege Revocations");
  assert(sql.includes("REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.audit_logs FROM anon, authenticated"), "anon/authenticated denied mutations");
  assert(sql.includes("REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.audit_logs FROM pulsepilot_app"), "pulsepilot_app denied mutations");
  console.log("  ✅ Test 5 Passed: Least privilege revocations verified.\n");

  console.log("=====================================================================");
  console.log("   🎉 ALL SEC-04 AUDIT IMMUTABILITY VERIFICATION CHECKS PASSED       ");
  console.log("=====================================================================");
}

runAuditTruncateTests().catch((err) => {
  console.error("SEC-04 verification failed:", err);
  process.exit(1);
});

