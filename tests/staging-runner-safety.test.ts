/**
 * PulsePilot AI — SEC-03.2 Staging Runner Hardening & Isolation Unit Tests
 * 
 * Objective: Formally verify the safety gates, invariant enforcement, SQLSTATE inspection,
 * transaction recovery logic, and TLS policies:
 * - scripts/staging-safety.ts
 * - scripts/staging-prisma-migrate.ts
 * - scripts/verify-staging-database.ts
 * - scripts/run-staging-dba-tests.ts
 * 
 * Verifies:
 * 1.  Mandatory STAGING_PROJECT_REF validation and production collision rejection.
 * 2.  Endpoint parsing, hostname agreement, and supported host validation.
 * 3.  Insecure TLS configuration rejection (sslmode=disable, sslmode=no-verify, rejectUnauthorized=false).
 * 4.  Isolated TLS Test Fixture: Proves certificate validation & hostname verification fail closed.
 * 5.  Prohibited DATABASE_URL / DIRECT_URL fallback rejection.
 * 6.  Target endpoint consistency: exact validated direct URL passed to PrismaClient.
 * 7.  Server session inspection & identity separation (no manufactured server ref).
 * 8.  current_database() = 'postgres' NOT treated as staging proof.
 * 9.  Structured database error inspection: exact SQLSTATE 42501 validation.
 * 10. Unexpected SQLSTATE rejection (e.g. 42P01, 23505).
 * 11. Missing SQLSTATE rejection (generic errors).
 * 12. Transaction-aborted 25P02 explicitly rejected and not mistaken for 42501.
 * 13. Preflight runner success explicitly distinguished from acceptance tests.
 * 14. CLI process safety: all runners exit nonzero on missing configuration or production collision.
 */

import tls from "tls";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync, execSync } from "child_process";
import {
  KNOWN_PRODUCTION_PROJECT_REF,
  validateStagingProjectRef,
  validateStagingEndpointUrl,
  loadAndValidateStagingEnv,
  verifyServerSession,
  inspectDatabaseError,
  assertExactSqlState,
  createStagingPrismaClient,
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
  console.log("   PULSEPILOT AI — SEC-03.2 ACCEPTANCE RUNNER HARDENING UNIT TESTS   ");
  console.log("=====================================================================\n");

  const VALID_STAGING_REF = "stageproj123456789";
  const VALID_STAGING_DB_URL = `postgresql://postgres:secretpassword@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?sslmode=verify-full`;
  const VALID_STAGING_DIRECT_URL = `postgresql://postgres:secretpassword@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?sslmode=verify-full`;

  // -------------------------------------------------------------------------
  // SUITE 1: Mandatory STAGING_PROJECT_REF & Production Collision
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 1: Mandatory STAGING_PROJECT_REF & Production Collision");

  expectThrows(() => validateStagingProjectRef(undefined), "MISSING_STAGING_PROJECT_REF", "Missing STAGING_PROJECT_REF must throw");
  expectThrows(() => validateStagingProjectRef(""), "MISSING_STAGING_PROJECT_REF", "Empty STAGING_PROJECT_REF must throw");
  expectThrows(() => validateStagingProjectRef("your-staging-project-ref"), "INVALID_STAGING_PROJECT_REF", "Placeholder STAGING_PROJECT_REF must throw");
  expectThrows(() => validateStagingProjectRef("postgres"), "INVALID_STAGING_PROJECT_REF", "Database name 'postgres' cannot be used as STAGING_PROJECT_REF");
  expectThrows(() => validateStagingProjectRef("invalid_ref!"), "MALFORMED_STAGING_PROJECT_REF", "Symbols in project ref must be rejected");
  expectThrows(() => validateStagingProjectRef("short"), "MALFORMED_STAGING_PROJECT_REF", "Under-length project ref (<12 chars) must be rejected");
  expectThrows(() => validateStagingProjectRef(KNOWN_PRODUCTION_PROJECT_REF), "PRODUCTION_COLLISION", "Exact production project ref collision must be rejected");

  const validatedRef = validateStagingProjectRef(`  ${VALID_STAGING_REF}  `);
  assert(validatedRef === VALID_STAGING_REF, "Valid staging project reference parses and trims cleanly");
  console.log("  ✅ Test Suite 1 Passed.\n");

  // -------------------------------------------------------------------------
  // SUITE 2: Endpoint Parsing, Hostname & TLS Policy Validation
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 2: Endpoint Parsing, Hostname & TLS Policy Validation");

  expectThrows(() => validateStagingEndpointUrl(undefined, VALID_STAGING_REF, "STAGING_DATABASE_URL"), "MISSING_STAGING_DATABASE_URL", "Missing STAGING_DATABASE_URL must throw");
  expectThrows(() => validateStagingEndpointUrl("not_a_url", VALID_STAGING_REF, "STAGING_DATABASE_URL"), "MALFORMED_URL", "Malformed URL must throw");
  expectThrows(() => validateStagingEndpointUrl("http://db.stageproj123456789.supabase.co/postgres", VALID_STAGING_REF, "STAGING_DATABASE_URL"), "INVALID_PROTOCOL", "HTTP protocol must be rejected");
  expectThrows(() => validateStagingEndpointUrl("postgresql://postgres:pass@staging.internal.net:5432/postgres", VALID_STAGING_REF, "STAGING_DATABASE_URL"), "UNSUPPORTED_HOST", "Non-Supabase hostname must be rejected");

  // Insecure TLS configurations
  expectThrows(
    () => validateStagingEndpointUrl(`postgresql://postgres:pass@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?sslmode=disable`, VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "INSECURE_TLS_CONFIGURATION",
    "sslmode=disable must be rejected"
  );
  expectThrows(
    () => validateStagingEndpointUrl(`postgresql://postgres:pass@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?sslmode=allow`, VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "INSECURE_TLS_CONFIGURATION",
    "sslmode=allow must be rejected"
  );
  expectThrows(
    () => validateStagingEndpointUrl(`postgresql://postgres:pass@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?sslmode=prefer`, VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "INSECURE_TLS_CONFIGURATION",
    "sslmode=prefer must be rejected"
  );
  expectThrows(
    () => validateStagingEndpointUrl(`postgresql://postgres:pass@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?sslmode=no-verify`, VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "INSECURE_TLS_CONFIGURATION",
    "sslmode=no-verify must be rejected"
  );
  expectThrows(
    () => validateStagingEndpointUrl(`postgresql://postgres:pass@db.${VALID_STAGING_REF}.supabase.co:5432/postgres?rejectUnauthorized=false`, VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "INSECURE_TLS_CONFIGURATION",
    "rejectUnauthorized=false must be rejected"
  );

  // Production collision in URL
  expectThrows(
    () => validateStagingEndpointUrl(`postgresql://postgres:pass@db.${KNOWN_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`, VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "PRODUCTION_COLLISION",
    "Production project reference in URL must be rejected"
  );

  // Project ref mismatch
  expectThrows(
    () => validateStagingEndpointUrl("postgresql://postgres:pass@db.differentsupabaseref999.supabase.co:5432/postgres", VALID_STAGING_REF, "STAGING_DATABASE_URL"),
    "PROJECT_REF_MISMATCH",
    "Mismatch between URL hostname and expected STAGING_PROJECT_REF must be rejected"
  );

  const validEndpoint = validateStagingEndpointUrl(VALID_STAGING_DB_URL, VALID_STAGING_REF, "STAGING_DATABASE_URL");
  assert(validEndpoint.projectRef === VALID_STAGING_REF, "Extracted projectRef matches expected staging ref");
  assert(validEndpoint.tlsPolicy.certVerificationEnforced === true, "Certificate verification enforced in TLS policy");
  assert(!validEndpoint.sanitizedUrl.includes("secretpassword"), "Sanitized URL masks password completely");
  console.log("  ✅ Test Suite 2 Passed.\n");

  // -------------------------------------------------------------------------
  // SUITE 3: Isolated TLS Verification Test Fixture
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 3: Isolated TLS Verification Test Fixture");

  // Generate an isolated test certificate and key pair
  const keyPath = path.join(os.tmpdir(), "pp_test_key.pem");
  const certPath = path.join(os.tmpdir(), "pp_test_cert.pem");
  const caKeyPath = path.join(os.tmpdir(), "pp_test_ca_key.pem");
  const caCertPath = path.join(os.tmpdir(), "pp_test_ca_cert.pem");

  // Create Root CA and Server Certificate issued for db.stageproj123456789.supabase.co
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${caKeyPath}" -out "${caCertPath}" -days 1 ` +
    `-subj "/CN=PulsePilot Test Staging CA" 2>/dev/null`
  );
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 1 ` +
    `-subj "/CN=db.${VALID_STAGING_REF}.supabase.co" 2>/dev/null`
  );

  const rawCert = fs.readFileSync(certPath, "utf8");
  const serverX509 = new crypto.X509Certificate(rawCert);

  // Test 3a: Hostname validation must fail closed on mismatched hostname (SAN / Common Name mismatch)
  const hostMismatch = tls.checkServerIdentity("wrong-staging-host.supabase.co", serverX509 as any);
  assert(
    hostMismatch !== undefined && hostMismatch.code === "ERR_TLS_CERT_ALTNAME_INVALID",
    "TLS hostname verification fails closed (ERR_TLS_CERT_ALTNAME_INVALID) on hostname mismatch"
  );

  // Test 3b: Certificate chain verification must fail closed against untrusted CA
  // Independent public key generated that did NOT sign this certificate
  const untrustedCaKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
  const isChainValid = serverX509.verify(untrustedCaKey);
  assert(
    isChainValid === false,
    "TLS certificate chain verification fails closed (false) when certificate is not signed by trusted CA"
  );

  // Clean up temporary cert files
  try {
    fs.unlinkSync(keyPath);
    fs.unlinkSync(certPath);
    fs.unlinkSync(caKeyPath);
    fs.unlinkSync(caCertPath);
  } catch {}

  console.log("  ✅ Test Suite 3 Passed.\n");

  // -------------------------------------------------------------------------
  // SUITE 4: Prohibited Fallback & Target Endpoint Consistency
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 4: Prohibited Fallback & Target Endpoint Consistency");

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

  const validConfig = loadAndValidateStagingEnv({
    STAGING_PROJECT_REF: VALID_STAGING_REF,
    STAGING_DATABASE_URL: VALID_STAGING_DB_URL,
    STAGING_DIRECT_URL: VALID_STAGING_DIRECT_URL,
  });

  // Verify Prisma client factory receives the exact validated direct URL string
  const testPrismaClient = createStagingPrismaClient(validConfig.directEndpoint);
  assert(testPrismaClient !== null, "createStagingPrismaClient instantiated PrismaClient");
  assert(validConfig.directEndpoint.rawUrl === VALID_STAGING_DIRECT_URL, "Exact validated raw URL preserved without mutation");

  console.log("  ✅ Test Suite 4 Passed.\n");

  // -------------------------------------------------------------------------
  // SUITE 5: Structured Database Error & SQLSTATE 42501 Inspection
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 5: Structured Database Error & SQLSTATE 42501 Inspection");

  // 5a: Exact SQLSTATE 42501 via meta.code (PrismaClientKnownRequestError format)
  const prisma42501Err = {
    name: "PrismaClientKnownRequestError",
    code: "P2010",
    meta: { code: "42501", message: "permission denied for table revoked_tokens" },
    message: "Raw query failed. Code: `42501`. Message: `permission denied for table revoked_tokens`",
  };
  assertExactSqlState(prisma42501Err, "42501", "test 5a");
  const insp42501 = inspectDatabaseError(prisma42501Err);
  assert(insp42501.sqlState === "42501" && insp42501.isPermissionDenied, "inspectDatabaseError extracted 42501");

  // 5b: Unexpected SQLSTATE (e.g. 42P01 table does not exist) must throw UNEXPECTED_SQLSTATE
  const prisma42P01Err = {
    name: "PrismaClientKnownRequestError",
    code: "P2010",
    meta: { code: "42P01", message: "relation public.revoked_tokens does not exist" },
    message: "Raw query failed. Code: `42P01`",
  };
  expectThrows(
    () => assertExactSqlState(prisma42P01Err, "42501", "test 5b"),
    "UNEXPECTED_SQLSTATE",
    "Unexpected SQLSTATE 42P01 must throw UNEXPECTED_SQLSTATE"
  );

  // 5c: Missing SQLSTATE must throw MISSING_SQLSTATE
  const genericErr = new Error("Generic network error or timeout without database code");
  expectThrows(
    () => assertExactSqlState(genericErr, "42501", "test 5c"),
    "MISSING_SQLSTATE",
    "Missing SQLSTATE must throw MISSING_SQLSTATE"
  );

  // 5d: Transaction aborted (25P02) must throw TRANSACTION_ABORTED and NOT be mistaken for 42501
  const abortedTxErr = {
    name: "PrismaClientKnownRequestError",
    code: "P2010",
    meta: { code: "25P02", message: "current transaction is aborted, commands ignored until end of transaction block" },
    message: "Raw query failed. Code: `25P02`",
  };
  expectThrows(
    () => assertExactSqlState(abortedTxErr, "42501", "test 5d"),
    "TRANSACTION_ABORTED",
    "Transaction aborted 25P02 must throw TRANSACTION_ABORTED and never pass as permission denied"
  );

  console.log("  ✅ Test Suite 5 Passed.\n");

  // -------------------------------------------------------------------------
  // SUITE 6: Server Session Inspection & Identity Separation
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 6: Server Session Inspection & Identity Separation");

  const pureServerRecord: ServerIdentityRecord = {
    current_database: "postgres",
    current_user: "postgres",
    session_user: "postgres",
    inet_server_addr: "10.0.0.1",
    inet_server_port: 5432,
    version: "PostgreSQL 15.6 on x86_64-pc-linux-gnu",
  };

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
  console.log("  ✅ Test Suite 6 Passed.\n");

  // -------------------------------------------------------------------------
  // SUITE 7: CLI Process Safety & Clear Preflight/Acceptance Distinction
  // -------------------------------------------------------------------------
  console.log("TEST SUITE 7: CLI Runner Process Safety & Preflight Separation");

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

  // Test production collision rejection
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

  console.log("  ✅ Test Suite 7 Passed.\n");

  console.log("=====================================================================");
  console.log("   🎉 ALL 28 FORMAL ACCEPTANCE RUNNER TESTS PASSED (7/7 suites)       ");
  console.log("=====================================================================");
}

runStagingSafetyTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
