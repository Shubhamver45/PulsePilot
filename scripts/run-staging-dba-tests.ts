/**
 * PulsePilot AI — Hardened Staging Live PostgreSQL Acceptance Runner
 * 
 * Execution Architecture & Invariant Enforcement:
 * 1. Strict Endpoint Preflight:
 *    - Validates STAGING_PROJECT_REF format and ensures zero production collision.
 *    - Validates STAGING_DATABASE_URL and STAGING_DIRECT_URL with mandatory sslmode=verify-full.
 *    - Rejects all weak TLS modes (require, verify-ca, disable, allow, prefer, no-verify).
 * 2. Single Connection Target Consistency:
 *    - Uses createStagingPrismaClient() with the EXACT validated staging direct endpoint.
 * 3. 13 Live Acceptance Tests Wrapped in ONE Explicit Outer Transaction:
 *    - All 13 tests execute on a single dedicated transaction session via prisma.$transaction(async (tx) => { ... }).
 *    - Expected-failure assertions run in PL/pgSQL subtransactions with SAVEPOINT semantics.
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
 * 4. Guaranteed Outer Transaction Rollback:
 *    - Whether tests succeed or an intermediate failure occurs, the outer transaction is 100% rolled back.
 *    - On suite success: Throws AcceptanceSuiteRollbackSentinel to trigger rollback.
 *    - On suite failure: Catches error and triggers rollback; all prior insertions and temporary hostile
 *      functions (e.g. public.now()) are automatically undone by PostgreSQL.
 * 5. Post-Rollback Cleanliness Verification:
 *    - After rollback, queries root database to verify 0 lingering test rows and absence of hostile functions.
 * 6. Fail-Closed Exit:
 *    - Final success banner is printed ONLY after all 13 assertions, rollback, and cleanup verification complete.
 *    - Returns exit code 1 if ANY assertion, rollback, or connection fails.
 */

import { PrismaClient } from "@prisma/client";
import {
  loadAndValidateStagingEnv,
  verifyServerSession,
  createStagingPrismaClient,
  assertExactSqlState,
  AcceptanceSuiteRollbackSentinel,
  type ServerIdentityRecord,
} from "./staging-safety.ts";

export interface DatabaseRawClient {
  $executeRawUnsafe(query: string, ...values: any[]): Promise<any>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Promise<T>;
}

/**
 * Runs a negative assertion expecting a specific SQLSTATE.
 * Uses PL/pgSQL subtransaction block with SAVEPOINT semantics:
 * Catches the internal exception, extracts RETURNED_SQLSTATE, verifies exact SQLSTATE (42501),
 * recovers cleanly, and leaves the outer transaction valid.
 */
export async function executeNegativeAssertion(
  client: DatabaseRawClient,
  testName: string,
  roleToAssume: string,
  sqlStatement: string,
  expectedSqlState = "42501"
): Promise<{ success: boolean; returnedSqlState: string }> {
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
    await client.$executeRawUnsafe(plpgsqlBlock);
  } catch (err: any) {
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
  return { success: true, returnedSqlState: expectedSqlState };
}

/**
 * Executes the entire 13-test acceptance suite inside an interactive PostgreSQL transaction.
 */
export async function executeAcceptanceSuite(prismaClient?: PrismaClient): Promise<{
  passed: boolean;
  sessionTag: string;
  testsRun: number;
}> {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — SEC-03.2 LIVE POSTGRESQL ACCEPTANCE RUNNER        ");
  console.log("=====================================================================\n");

  // 1. Strict Preflight & Endpoint Validation
  let config;
  try {
    config = loadAndValidateStagingEnv();
  } catch (err: any) {
    console.error(`❌ [PREFLIGHT FAILED]: ${err.message}\n`);
    throw err;
  }

  console.log("Validated Staging Endpoint Configuration:");
  console.log(`  • Project Ref:     ${config.stagingProjectRef}`);
  console.log(`  • Direct Endpoint: ${config.directEndpoint.sanitizedUrl}`);
  console.log(`  • TLS Policy:      sslMode=${config.directEndpoint.tlsPolicy.sslMode}, certVerification=${config.directEndpoint.tlsPolicy.certVerificationEnforced}, hostnameVerification=${config.directEndpoint.tlsPolicy.hostnameVerificationEnforced}\n`);

  console.log("🔍 Connecting to staging direct endpoint to verify session before acceptance tests...");

  // Instantiate PrismaClient using the exact validated direct endpoint if not injected
  const prisma = prismaClient || createStagingPrismaClient(config.directEndpoint);

  const sessionTag = `pp_stage_sec03_${Date.now()}`;
  const activeJti = `${sessionTag}_act`;
  const expiredJti = `${sessionTag}_exp`;

  let suitePassed = false;
  let suiteError: unknown = null;

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
      throw new Error("Failed to query connected server identity.");
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
      throw new Error(
        "PREREQUISITE MISSING: Table public.revoked_tokens does not exist. Run Prisma migrations first via: npm run prisma:migrate:staging"
      );
    }

    console.log("\n=================================================================");
    console.log(" STARTING 13 LIVE POSTGRESQL ACCEPTANCE TESTS IN OUTER TRANSACTION");
    console.log("=================================================================\n");

    // 3. Execute all 13 acceptance tests inside one explicit outer transaction
    try {
      await prisma.$transaction(
        async (tx) => {
          // 1. Setup identifiable test records inside transaction
          await tx.$executeRawUnsafe(
            `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) VALUES 
             ($1, 'usr_sarah_stage', pg_catalog.now() + interval '2 hours', 'ACTIVE_TEST_TOKEN'),
             ($2, 'usr_sarah_stage', pg_catalog.now() - interval '2 hours', 'EXPIRED_TEST_TOKEN')`,
            activeJti,
            expiredJti
          );

          // --- TEST 1: pulsepilot_app can SELECT ---
          await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
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
          await tx.$executeRawUnsafe(
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
            tx,
            "TEST 3 (pulsepilot_app UPDATE)",
            "pulsepilot_app",
            `UPDATE public.revoked_tokens SET reason = 'TAMPERED' WHERE jti = '${activeJti}'`,
            "42501"
          );

          // --- TEST 4: pulsepilot_app cannot DELETE (Must fail with SQLSTATE 42501) ---
          await executeNegativeAssertion(
            tx,
            "TEST 4 (pulsepilot_app DELETE)",
            "pulsepilot_app",
            `DELETE FROM public.revoked_tokens WHERE jti = '${activeJti}'`,
            "42501"
          );

          // --- TEST 5: pulsepilot_app cannot TRUNCATE (Must fail with SQLSTATE 42501) ---
          await executeNegativeAssertion(
            tx,
            "TEST 5 (pulsepilot_app TRUNCATE)",
            "pulsepilot_app",
            `TRUNCATE TABLE public.revoked_tokens`,
            "42501"
          );

          // --- TEST 6: anon role cannot access table (Must fail with SQLSTATE 42501) ---
          await executeNegativeAssertion(
            tx,
            "TEST 6 (anon role table access)",
            "anon",
            `SELECT * FROM public.revoked_tokens LIMIT 1`,
            "42501"
          );

          // --- TEST 7: authenticated role cannot access table (Must fail with SQLSTATE 42501) ---
          await executeNegativeAssertion(
            tx,
            "TEST 7 (authenticated role table access)",
            "authenticated",
            `SELECT * FROM public.revoked_tokens LIMIT 1`,
            "42501"
          );

          // --- TEST 8: pulsepilot_app cannot execute cleanup function (Must fail with SQLSTATE 42501) ---
          await executeNegativeAssertion(
            tx,
            "TEST 8 (pulsepilot_app EXECUTE cleanup)",
            "pulsepilot_app",
            `SELECT public.cleanup_expired_revoked_tokens()`,
            "42501"
          );

          // --- TEST 9: pulsepilot_revocation_maint under FORCE RLS ---
          // 9a: Attempt to delete ACTIVE row -> RLS must block (0 rows affected)
          await tx.$executeRawUnsafe(
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
          await tx.$executeRawUnsafe(
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
          await tx.$executeRawUnsafe(
            `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) 
             VALUES ('${fnTestExpJti}', 'usr_sarah_stage', pg_catalog.now() - interval '2 hours', 'FN_TEST')`
          );
          await tx.$executeRawUnsafe(
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
          await tx.$executeRawUnsafe(
            `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) VALUES 
             ('${shadowActJti}', 'usr_sarah_stage', pg_catalog.now() + interval '5 hours', 'SHADOW_ACT'),
             ('${shadowExpJti}', 'usr_sarah_stage', pg_catalog.now() - interval '3 hours', 'SHADOW_EXP')`
          );

          // Inject hostile shadow function, execute cleanup, and verify active survived / expired purged
          await tx.$executeRawUnsafe(`
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
                    DROP FUNCTION IF EXISTS public.now();
                    RAISE EXCEPTION 'TEST 11 CRITICAL FAILURE: Hostile public.now() purged active token!';
                END IF;

                -- 4. Verify expired token was deleted
                SELECT COUNT(*) INTO remaining_exp FROM public.revoked_tokens WHERE jti = '${shadowExpJti}';
                IF remaining_exp <> 0 THEN
                    DROP FUNCTION IF EXISTS public.now();
                    RAISE EXCEPTION 'TEST 11 CRITICAL FAILURE: Expired token was not deleted during shadow test!';
                END IF;

                -- 5. Drop hostile shadow function inside transaction
                DROP FUNCTION IF EXISTS public.now();
            END $$;
          `);
          console.log("  ✅ LIVE TEST 11 PASSED (DUAL PROOF): search_path=pg_catalog defeated schema-shadowing attack.");

          // --- TEST 12: service_role has NO DIRECT Table Privileges ---
          await executeNegativeAssertion(
            tx,
            "TEST 12 (service_role direct table access)",
            "service_role",
            `SELECT * FROM public.revoked_tokens LIMIT 1`,
            "42501"
          );

          // --- TEST 13: pulsepilot_app cannot ALTER Maintenance Function ---
          await executeNegativeAssertion(
            tx,
            "TEST 13 (pulsepilot_app ALTER FUNCTION)",
            "pulsepilot_app",
            `ALTER FUNCTION public.cleanup_expired_revoked_tokens() OWNER TO pulsepilot_app`,
            "42501"
          );

          // Trigger intentional rollback of the outer transaction
          throw new AcceptanceSuiteRollbackSentinel();
        },
        {
          maxWait: 10000,
          timeout: 60000,
        }
      );
    } catch (txErr: any) {
      if (
        txErr instanceof AcceptanceSuiteRollbackSentinel ||
        txErr?.name === "AcceptanceSuiteRollbackSentinel" ||
        txErr?.message?.includes("PULSEPILOT_SEC03_INTENTIONAL_ROLLBACK_SENTINEL")
      ) {
        suitePassed = true;
        console.log("\n  🔄 [OUTER TRANSACTION ROLLED BACK CLEANLY]: All 13 tests concluded inside single transaction.");
      } else {
        suitePassed = false;
        suiteError = txErr;
        console.error(`\n  ⚠️  [TRANSACTION ABORTED & ROLLED BACK ON FAILURE]: ${txErr.message}`);
      }
    }

    // 4. Post-Rollback Cleanliness Verification Query (Executed OUTSIDE the rolled-back transaction)
    console.log("🔍 Verifying complete database rollback (zero lingering test records & no hostile functions)...");

    const postRollbackCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM public.revoked_tokens WHERE jti LIKE '${sessionTag}%'`
    );
    const lingeringRows = Number(postRollbackCount[0]?.count ?? 0);
    if (lingeringRows !== 0) {
      throw new Error(`ROLLBACK VERIFICATION FAILED: Lingering test records detected after transaction rollback (${lingeringRows})!`);
    }

    const hostileFuncExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc p 
         JOIN pg_namespace n ON p.pronamespace = n.oid 
         WHERE n.nspname = 'public' AND p.proname = 'now'
       ) AS exists`
    );
    if (hostileFuncExists[0]?.exists) {
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.now()`).catch(() => {});
      throw new Error(`ROLLBACK VERIFICATION FAILED: Hostile function public.now() persisted after transaction rollback!`);
    }

    console.log("  ✅ Post-rollback state verified: 0 test rows persist, hostile functions absent.");

    if (!suitePassed) {
      throw suiteError || new Error("Acceptance test suite failed during execution.");
    }

    // Final success banner printed ONLY after all assertions, rollback, and cleanup verification have succeeded
    console.log("\n=================================================================");
    console.log("   🎉 ALL 13 LIVE POSTGRESQL ACCEPTANCE TESTS PASSED             ");
    console.log("   (Staging database verified clean: transaction cleanly rolled back) ");
    console.log("=================================================================\n");

    return {
      passed: true,
      sessionTag,
      testsRun: 13,
    };
  } finally {
    // Teardown occurs after rollback and verification complete
    await prisma.$disconnect().catch(() => {});
  }
}

// Auto-run if executed directly as entrypoint
const isDirectEntry =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("run-staging-dba-tests.ts");

if (isDirectEntry) {
  executeAcceptanceSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`\n❌ [ACCEPTANCE RUNNER TERMINATED]: ${err.message}\n`);
      process.exit(1);
    });
}
