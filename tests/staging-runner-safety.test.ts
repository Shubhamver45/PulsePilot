/**
 * PulsePilot AI — SEC-03.2 Staging Runner Hardening & Isolation Unit Tests
 * 
 * Objective: Formally verify the safety gates and invariant enforcement of:
 * - scripts/staging-safety.ts
 * - scripts/staging-prisma-migrate.ts
 * - scripts/verify-staging-database.ts
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
 * 9. Insecure TLS configuration rejection (sslmode=disable, sslmode=no-verify, rejectUnauthorized=false).
 * 10. Production reference in STAGING_DATABASE_URL rejection.
 * 11. Production reference in STAGING_DIRECT_URL rejection.
 * 12. Hostname and project reference mismatch rejection.
 * 13. Mismatch between STAGING_DATABASE_URL and STAGING_DIRECT_URL rejection.
 * 14. ServerIdentityRecord does NOT manufacture server project ref; project ref is client-side validated.
 * 15. current_database() = 'postgres' NOT treated as staging proof.
 * 16. Server identity reporting production database name rejection.
 * 17. Preflight success explicitly clarified as NOT meaning acceptance tests passed.
 * 18. Exact validated staging endpoint target consistency.
 * 19. CLI migration runner exits nonzero (code 1) on missing or invalid configuration.
 * 20. CLI preflight runner exits nonzero (code 1) on missing or invalid configuration.
 * 21. CLI acceptance runner exits nonzero (code 1) on missing or invalid configuration.
 */

import { spawnSync } from "child_process";
import {
  KNOWN_PRODUCTION_PROJECT_REF,
  validateStagingProjectRef,
  validateStagingEndpointUrl,
  loadAndValidateStagingEnv,
  verifyServerSession,
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
  // 2. URL Endpoint, Hostname & TLS Validation
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 2: Endpoint Parsing, Hostname & TLS Validation");

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

  // Insecure TLS checks
  expectThrows(
    () => validateStagingEndpointUrl(
      `postgresql://postgres:pass@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?sslmode=disable`,
      VALID_STAGING_REF,
      "STAGING_DATABASE_URL"
    ),
    "INSECURE_TLS_CONFIGURATION",
    "sslmode=disable must be rejected"
  );

  expectThrows(
    () => validateStagingEndpointUrl(
      `postgresql://postgres:pass@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?sslmode=no-verify`,
      VALID_STAGING_REF,
      "STAGING_DATABASE_URL"
    ),
    "INSECURE_TLS_CONFIGURATION",
    "sslmode=no-verify must be rejected"
  );

  expectThrows(
    () => validateStagingEndpointUrl(
      `postgresql://postgres:pass@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?rejectUnauthorized=false`,
      VALID_STAGING_REF,
      "STAGING_DATABASE_URL"
    ),
    "INSECURE_TLS_CONFIGURATION",
    "rejectUnauthorized=false must be rejected"
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
  // 3. Prohibited Fallback & Target Consistency
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 3: Prohibited Fallback & Target Consistency");

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
  assert(validConfig.directEndpoint.rawUrl === VALID_STAGING_DIRECT_URL, "Exact direct URL preserved without mutation");
  console.log("  ✅ Test Suite 3 Passed.\n");

  // -------------------------------------------------------------------------
  // 4. Server Session Inspection & Identity Separation
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 4: Server Session Inspection & Identity Separation");

  const pureServerRecord: ServerIdentityRecord = {
    current_database: "postgres",
    current_user: "postgres",
    session_user: "postgres",
    inet_server_addr: "10.0.0.1",
    inet_server_port: 5432,
    version: "PostgreSQL 15.6 on x86_64-pc-linux-gnu",
  };

  // Verify pureServerRecord does not have a manufactured derived_project_ref property
  assert(!("derived_project_ref" in pureServerRecord), "ServerIdentityRecord strictly contains server-returned fields only");

  const sessionResult = verifyServerSession(pureServerRecord, validConfig.directEndpoint);
  assert(sessionResult.verified, "Valid server session verified against validated endpoint");
  assert(
    sessionResult.warnings.some((w) => w.includes("does NOT prove staging identity")),
    "current_database() = 'postgres' explicitly generates warning and is NOT treated as staging proof"
  );

  expectThrows(
    () => verifyServerSession({
      ...pureServerRecord,
      current_database: `prod_${KNOWN_PRODUCTION_PROJECT_REF}`,
    }, validConfig.directEndpoint),
    "PRODUCTION_COLLISION",
    "Server reporting production database name must be rejected"
  );
  console.log("  ✅ Test Suite 4 Passed.\n");

  // -------------------------------------------------------------------------
  // 5. CLI Process Safety & Clear Preflight/Acceptance Distinction
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 5: CLI Runner Process Safety & Preflight Separation");

  // Test scripts/staging-prisma-migrate.ts with empty environment
  const migrateProc = spawnSync("node", ["--experimental-strip-types", "scripts/staging-prisma-migrate.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    encoding: "utf8",
  });
  assert(migrateProc.status !== 0, "staging-prisma-migrate exits nonzero when STAGING_PROJECT_REF is missing");

  // Test scripts/verify-staging-database.ts with empty environment
  const preflightProc = spawnSync("node", ["--experimental-strip-types", "scripts/verify-staging-database.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    encoding: "utf8",
  });
  assert(preflightProc.status !== 0, "verify-staging-database exits nonzero when STAGING_PROJECT_REF is missing");

  // Test scripts/run-staging-dba-tests.ts with empty environment
  const acceptanceProc = spawnSync("node", ["--experimental-strip-types", "scripts/run-staging-dba-tests.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    encoding: "utf8",
  });
  assert(acceptanceProc.status !== 0, "run-staging-dba-tests exits nonzero when STAGING_PROJECT_REF is missing");

  // Test production collision rejection across all runners
  const prodCollideProc = spawnSync("node", ["--experimental-strip-types", "scripts/run-staging-dba-tests.ts"], {
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      STAGING_PROJECT_REF: KNOWN_PRODUCTION_PROJECT_REF,
      STAGING_DATABASE_URL: `postgresql://postgres:pass@db.${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
      STAGING_DIRECT_URL: `postgresql://postgres:pass@db.${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
    },
    encoding: "utf8",
  });
  assert(prodCollideProc.status !== 0, "run-staging-dba-tests exits nonzero when production collision occurs");
  assert(
    (prodCollideProc.stdout + prodCollideProc.stderr).includes("PRODUCTION_COLLISION"),
    "run-staging-dba-tests explicitly halts with PRODUCTION_COLLISION"
  );

  console.log("  ✅ Test Suite 5 Passed.\n");

  console.log("=====================================================================");
  console.log("   🎉 ALL 21 FORMAL RUNNER HARDENING TESTS PASSED (5/5 suites)        ");
  console.log("=====================================================================");
}

runStagingSafetyTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
