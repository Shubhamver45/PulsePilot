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
 * 5. Rejects non-Supabase endpoints and rejects production references (czqhiuidekvozuoqdmyd)
 *    before any database connection is instantiated.
 * 6. Enforces mandatory sslmode=verify-full for all staging connections.
 * 7. Redacts all passwords and credentials in logs (zero secret leakage).
 * 8. Performs read-only server identity and prerequisite role check before migration.
 * 9. Uses createStagingPrismaClient(config.directEndpoint) for preflight inspection.
 * 10. Guaranteed client teardown happens before process execution continues or terminates.
 * 11. Uses child-process-only overrides for Prisma to ensure strict target binding,
 *     passing exact validated URLs with sslmode=verify-full preserved without rewriting.
 * 12. Both preflight failure and child-process migration failure terminate nonzero.
 */

import { spawnSync, type SpawnSyncReturns } from "child_process";
import { PrismaClient } from "@prisma/client";
import {
  loadAndValidateStagingEnv,
  verifyServerSession,
  createStagingPrismaClient,
  type ServerIdentityRecord,
  type StagingEnvironmentConfig,
  type ValidatedStagingEndpoint,
} from "./staging-safety.ts";

export interface MigrationRunnerOptions {
  configOverride?: StagingEnvironmentConfig;
  envOverrides?: Record<string, string | undefined>;
  spawnPrismaFn?: (cmd: string, args: string[], options: any) => { status: number | null };
  prismaClientFactory?: (endpoint: ValidatedStagingEndpoint) => PrismaClient;
}

export async function runStagingMigration(options: MigrationRunnerOptions = {}): Promise<{
  success: boolean;
  stagingProjectRef: string;
  directUrlUsed: string;
  databaseUrlUsed: string;
}> {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — HARDENED STAGING PRISMA MIGRATION RUNNER          ");
  console.log("=====================================================================\n");

  // 1. Environment & URL Validation Gate
  // Production collision and invalid configurations are rejected BEFORE any connection is attempted
  const config = options.configOverride || loadAndValidateStagingEnv(options.envOverrides);

  console.log("Staging Configuration Sanitized Inspection (Zero Secret Leakage):");
  console.log(`  • Staging Project Ref: ${config.stagingProjectRef}`);
  console.log(`  • Pooled Target Host:  ${config.dbEndpoint.hostname}:${config.dbEndpoint.port}`);
  console.log(`  • Direct Target Host:  ${config.directEndpoint.hostname}:${config.directEndpoint.port}`);
  console.log(`  • Database Name:       ${config.directEndpoint.database}`);
  console.log(`  • Database User:       ${config.directEndpoint.username}`);
  console.log(`  • Direct Target URL:   ${config.directEndpoint.sanitizedUrl}`);
  console.log(`  • TLS Policy:          sslMode=${config.directEndpoint.tlsPolicy.sslMode}, certVerification=${config.directEndpoint.tlsPolicy.certVerificationEnforced}, hostnameVerification=${config.directEndpoint.tlsPolicy.hostnameVerificationEnforced}\n`);

  // 2. Pre-Migration Live Server Session & Prerequisite Role Verification
  console.log("🔍 Connecting to staging direct endpoint to verify server session and prerequisites...");

  // Use the shared factory helper to ensure exact raw URL and TLS parameters are preserved
  const clientFactory = options.prismaClientFactory || createStagingPrismaClient;
  const preflightPrisma = clientFactory(config.directEndpoint);

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
      throw new Error("Failed to query connected server identity.");
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
      throw new Error(
        "PREREQUISITE CHECK FAILED: The application runtime role 'pulsepilot_app' does not exist in staging. " +
        "Execute Step 2 of scripts/staging-dba-execution.sql before deploying migrations."
      );
    }

    console.log("✅ Prerequisite role 'pulsepilot_app' confirmed present in staging database.\n");
  } finally {
    // Teardown occurs unconditionally before child process migration starts
    await preflightPrisma.$disconnect().catch(() => {});
  }

  // 3. Child-Process Migration Execution with Strict Environment Isolation
  console.log("🚀 Executing 'prisma migrate deploy' with scoped staging datasource overrides...\n");

  // Construct isolated environment dictionary for the child process.
  // Overrides DATABASE_URL and DIRECT_URL strictly to the exact validated staging endpoints,
  // preserving sslmode=verify-full without rewriting or stripping connection parameters.
  const childEnv = {
    ...process.env,
    DATABASE_URL: config.stagingDatabaseUrl,
    DIRECT_URL: config.stagingDirectUrl,
    PRISMA_HIDE_UPDATE_MESSAGE: "true",
  };

  const spawnFn = options.spawnPrismaFn || ((cmd, args, opts) => spawnSync(cmd, args, opts));
  const result = spawnFn("npx", ["prisma", "migrate", "deploy"], {
    env: childEnv,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Prisma staging migration failed with exit code ${result.status}.`);
  }

  console.log("\n=================================================================");
  console.log("   ✅ STAGING PRISMA MIGRATIONS APPLIED SUCCESSFULLY                 ");
  console.log("=================================================================\n");

  return {
    success: true,
    stagingProjectRef: config.stagingProjectRef,
    directUrlUsed: config.stagingDirectUrl,
    databaseUrlUsed: config.stagingDatabaseUrl,
  };
}

// Auto-run if executed directly as entrypoint
const isDirectEntry =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("staging-prisma-migrate.ts");

if (isDirectEntry) {
  runStagingMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`\n❌ [CRITICAL SAFETY HALT]: ${err.message}\n`);
      process.exit(1);
    });
}
