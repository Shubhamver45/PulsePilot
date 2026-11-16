/**
 * PulsePilot AI — Hardened Staging DBA Execution & Live Acceptance Runner
 * 
 * Safety Protocol:
 * 1. Requires mandatory STAGING_PROJECT_REF with format validation.
 * 2. Requires dedicated STAGING_DATABASE_URL and STAGING_DIRECT_URL.
 * 3. Rejects non-Supabase endpoints and rejects production references (czqhiuidekvozuoqdmyd).
 * 4. Strictly prohibits silent fallback to DATABASE_URL or DIRECT_URL.
 * 5. Redacts all passwords, secrets, and credentials in logs.
 * 6. Connects to the database and performs a live read-only server identity check:
 *    - current_database(), current_user, session_user, inet_server_addr, inet_server_port, version.
 * 7. Explicitly asserts that current_database() = 'postgres' is NOT treated as staging proof.
 * 8. Inspects prerequisite roles (pulsepilot_app, pulsepilot_revocation_maint) to confirm
 *    NOSUPERUSER and NOBYPASSRLS attributes before any acceptance operations.
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  loadAndValidateStagingEnv,
  verifyServerIdentity,
  type ServerIdentityRecord,
} from "./staging-safety.ts";

async function runStagingSafetyGate() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — SEC-03.2 HARDENED STAGING DBA ACCEPTANCE RUNNER    ");
  console.log("=====================================================================\n");

  // 1. Strict Enforcement & Environment Validation Gate
  let config;
  try {
    config = loadAndValidateStagingEnv();
  } catch (err: any) {
    console.error(`❌ [CRITICAL SAFETY HALT] ${err.message}\n`);
    console.error("Rule Enforcement: Silent fallback to DATABASE_URL is strictly prohibited.");
    console.error("Action Required: Configure .env.staging with isolated staging credentials:");
    console.error("  STAGING_PROJECT_REF=\"<your-staging-project-ref>\"");
    console.error("  STAGING_DATABASE_URL=\"postgresql://postgres:<PASSWORD>@db.<staging-ref>.supabase.co:5432/postgres\"");
    console.error("  STAGING_DIRECT_URL=\"postgresql://postgres:<PASSWORD>@db.<staging-ref>.supabase.co:5432/postgres\"\n");
    console.log("📄 Staging DBA SQL execution script is ready at: scripts/staging-dba-execution.sql");
    console.log("📄 Acceptance Runbook documented in: SEC03_REVOCATION_FINAL_SECURITY_SIGNOFF.md\n");
    process.exit(1);
  }

  console.log("Staging Target Sanitized Inspection (Zero Secret Leakage):");
  console.log(`  • Staging Project Ref: ${config.stagingProjectRef}`);
  console.log(`  • Pooled Target Host:  ${config.dbEndpoint.hostname}:${config.dbEndpoint.port}`);
  console.log(`  • Direct Target Host:  ${config.directEndpoint.hostname}:${config.directEndpoint.port}`);
  console.log(`  • Database Name:       ${config.directEndpoint.database}`);
  console.log(`  • Target User:         ${config.directEndpoint.username}`);
  console.log(`  • Target Endpoint:     ${config.directEndpoint.sanitizedUrl}\n`);

  // 2. Staging Script Existence Check
  const scriptPath = path.resolve("scripts/staging-dba-execution.sql");
  if (!fs.existsSync(scriptPath)) {
    console.error(`❌ [ERROR] Expected SQL script not found at ${scriptPath}`);
    process.exit(1);
  }
  console.log(`✅ Staging DBA execution script verified at: ${scriptPath}`);

  // 3. Connect to Staging Database & Execute Live Read-Only Server Identity Check
  console.log("\n🔍 Connecting to staging endpoint to perform read-only identity verification...");

  const prisma = new PrismaClient({
    datasources: {
      db: { url: config.stagingDirectUrl },
    },
    log: ["error"],
  });

  try {
    const identityRows = await prisma.$queryRawUnsafe<
      Array<{
        current_database: string;
        current_user: string;
        session_user: string;
        inet_server_addr: string | null;
        inet_server_port: number | null;
        version: string;
      }>
    >(
      `SELECT current_database(), current_user, session_user, inet_server_addr()::text, inet_server_port(), version()`
    );

    if (!identityRows || identityRows.length === 0) {
      console.error("❌ Failed to query connected server identity.");
      await prisma.$disconnect();
      process.exit(1);
    }

    const row = identityRows[0];
    const identityRecord: ServerIdentityRecord = {
      current_database: row.current_database,
      current_user: row.current_user,
      session_user: row.session_user,
      inet_server_addr: row.inet_server_addr,
      inet_server_port: row.inet_server_port,
      version: row.version,
      derived_project_ref: config.directEndpoint.projectRef,
    };

    const verification = verifyServerIdentity(identityRecord, config.stagingProjectRef);

    console.log("\n✅ Actual Connected Server Identity Verification Report:");
    console.log(`  • current_database(): ${row.current_database}`);
    console.log(`  • current_user:       ${row.current_user}`);
    console.log(`  • session_user:       ${row.session_user}`);
    console.log(`  • inet_server_addr(): ${row.inet_server_addr || "n/a (managed host)"}`);
    console.log(`  • inet_server_port(): ${row.inet_server_port || "5432"}`);
    console.log(`  • pg_version:         ${row.version.split(" on ")[0]}`);
    console.log(`  • derived_project_ref:${identityRecord.derived_project_ref}`);

    for (const warning of verification.warnings) {
      console.log(`  ⚠️  [NOTICE] ${warning}`);
    }

    // 4. Role and Privilege Inspection
    console.log("\n🔍 Inspecting staging database roles and attributes...");
    const roles = await prisma.$queryRawUnsafe<
      Array<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcanlogin: boolean;
      }>
    >(
      `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin 
       FROM pg_roles 
       WHERE rolname IN ('pulsepilot_app', 'pulsepilot_revocation_maint', 'postgres', 'service_role')
       ORDER BY rolname`
    );

    const roleMap = new Map(roles.map((r) => [r.rolname, r]));

    // Check pulsepilot_app
    const appRole = roleMap.get("pulsepilot_app");
    if (!appRole) {
      console.log("  ⚠️  Role 'pulsepilot_app' does not yet exist. Run Step 1 of scripts/staging-dba-execution.sql.");
    } else {
      console.log(`  ✅ Role 'pulsepilot_app': rolsuper=${appRole.rolsuper}, rolbypassrls=${appRole.rolbypassrls}, rolcanlogin=${appRole.rolcanlogin}`);
      if (appRole.rolsuper || appRole.rolbypassrls) {
        console.error("❌ [SECURITY ALERT] pulsepilot_app has rolsuper=true or rolbypassrls=true!");
        await prisma.$disconnect();
        process.exit(1);
      }
    }

    // Check pulsepilot_revocation_maint
    const maintRole = roleMap.get("pulsepilot_revocation_maint");
    if (!maintRole) {
      console.log("  ⚠️  Role 'pulsepilot_revocation_maint' does not yet exist. Will be provisioned during migration.");
    } else {
      console.log(`  ✅ Role 'pulsepilot_revocation_maint': rolsuper=${maintRole.rolsuper}, rolbypassrls=${maintRole.rolbypassrls}, rolcanlogin=${maintRole.rolcanlogin}`);
      if (maintRole.rolsuper || maintRole.rolbypassrls || maintRole.rolcanlogin) {
        console.error("❌ [SECURITY ALERT] pulsepilot_revocation_maint must have NOLOGIN, NOSUPERUSER, NOBYPASSRLS!");
        await prisma.$disconnect();
        process.exit(1);
      }
    }

    await prisma.$disconnect();

    console.log("\n=====================================================================");
    console.log("   ✅ STAGING ENDPOINT & ACTUAL IDENTITY FULLY VERIFIED              ");
    console.log("=====================================================================\n");
    console.log("Next Step: Execute the 5-stage DBA runbook via psql or Supabase SQL Editor:");
    console.log(`  psql "${config.directEndpoint.sanitizedUrl}" -f scripts/staging-dba-execution.sql\n`);
  } catch (err: any) {
    await prisma.$disconnect().catch(() => {});
    console.error(`\n❌ [STAGING CONNECTION FAILED]: ${err.message}\n`);
    console.error("Verify staging credentials, database readiness, and network access.");
    process.exit(1);
  }
}

runStagingSafetyGate().catch((err) => {
  console.error("Unexpected error in safety gate:", err);
  process.exit(1);
});
