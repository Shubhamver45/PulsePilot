/**
 * PulsePilot AI — Hardened Staging Prisma Migration Runner
 * 
 * Safely executes Prisma migrations against the dedicated STAGING database.
 * 
 * Strict Security Rules:
 * 1. Requires mandatory STAGING_PROJECT_REF with format validation.
 * 2. Requires mandatory STAGING_DATABASE_URL and STAGING_DIRECT_URL.
 * 3. Strictly prohibits silent fallback to DATABASE_URL or DIRECT_URL.
 * 4. Parses and validates both URLs independently; requires both to target the same staging project.
 * 5. Rejects non-Supabase endpoints and rejects production references (czqhiuidekvozuoqdmyd).
 * 6. Enforces TLS certificate verification (sslmode != disable).
 * 7. Redacts all passwords and credentials in logs (zero secret leakage).
 * 8. Performs read-only server identity and prerequisite role check before migration.
 * 9. Uses child-process-only overrides for Prisma to ensure strict target binding.
 */

import { spawnSync } from "child_process";
import {
  loadAndValidateStagingEnv,
  verifyServerSession,
  createStagingPrismaClient,
  type ServerIdentityRecord,
} from "./staging-safety.ts";

async function main() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — HARDENED STAGING PRISMA MIGRATION RUNNER          ");
  console.log("=====================================================================\n");

  // 1. Environment & URL Validation Gate
  let config;
  try {
    config = loadAndValidateStagingEnv();
  } catch (err: any) {
    console.error(`❌ [CRITICAL SAFETY HALT] ${err.message}\n`);
    console.error("Rule Enforcement: Silent fallback to DATABASE_URL / DIRECT_URL is strictly prohibited.");
    console.error("Ensure .env.staging contains:");
    console.error("  STAGING_PROJECT_REF=\"<your-staging-project-ref>\"");
    console.error("  STAGING_DATABASE_URL=\"postgresql://postgres:<PASS>@db.<staging-ref>.supabase.co:5432/postgres\"");
    console.error("  STAGING_DIRECT_URL=\"postgresql://postgres:<PASS>@db.<staging-ref>.supabase.co:5432/postgres\"\n");
    process.exit(1);
  }

  console.log("Staging Configuration Sanitized Inspection (Zero Secret Leakage):");
  console.log(`  • Staging Project Ref: ${config.stagingProjectRef}`);
  console.log(`  • Pooled Target Host:  ${config.dbEndpoint.hostname}:${config.dbEndpoint.port}`);
  console.log(`  • Direct Target Host:  ${config.directEndpoint.hostname}:${config.directEndpoint.port}`);
  console.log(`  • Database Name:       ${config.directEndpoint.database}`);
  console.log(`  • Database User:       ${config.directEndpoint.username}`);
  console.log(`  • Direct Target URL:   ${config.directEndpoint.sanitizedUrl}\n`);

  // 2. Pre-Migration Live Server Session & Prerequisite Role Verification
  console.log("🔍 Connecting to staging direct endpoint to verify server session and prerequisites...");

  // Use the exact validated direct URL for preflight via dedicated factory
  const preflightPrisma = createStagingPrismaClient(config.directEndpoint);

  try {
    const rows = await preflightPrisma.$queryRawUnsafe<
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

    if (!rows || rows.length === 0) {
      console.error("❌ Failed to query connected server identity.");
      await preflightPrisma.$disconnect();
      process.exit(1);
    }

    const serverRow = rows[0];
    const serverRecord: ServerIdentityRecord = {
      current_database: serverRow.current_database,
      current_user: serverRow.current_user,
      session_user: serverRow.session_user,
      inet_server_addr: serverRow.inet_server_addr,
      inet_server_port: serverRow.inet_server_port,
      version: serverRow.version,
    };

    const sessionVerification = verifyServerSession(serverRecord, config.directEndpoint);

    console.log("✅ Actual Connected Server Session Verified:");
    console.log(`  • current_database(): ${serverRow.current_database}`);
    console.log(`  • current_user:       ${serverRow.current_user}`);
    console.log(`  • session_user:       ${serverRow.session_user}`);
    console.log(`  • inet_server_addr(): ${serverRow.inet_server_addr || "n/a (managed host)"}`);
    console.log(`  • inet_server_port(): ${serverRow.inet_server_port || "5432"}`);
    console.log(`  • pg_version:         ${serverRow.version.split(" on ")[0]}`);

    for (const warning of sessionVerification.warnings) {
      console.log(`  ℹ️  [NOTICE] ${warning}`);
    }

    // Check prerequisite role: pulsepilot_app must exist before migration
    const roleCheck = await preflightPrisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsepilot_app') AS exists`
    );

    if (!roleCheck || !roleCheck[0]?.exists) {
      console.error("\n❌ [PREREQUISITE CHECK FAILED: MISSING pulsepilot_app ROLE]");
      console.error("The application runtime role 'pulsepilot_app' does not exist in staging.");
      console.error("Action Required: Execute Step 2 of scripts/staging-dba-execution.sql before deploying migrations.\n");
      await preflightPrisma.$disconnect();
      process.exit(1);
    }

    console.log("✅ Prerequisite role 'pulsepilot_app' confirmed present in staging database.\n");
    await preflightPrisma.$disconnect();
  } catch (err: any) {
    await preflightPrisma.$disconnect().catch(() => {});
    console.error(`❌ [STAGING PREFLIGHT CONNECTION FAILED]: ${err.message}\n`);
    console.error("Could not complete preflight checks on staging database.");
    console.error("Verify staging credentials, database readiness, and network access.\n");
    process.exit(1);
  }

  // 3. Child-Process Migration Execution with Strict Environment Isolation
  console.log("🚀 Executing 'prisma migrate deploy' with scoped staging datasource overrides...\n");

  // Construct isolated environment dictionary for the child process.
  // Overrides DATABASE_URL and DIRECT_URL strictly to the exact validated staging endpoints.
  const childEnv = {
    ...process.env,
    DATABASE_URL: config.stagingDatabaseUrl,
    DIRECT_URL: config.stagingDirectUrl,
    PRISMA_HIDE_UPDATE_MESSAGE: "true",
  };

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: childEnv,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`\n❌ Prisma staging migration failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }

  console.log("\n=====================================================================");
  console.log("   ✅ STAGING PRISMA MIGRATIONS APPLIED SUCCESSFULLY                 ");
  console.log("=====================================================================\n");
}

main().catch((err) => {
  console.error("Staging migration runner fatal error:", err);
  process.exit(1);
});
