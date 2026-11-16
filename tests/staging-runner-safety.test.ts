/**
 * PulsePilot AI — SEC-03.2 Staging Runner Hardening & Isolation Unit Tests
 * 
 * Objective: Formally verify the safety gates and invariant enforcement of:
 * - scripts/staging-safety.ts
 * - scripts/staging-prisma-migrate.ts
 * - scripts/run-staging-dba-tests.ts
 * 
 * Verifies:
 * 1. Missing STAGING_PROJECT_REF rejection.
 * 2. Placeholder or malformed STAGING_PROJECT_REF rejection.
 * 3. Production project reference (czqhiuidekvozuoqdmyd) collision rejection.
 * 4. Missing STAGING_DATABASE_URL rejection.
 * 5. Prohibited DATABASE_URL fallback rejection.
 * 6. Missing STAGING_DIRECT_URL rejection.
 * 7. Prohibited DIRECT_URL fallback rejection.
 * 8. Non-Supabase or unsupported hostname rejection.
 * 9. Production reference in STAGING_DATABASE_URL rejection.
 * 10. Production reference in STAGING_DIRECT_URL rejection.
 * 11. Hostname and project reference mismatch rejection.
 * 12. Mismatch between STAGING_DATABASE_URL and STAGING_DIRECT_URL rejection.
 * 13. current_database() = 'postgres' NOT treated as staging proof.
 * 14. Server identity mismatch detection and rejection.
 * 15. Server identity reporting production database name rejection.
 * 16. CLI migration runner exits nonzero (code 1) on missing or invalid configuration.
 * 17. CLI DBA runner exits nonzero (code 1) on missing or invalid configuration.
 */

import { spawnSync } from "child_process";
import {
  KNOWN_PRODUCTION_PROJECT_REF,
  validateStagingProjectRef,
  validateStagingEndpointUrl,
  loadAndValidateStagingEnv,
  verifyServerIdentity,
  type ServerIdentityRecord,
} from "../scripts/staging-safety.ts";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

function expectThrows(fn: () => any, expectedErrorFragment: string, msg: string) {
  try {
    fn();
    console.error(`❌ [FAIL] Expected exception containing "${expectedErrorFragment}", but function succeeded: ${msg}`);
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes(expectedErrorFragment)) {
      console.log(`  ✅ [PASS] Threw expected error containing "${expectedErrorFragment}": ${msg}`);
    } else {
      console.error(`❌ [FAIL] Threw unexpected error: "${err.message}". Expected fragment: "${expectedErrorFragment}": ${msg}`);
      process.exit(1);
    }
  }
}

async function runStagingSafetyTests() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — SEC-03.2 STAGING RUNNER HARDENING UNIT TESTS      ");
  console.log("=====================================================================\n");

  const VALID_STAGING_REF = "stageproj123456789";
  const VALID_STAGING_DB_URL = `postgresql://postgres:secretpassword@db.${VALID_STAGING_REF}.supabase.co:5432/postgres`;
  const VALID_STAGING_DIRECT_URL = `postgresql://postgres:secretpassword@db.${VALID_STAGING_REF}.supabase.co:5432/postgres`;

  // -------------------------------------------------------------------------
  // 1. Mandatory STAGING_PROJECT_REF Validation
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 1: Mandatory STAGING_PROJECT_REF Validation");

  expectThrows(
    () => validateStagingProjectRef(undefined),
    "MISSING_STAGING_PROJECT_REF",
    "Missing STAGING_PROJECT_REF must throw"
  );

  expectThrows(
    () => validateStagingProjectRef(""),
    "MISSING_STAGING_PROJECT_REF",
    "Empty STAGING_PROJECT_REF must throw"
  );

  expectThrows(
    () => validateStagingProjectRef("your-staging-project-ref"),
    "INVALID_STAGING_PROJECT_REF",
    "Placeholder STAGING_PROJECT_REF must throw"
  );

  expectThrows(
    () => validateStagingProjectRef("postgres"),
    "INVALID_STAGING_PROJECT_REF",
    "Database name 'postgres' cannot be used as STAGING_PROJECT_REF"
  );

  expectThrows(
    () => validateStagingProjectRef("invalid_ref!"),
    "MALFORMED_STAGING_PROJECT_REF",
    "Symbols in project ref must be rejected"
  );

  expectThrows(
    () => validateStagingProjectRef("short"),
    "MALFORMED_STAGING_PROJECT_REF",
    "Under-length project ref (<12 chars) must be rejected"
  );

  expectThrows(
    () => validateStagingProjectRef(KNOWN_PRODUCTION_PROJECT_REF),
    "PRODUCTION_COLLISION",
    "Exact production project ref collision must be rejected"
  );

  const validatedRef = validateStagingProjectRef(`  ${VALID_STAGING_REF}  `);
  assert(validatedRef === VALID_STAGING_REF, "Valid staging project reference parses and trims cleanly");
  console.log("  ✅ Test Suite 1 Passed.\n");

  // -------------------------------------------------------------------------
  // 2. URL Endpoint & Hostname Validation
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 2: Endpoint Parsing & Hostname Validation");

  expectThrows(
    () => validateStagingEndpointUrl(undefined, VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "MISSING_STAGING_DATABASE_URL",
    "Missing STAGING_DATABASE_URL must throw"
  );

  expectThrows(
    () => validateStagingEndpointUrl("not_a_url", VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "MALFORMED_URL",
    "Malformed URL must throw"
  );

  expectThrows(
    () => validateStagingEndpointUrl("http://db.stageproj123456789.supabase.co/postgres", VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "INVALID_PROTOCOL",
    "HTTP protocol must be rejected"
  );

  expectThrows(
    () => validateStagingEndpointUrl("postgresql://postgres:pass@staging.internal.net:5432/postgres", VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "UNSUPPORTED_HOST",
    "Non-Supabase hostname must be rejected"
  );

  expectThrows(
    () => validateStagingEndpointUrl(
      `postgresql://postgres:pass@db.${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
      VALID_STAGING_REF,
      "STAGING_DATABASE_URL"
    ),
    "PRODUCTION_COLLISION",
    "Production project reference in URL must be rejected"
  );

  expectThrows(
    () => validateStagingEndpointUrl(
      "postgresql://postgres:pass@db.differentsupabaseref999.supabase.co:5432/postgres",
      VALID_STAGING_REF,
      "STAGING_DATABASE_URL"
    ),
    "PROJECT_REF_MISMATCH",
    "Mismatch between URL hostname and expected STAGING_PROJECT_REF must be rejected"
  );

  const validEndpoint = validateStagingEndpointUrl(VALID_STAGING_DB_URL, VALID_STAGING_REF, "STAGING_DATABASE_URL");
  assert(validEndpoint.projectRef === VALID_STAGING_REF, "Extracted projectRef matches expected staging ref");
  assert(!validEndpoint.sanitizedUrl.includes("secretpassword"), "Sanitized URL masks password completely");
  console.log("  ✅ Test Suite 2 Passed.\n");

  // -------------------------------------------------------------------------
  // 3. Prohibited Fallback & Environment Isolation
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 3: Prohibited Fallback Invariants");

  expectThrows(
    () => loadAndValidateStagingEnv({
      STAGING_PROJECT_REF: VALID_STAGING_REF,
      STAGING_DATABASE_URL: undefined,
      DATABASE_URL: "postgresql://postgres:pass@db.czqhiuidekvozuoqdmyd.supabase.co:5432/postgres",
    }),
    "MISSING_STAGING_DATABASE_URL",
    "Runner must fail closed when STAGING_DATABASE_URL is missing, never falling back to DATABASE_URL"
  );

  expectThrows(
    () => loadAndValidateStagingEnv({
      STAGING_PROJECT_REF: VALID_STAGING_REF,
      STAGING_DATABASE_URL: VALID_STAGING_DB_URL,
      STAGING_DIRECT_URL: undefined,
      DIRECT_URL: "postgresql://postgres:pass@db.czqhiuidekvozuoqdmyd.supabase.co:5432/postgres",
    }),
    "MISSING_STAGING_DIRECT_URL",
    "Runner must fail closed when STAGING_DIRECT_URL is missing, never falling back to DIRECT_URL"
  );

  expectThrows(
    () => loadAndValidateStagingEnv({
      STAGING_PROJECT_REF: VALID_STAGING_REF,
      STAGING_DATABASE_URL: VALID_STAGING_DB_URL,
      STAGING_DIRECT_URL: "postgresql://postgres:pass@db.otherproject456.supabase.co:5432/postgres",
    }),
    "PROJECT_REF_MISMATCH",
    "Differing direct URL target must be rejected"
  );

  const validConfig = loadAndValidateStagingEnv({
    STAGING_PROJECT_REF: VALID_STAGING_REF,
    STAGING_DATABASE_URL: VALID_STAGING_DB_URL,
    STAGING_DIRECT_URL: VALID_STAGING_DIRECT_URL,
  });
  assert(validConfig.stagingProjectRef === VALID_STAGING_REF, "Valid staging config loaded successfully");
  console.log("  ✅ Test Suite 3 Passed.\n");

  // -------------------------------------------------------------------------
  // 4. Server Identity Verification Invariants
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 4: Live Server Identity Invariants");

  const validServerIdentity: ServerIdentityRecord = {
    current_database: "postgres",
    current_user: "postgres",
    session_user: "postgres",
    inet_server_addr: "10.0.0.1",
    inet_server_port: 5432,
    version: "PostgreSQL 15.6 on x86_64-pc-linux-gnu",
    derived_project_ref: VALID_STAGING_REF,
  };

  const identityResult = verifyServerIdentity(validServerIdentity, VALID_STAGING_REF);
  assert(identityResult.verified, "Valid server identity verified");
  assert(
    identityResult.warnings.some((w) => w.includes("NOT considered proof of staging identity")),
    "current_database() = 'postgres' explicitly generates warning and is NOT treated as staging proof"
  );

  expectThrows(
    () => verifyServerIdentity({
      ...validServerIdentity,
      current_database: `prod_${KNOWN_PRODUCTION_PROJECT_REF}`,
    }, VALID_STAGING_REF),
    "PRODUCTION_COLLISION",
    "Server reporting production database name must be rejected"
  );

  expectThrows(
    () => verifyServerIdentity({
      ...validServerIdentity,
      derived_project_ref: "differentproj789",
    }, VALID_STAGING_REF),
    "SERVER_IDENTITY_MISMATCH",
    "Server identity mismatch against expected staging project reference must be rejected"
  );
  console.log("  ✅ Test Suite 4 Passed.\n");

  // -------------------------------------------------------------------------
  // 5. CLI Migration & DBA Runner Process Safety (Nonzero Exit on Invariant Failure)
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 5: CLI Runner Fail-Closed Process Validation");

  // Test scripts/staging-prisma-migrate.ts with empty environment
  const migrateProc = spawnSync("node", ["--experimental-strip-types", "scripts/staging-prisma-migrate.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    encoding: "utf8",
  });
  assert(migrateProc.status !== 0, "staging-prisma-migrate exits nonzero when STAGING_PROJECT_REF is missing");
  assert(
    (migrateProc.stdout + migrateProc.stderr).includes("MISSING_STAGING_PROJECT_REF") ||
    (migrateProc.stdout + migrateProc.stderr).includes("CRITICAL SAFETY HALT"),
    "staging-prisma-migrate reports clear safety halt error"
  );

  // Test scripts/run-staging-dba-tests.ts with empty environment
  const dbaProc = spawnSync("node", ["--experimental-strip-types", "scripts/run-staging-dba-tests.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    encoding: "utf8",
  });
  assert(dbaProc.status !== 0, "run-staging-dba-tests exits nonzero when STAGING_PROJECT_REF is missing");
  assert(
    (dbaProc.stdout + dbaProc.stderr).includes("MISSING_STAGING_PROJECT_REF") ||
    (dbaProc.stdout + dbaProc.stderr).includes("CRITICAL SAFETY HALT"),
    "run-staging-dba-tests reports clear safety halt error"
  );

  // Test scripts/staging-prisma-migrate.ts when targeting production project reference
  const prodCollideProc = spawnSync("node", ["--experimental-strip-types", "scripts/staging-prisma-migrate.ts"], {
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      STAGING_PROJECT_REF: KNOWN_PRODUCTION_PROJECT_REF,
      STAGING_DATABASE_URL: `postgresql://postgres:pass@db.${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
      STAGING_DIRECT_URL: `postgresql://postgres:pass@db.${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
    },
    encoding: "utf8",
  });
  assert(prodCollideProc.status !== 0, "staging-prisma-migrate exits nonzero when production collision occurs");
  assert(
    (prodCollideProc.stdout + prodCollideProc.stderr).includes("PRODUCTION_COLLISION"),
    "staging-prisma-migrate explicitly halts with PRODUCTION_COLLISION"
  );

  console.log("  ✅ Test Suite 5 Passed.\n");

  console.log("=====================================================================");
  console.log("   🎉 ALL 17 FORMAL RUNNER HARDENING TESTS PASSED (5/5 suites)        ");
  console.log("=====================================================================");
}

runStagingSafetyTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
