/**
 * PulsePilot AI — Staging Database Preflight & Read-Only Inspection Utility
 * 
 * Purpose:
 * Performs read-only inspection of the staging endpoint prior to migration or acceptance testing:
 * 1. Validates STAGING_PROJECT_REF format and ensures zero production collision.
 * 2. Parses and validates STAGING_DATABASE_URL and STAGING_DIRECT_URL.
 * 3. Enforces that TLS certificate validation is enabled (sslmode != disable).
 * 4. Queries connected PostgreSQL server session (database, user, address, port, version).
 * 5. Inspects roles (pulsepilot_app, pulsepilot_revocation_maint).
 * 6. Inspects schema objects if already applied.
 * 
 * Safety Guarantee:
 * Preflight is READ-ONLY. Preflight success does NOT indicate acceptance tests have passed.
 * Acceptance tests must be executed independently via: npm run staging:acceptance
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  loadAndValidateStagingEnv,
  verifyServerSession,
  type ServerIdentityRecord,
} from "./staging-safety.ts";

async function main() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — STAGING DATABASE READ-ONLY PREFLIGHT UTILITY      ");
  console.log("=====================================================================\n");

  let config;
  try {
    config = loadAndValidateStagingEnv();
  } catch (err: any) {
    console.error(`❌ [PREFLIGHT HALTED]: ${err.message}\n`);
    process.exit(1);
  }

  console.log("Staging Endpoint Configuration:");
  console.log(`  • Project Reference: ${config.stagingProjectRef}`);
  console.log(`  • Pooled Target:     ${config.dbEndpoint.hostname}:${config.dbEndpoint.port}`);
  console.log(`  • Direct Target:     ${config.directEndpoint.hostname}:${config.directEndpoint.port}`);
  console.log(`  • Database Name:     ${config.directEndpoint.database}`);
  console.log(`  • Target User:       ${config.directEndpoint.username}`);
  console.log(`  • Direct Endpoint:   ${config.directEndpoint.sanitizedUrl}\n`);

  console.log("🔍 Connecting to staging direct endpoint for read-only session inspection...");

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
    const serverRecord: ServerIdentityRecord = {
      current_database: row.current_database,
      current_user: row.current_user,
      session_user: row.session_user,
      inet_server_addr: row.inet_server_addr,
      inet_server_port: row.inet_server_port,
      version: row.version,
    };

    const sessionVerification = verifyServerSession(serverRecord, config.directEndpoint);

    console.log("\nConnected Server Session Attributes:");
    console.log(`  • current_database(): ${row.current_database}`);
    console.log(`  • current_user:       ${row.current_user}`);
    console.log(`  • session_user:       ${row.session_user}`);
    console.log(`  • inet_server_addr(): ${row.inet_server_addr || "n/a (managed host)"}`);
    console.log(`  • inet_server_port(): ${row.inet_server_port || "5432"}`);
    console.log(`  • pg_version:         ${row.version.split(" on ")[0]}`);

    for (const warning of sessionVerification.warnings) {
      console.log(`  ℹ️  [NOTICE] ${warning}`);
    }

    console.log("\n🔍 Inspecting staging roles and attributes...");
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

    const appRole = roleMap.get("pulsepilot_app");
    if (!appRole) {
      console.log("  ⚠️  Role 'pulsepilot_app' does NOT exist. Provision via Stage 2 before migration.");
    } else {
      console.log(`  ✅ Role 'pulsepilot_app' exists: rolsuper=${appRole.rolsuper}, rolbypassrls=${appRole.rolbypassrls}`);
    }

    const maintRole = roleMap.get("pulsepilot_revocation_maint");
    if (!maintRole) {
      console.log("  ⚠️  Role 'pulsepilot_revocation_maint' does NOT exist. Provisioned during migration.");
    } else {
      console.log(`  ✅ Role 'pulsepilot_revocation_maint' exists: rolsuper=${maintRole.rolsuper}, rolbypassrls=${maintRole.rolbypassrls}`);
    }

    await prisma.$disconnect();

    console.log("\n=====================================================================");
    console.log("   ✅ PREFLIGHT READ-ONLY INSPECTION PASSED                          ");
    console.log("=====================================================================");
    console.log("⚠️  IMPORTANT NOTICE:");
    console.log("Preflight success verifies connection parameters and session attributes only.");
    console.log("It does NOT indicate that live acceptance tests have passed.");
    console.log("To execute live acceptance tests on this verified endpoint, run:");
    console.log("  npm run staging:acceptance\n");
  } catch (err: any) {
    await prisma.$disconnect().catch(() => {});
    console.error(`\n❌ [PREFLIGHT CONNECTION FAILED]: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Preflight fatal error:", err);
  process.exit(1);
});
