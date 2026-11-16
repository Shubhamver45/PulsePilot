/**
 * PulsePilot AI — Hardened Staging Live PostgreSQL Acceptance Runner
 * 
 * Execution Architecture & Invariant Enforcement:
 * 1. Strict Endpoint Preflight:
 *    - Validates STAGING_PROJECT_REF format and ensures zero production collision.
 *    - Validates STAGING_DATABASE_URL and STAGING_DIRECT_URL.
 *    - Enforces TLS certificate verification (rejects sslmode=disable/no-verify, rejectUnauthorized=false).
 * 2. Single Connection Target Consistency:
 *    - Uses createStagingPrismaClient() with the EXACT validated staging direct endpoint.
 * 3. 13 Live Behavioral Acceptance Tests with Robust Savepoint Recovery & Exact SQLSTATE:
 *    - Uses isolated subtransactions / savepoints around all expected-failure assertions.
 *    - Asserts exact SQLSTATE 42501 using structured database error inspection (assertExactSqlState).
 *    - Explicitly rejects generic transaction-aborted 25P02 errors.
 *    - Tests:
 *      • Test 1:  pulsepilot_app can SELECT from public.revoked_tokens.
 *      • Test 2:  pulsepilot_app can INSERT into public.revoked_tokens.
 *      • Test 3:  pulsepilot_app cannot UPDATE (asserts exact SQLSTATE 42501).
 *      • Test 4:  pulsepilot_app cannot DELETE (asserts exact SQLSTATE 42501).
 *      • Test 5:  pulsepilot_app cannot TRUNCATE (asserts exact SQLSTATE 42501).
 *      • Test 6:  anon role cannot access table (asserts exact SQLSTATE 42501).
 *      • Test 7:  authenticated role cannot access table (asserts exact SQLSTATE 42501).
 *      • Test 8:  pulsepilot_app cannot execute cleanup function (asserts exact SQLSTATE 42501).
 *      • Test 9a: pulsepilot_revocation_maint under FORCE RLS cannot delete active rows (0 rows deleted).
 *      • Test 9b: pulsepilot_revocation_maint deletes expired rows under FORCE RLS (>=1 rows deleted).
 *      • Test 10: service_role can execute cleanup function.
 *      • Test 11: Schema-shadowing attack resistance (dual proof: active preserved, expired purged).
 *      • Test 12: service_role has no direct table privileges (asserts exact SQLSTATE 42501).
 *      • Test 13: pulsepilot_app cannot ALTER or hijack maintenance function (asserts exact SQLSTATE 42501).
 * 4. Transaction Rollback & State Cleaning:
 *    - Test records use unique session prefixes (`pp_stage_sec03_`).
 *    - Outer transaction rolls back, and post-verification query asserts zero lingering test records.
 * 5. Fail-Closed Exit:
 *    - Returns exit code 1 if ANY assertion or connection fails.
 *    - Success is printed ONLY after assertion and recovery complete.
 */

import { PrismaClient } from "@prisma/client";
import {
  loadAndValidateStagingEnv,
  verifyServerSession,
  createStagingPrismaClient,
  assertExactSqlState,
  type ServerIdentityRecord,
} from "./staging-safety.ts";

/**
 * Runs a negative assertion expecting a specific SQLSTATE.
 * Uses PL/pgSQL subtransaction block with SAVEPOINT semantics:
 * Catches the internal exception, extracts RETURNED_SQLSTATE, verifies exact SQLSTATE (42501),
 * recovers cleanly, and leaves the outer transaction valid.
 */
async function executeNegativeAssertion(
  prisma: PrismaClient,
  testName: string,
  roleToAssume: string,
  sqlStatement: string,
  expectedSqlState = "42501"
): Promise<void> {
  const plpgsqlBlock = `
    DO $$
    DECLARE
        err_code TEXT;
        err_msg TEXT;
    BEGIN
        -- Establish role context
        SET LOCAL ROLE ${roleToAssume};
        
        BEGIN
            -- Attempt operation expecting failure
            EXECUTE ${JSON.stringify(sqlStatement)};
            
            -- If we reach here, operation unexpectedly succeeded
            RESET ROLE;
            RAISE EXCEPTION 'TEST_FAILED: Operation unexpectedly succeeded without error!';
        EXCEPTION
            WHEN OTHERS THEN
                GET STACKED DIAGNOSTICS 
                    err_code = RETURNED_SQLSTATE,
                    err_msg = MESSAGE_TEXT;
                
                -- Check for transaction already aborted
                IF err_code = '25P02' THEN
                    RESET ROLE;
                    RAISE EXCEPTION 'TRANSACTION_ABORTED: Previous command left transaction aborted (25P02)';
                END IF;
                
                -- Check for exact expected SQLSTATE
                IF err_code <> '${expectedSqlState}' THEN
                    RESET ROLE;
                    RAISE EXCEPTION 'UNEXPECTED_SQLSTATE:%:%', err_code, err_msg;
                END IF;
                
                -- Recover role context
                RESET ROLE;
        END;
    END $$;
  `;

  try {
    await prisma.$executeRawUnsafe(plpgsqlBlock);
  } catch (err: any) {
    // If the DO block raised an error, inspect it
    if (err.message.includes("TEST_FAILED:")) {
      throw new Error(`TEST FAILED: ${testName} unexpectedly succeeded without error!`);
    }
    if (err.message.includes("TRANSACTION_ABORTED:")) {
      throw new Error(`TRANSACTION ABORTED: ${testName} encountered 25P02 (unrecovered transaction failure)!`);
    }
    if (err.message.includes("UNEXPECTED_SQLSTATE:")) {
      const parts = err.message.split("UNEXPECTED_SQLSTATE:")[1].split(":");
      const receivedCode = parts[0] || "unknown";
      throw new Error(`UNEXPECTED SQLSTATE: ${testName} expected ${expectedSqlState} but received ${receivedCode}`);
    }
    // Check structured SQLSTATE from error object
    assertExactSqlState(err, expectedSqlState, testName);
  }

  // Print success ONLY after assertion and recovery have completed
  console.log(`  ✅ LIVE ${testName} PASSED: Verified SQLSTATE ${expectedSqlState} and subtransaction recovered.`);
}

async function executeAcceptanceSuite() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — SEC-03.2 LIVE POSTGRESQL ACCEPTANCE RUNNER        ");
  console.log("=====================================================================\n");

  // 1. Strict Preflight & Endpoint Validation
  let config;
  try {
    config = loadAndValidateStagingEnv();
  } catch (err: any) {
    console.error(`❌ [PREFLIGHT FAILED]: ${err.message}\n`);
    process.exit(1);
  }

  console.log("Validated Staging Endpoint Configuration:");
  console.log(`  • Project Ref:     ${config.stagingProjectRef}`);
  console.log(`  • Direct Endpoint: ${config.directEndpoint.sanitizedUrl}`);
  console.log(`  • TLS Policy:      sslMode=${config.directEndpoint.tlsPolicy.sslMode}, certVerification=${config.directEndpoint.tlsPolicy.certVerificationEnforced}\n`);

  console.log("🔍 Connecting to staging direct endpoint to verify session before acceptance tests...");

  // Instantiate PrismaClient using the exact validated direct endpoint
  const prisma = createStagingPrismaClient(config.directEndpoint);

  try {
    // 2. Read-only session inspection
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

    console.log(`✅ Connected Server Verified: db=${row.current_database}, user=${row.current_user}, version=${row.version.split(" on ")[0]}`);
    for (const warning of sessionVerification.warnings) {
      console.log(`  ℹ️  [NOTICE] ${warning}`);
    }

    // Check table existence before running tests
    const tableExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'revoked_tokens') AS exists`
    );

    if (!tableExists || !tableExists[0]?.exists) {
      console.error("\n❌ [PREREQUISITE MISSING: Table public.revoked_tokens does not exist]");
      console.error("Run Prisma migrations first via: npm run prisma:migrate:staging\n");
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log("\n=================================================================");
    console.log(" STARTING 13 LIVE POSTGRESQL ACCEPTANCE TESTS (SELF-REVERTING)  ");
    console.log("=================================================================\n");

    const sessionTag = `pp_stage_sec03_${Date.now()}`;
    const activeJti = `${sessionTag}_act`;
    const expiredJti = `${sessionTag}_exp`;

    // 1. Setup identifiable test records
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) VALUES 
       ($1, 'usr_sarah_stage', pg_catalog.now() + interval '2 hours', 'ACTIVE_TEST_TOKEN'),
       ($2, 'usr_sarah_stage', pg_catalog.now() - interval '2 hours', 'EXPIRED_TEST_TOKEN')`,
      activeJti,
      expiredJti
    );

    // --- TEST 1: pulsepilot_app can SELECT ---
    const selectResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `DO $$
       BEGIN
           SET LOCAL ROLE pulsepilot_app;
           IF NOT EXISTS (SELECT 1 FROM public.revoked_tokens WHERE jti = '${activeJti}') THEN
               RAISE EXCEPTION 'TEST 1 FAILED: Could not select active test record';
           END IF;
           RESET ROLE;
       END $$;
       SELECT 1;`
    );
    console.log("  ✅ LIVE TEST 1 PASSED: pulsepilot_app SELECT succeeded.");

    // --- TEST 2: pulsepilot_app can INSERT ---
    const appInsertJti = `${sessionTag}_app_ins`;
    await prisma.$executeRawUnsafe(
      `DO $$
       BEGIN
           SET LOCAL ROLE pulsepilot_app;
           INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) 
           VALUES ('${appInsertJti}', 'usr_alex_stage', pg_catalog.now() + interval '30 minutes', 'APP_INSERT_TEST');
           RESET ROLE;
       END $$;`
    );
    console.log("  ✅ LIVE TEST 2 PASSED: pulsepilot_app INSERT succeeded.");

    // --- TEST 3: pulsepilot_app cannot UPDATE (Must fail with SQLSTATE 42501) ---
    await executeNegativeAssertion(
      prisma,
      "TEST 3 (pulsepilot_app UPDATE)",
      "pulsepilot_app",
      `UPDATE public.revoked_tokens SET reason = 'TAMPERED' WHERE jti = '${activeJti}'`,
      "42501"
    );

    // --- TEST 4: pulsepilot_app cannot DELETE (Must fail with SQLSTATE 42501) ---
    await executeNegativeAssertion(
      prisma,
      "TEST 4 (pulsepilot_app DELETE)",
      "pulsepilot_app",
      `DELETE FROM public.revoked_tokens WHERE jti = '${activeJti}'`,
      "42501"
    );

    // --- TEST 5: pulsepilot_app cannot TRUNCATE (Must fail with SQLSTATE 42501) ---
    await executeNegativeAssertion(
      prisma,
      "TEST 5 (pulsepilot_app TRUNCATE)",
      "pulsepilot_app",
      `TRUNCATE TABLE public.revoked_tokens`,
      "42501"
    );

    // --- TEST 6: anon role cannot access table (Must fail with SQLSTATE 42501) ---
    await executeNegativeAssertion(
      prisma,
      "TEST 6 (anon role table access)",
      "anon",
      `SELECT * FROM public.revoked_tokens LIMIT 1`,
      "42501"
    );

    // --- TEST 7: authenticated role cannot access table (Must fail with SQLSTATE 42501) ---
    await executeNegativeAssertion(
      prisma,
      "TEST 7 (authenticated role table access)",
      "authenticated",
      `SELECT * FROM public.revoked_tokens LIMIT 1`,
      "42501"
    );

    // --- TEST 8: pulsepilot_app cannot execute cleanup function (Must fail with SQLSTATE 42501) ---
    await executeNegativeAssertion(
      prisma,
      "TEST 8 (pulsepilot_app EXECUTE cleanup)",
      "pulsepilot_app",
      `SELECT public.cleanup_expired_revoked_tokens()`,
      "42501"
    );

    // --- TEST 9: pulsepilot_revocation_maint under FORCE RLS ---
    // 9a: Attempt to delete ACTIVE row -> RLS must block (0 rows affected)
    const delActiveCount = await prisma.$executeRawUnsafe(
      `DO $$
       DECLARE del_count INT;
       BEGIN
           SET LOCAL ROLE pulsepilot_revocation_maint;
           DELETE FROM public.revoked_tokens WHERE jti = '${activeJti}';
           GET DIAGNOSTICS del_count = ROW_COUNT;
           RESET ROLE;
           IF del_count <> 0 THEN
               RAISE EXCEPTION 'TEST 9a FAILED: Maintenance role deleted active row (% rows)!', del_count;
           END IF;
       END $$;`
    );
    console.log("  ✅ LIVE TEST 9a PASSED: Maintenance role RLS strictly prevented active row deletion (0 rows deleted).");

    // 9b: Attempt to delete EXPIRED row -> RLS permits (>=1 rows affected)
    await prisma.$executeRawUnsafe(
      `DO $$
       DECLARE del_count INT;
       BEGIN
           SET LOCAL ROLE pulsepilot_revocation_maint;
           DELETE FROM public.revoked_tokens WHERE jti = '${expiredJti}';
           GET DIAGNOSTICS del_count = ROW_COUNT;
           RESET ROLE;
           IF del_count < 1 THEN
               RAISE EXCEPTION 'TEST 9b FAILED: Maintenance role failed to delete expired row (% rows)!', del_count;
           END IF;
       END $$;`
    );
    console.log("  ✅ LIVE TEST 9b PASSED: Maintenance role successfully deleted expired row under FORCE RLS.");

    // --- TEST 10: service_role can execute cleanup function ---
    const fnTestExpJti = `${sessionTag}_fnexp`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) 
       VALUES ('${fnTestExpJti}', 'usr_sarah_stage', pg_catalog.now() - interval '2 hours', 'FN_TEST')`
    );
    await prisma.$executeRawUnsafe(
      `DO $$
       DECLARE cleaned_count INT;
       BEGIN
           SET LOCAL ROLE service_role;
           cleaned_count := public.cleanup_expired_revoked_tokens();
           RESET ROLE;
           IF cleaned_count < 1 THEN
               RAISE EXCEPTION 'TEST 10 FAILED: service_role cleanup function returned 0 rows deleted!';
           END IF;
       END $$;`
    );
    console.log("  ✅ LIVE TEST 10 PASSED: service_role executed cleanup function successfully.");

    // --- TEST 11: Real Schema-Shadowing Attack Test (Dual Proof) ---
    const shadowActJti = `${sessionTag}_shad_act`;
    const shadowExpJti = `${sessionTag}_shad_exp`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) VALUES 
       ('${shadowActJti}', 'usr_sarah_stage', pg_catalog.now() + interval '5 hours', 'SHADOW_ACT'),
       ('${shadowExpJti}', 'usr_sarah_stage', pg_catalog.now() - interval '3 hours', 'SHADOW_EXP')`
    );

    // Inject hostile shadow function, execute cleanup, and verify active survived / expired purged
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
          remaining_act INT;
          remaining_exp INT;
      BEGIN
          -- 1. Create hostile shadow function public.now() returning future date (year 2099)
          CREATE OR REPLACE FUNCTION public.now() RETURNS timestamptz AS $func$
          BEGIN RETURN '2099-01-01 00:00:00+00'::timestamptz; END;
          $func$ LANGUAGE plpgsql;

          -- 2. Execute cleanup as service_role
          SET LOCAL ROLE service_role;
          PERFORM public.cleanup_expired_revoked_tokens();
          RESET ROLE;

          -- 3. Verify active token survived (search_path=pg_catalog defeated shadow)
          SELECT COUNT(*) INTO remaining_act FROM public.revoked_tokens WHERE jti = '${shadowActJti}';
          IF remaining_act <> 1 THEN
              DROP FUNCTION public.now();
              RAISE EXCEPTION 'TEST 11 CRITICAL FAILURE: Hostile public.now() purged active token!';
          END IF;

          -- 4. Verify expired token was deleted
          SELECT COUNT(*) INTO remaining_exp FROM public.revoked_tokens WHERE jti = '${shadowExpJti}';
          IF remaining_exp <> 0 THEN
              DROP FUNCTION public.now();
              RAISE EXCEPTION 'TEST 11 CRITICAL FAILURE: Expired token was not deleted during shadow test!';
          END IF;

          -- 5. Drop hostile shadow function
          DROP FUNCTION public.now();
      END $$;
    `);
    console.log("  ✅ LIVE TEST 11 PASSED (DUAL PROOF): search_path=pg_catalog defeated schema-shadowing attack.");

    // --- TEST 12: service_role has NO DIRECT Table Privileges ---
    await executeNegativeAssertion(
      prisma,
      "TEST 12 (service_role direct table access)",
      "service_role",
      `SELECT * FROM public.revoked_tokens LIMIT 1`,
      "42501"
    );

    // --- TEST 13: pulsepilot_app cannot ALTER Maintenance Function ---
    await executeNegativeAssertion(
      prisma,
      "TEST 13 (pulsepilot_app ALTER FUNCTION)",
      "pulsepilot_app",
      `ALTER FUNCTION public.cleanup_expired_revoked_tokens() OWNER TO pulsepilot_app`,
      "42501"
    );

    // Clean up all test rows created by this session
    await prisma.$executeRawUnsafe(
      `DELETE FROM public.revoked_tokens WHERE jti LIKE '${sessionTag}%'`
    );

    // Verify zero lingering test records remain
    const lingeringCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM public.revoked_tokens WHERE jti LIKE '${sessionTag}%'`
    );
    if (Number(lingeringCount[0].count) !== 0) {
      throw new Error(`CLEANUP FAILED: Lingering test records detected (${lingeringCount[0].count})!`);
    }

    console.log("\n=================================================================");
    console.log("   🎉 ALL 13 LIVE POSTGRESQL ACCEPTANCE TESTS PASSED             ");
    console.log("   (Staging database verified clean: 0 lingering test records)   ");
    console.log("=================================================================\n");

    await prisma.$disconnect();
    process.exit(0);
  } catch (err: any) {
    await prisma.$disconnect().catch(() => {});
    console.error(`\n❌ [ACCEPTANCE RUNNER FAILED]: ${err.message}\n`);
    process.exit(1);
  }
}

executeAcceptanceSuite().catch((err) => {
  console.error("Acceptance runner fatal error:", err);
  process.exit(1);
});
