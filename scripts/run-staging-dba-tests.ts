/**
 * PulsePilot AI — Hardened Staging Live PostgreSQL Acceptance Runner
 * 
 * Execution Architecture:
 * 1. Strict Endpoint Preflight:
 *    - Validates STAGING_PROJECT_REF format and ensures zero production collision.
 *    - Validates STAGING_DATABASE_URL and STAGING_DIRECT_URL.
 *    - Enforces TLS certificate verification.
 * 2. Single Connection Target Consistency:
 *    - Connects to the EXACT direct staging endpoint validated during preflight.
 * 3. 13 Live Behavioral Acceptance Tests (Self-Reverting):
 *    - Test 1: pulsepilot_app can SELECT from public.revoked_tokens.
 *    - Test 2: pulsepilot_app can INSERT into public.revoked_tokens.
 *    - Test 3: pulsepilot_app cannot UPDATE (asserts SQLSTATE 42501).
 *    - Test 4: pulsepilot_app cannot DELETE (asserts SQLSTATE 42501).
 *    - Test 5: pulsepilot_app cannot TRUNCATE (asserts SQLSTATE 42501).
 *    - Test 6: anon role cannot access table (asserts SQLSTATE 42501).
 *    - Test 7: authenticated role cannot access table (asserts SQLSTATE 42501).
 *    - Test 8: pulsepilot_app cannot execute cleanup function (asserts SQLSTATE 42501).
 *    - Test 9a: pulsepilot_revocation_maint under FORCE RLS cannot delete active row.
 *    - Test 9b: pulsepilot_revocation_maint deletes expired row.
 *    - Test 10: service_role can execute cleanup function.
 *    - Test 11: Hostile schema-shadowing attack resistance (dual proof).
 *    - Test 12: service_role has no direct table access (function-only).
 *    - Test 13: pulsepilot_app cannot ALTER or hijack maintenance function.
 * 4. Safety Guarantee:
 *    - Returns nonzero exit code (1) if ANY assertion fails or if connection fails.
 *    - All test modifications rolled back via transaction rollback.
 */

import { PrismaClient } from "@prisma/client";
import {
  loadAndValidateStagingEnv,
  verifyServerSession,
  type ServerIdentityRecord,
} from "./staging-safety.ts";

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

  console.log("Validated Staging Endpoint:");
  console.log(`  • Project Ref:     ${config.stagingProjectRef}`);
  console.log(`  • Direct Endpoint: ${config.directEndpoint.sanitizedUrl}\n`);

  console.log("🔍 Connecting to staging direct endpoint to verify session before acceptance tests...");

  // Use the EXACT validated direct URL
  const prisma = new PrismaClient({
    datasources: {
      db: { url: config.stagingDirectUrl },
    },
    log: ["error"],
  });

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

    // Execute tests inside a single PostgreSQL interactive transaction
    // All changes will be rolled back at the end to keep staging clean.
    await prisma.$transaction(async (tx) => {
      // Setup identifiable test records
      const activeJti = `pp_stage_sec03_act_${Date.now()}`;
      const expiredJti = `pp_stage_sec03_exp_${Date.now()}`;

      await tx.$executeRawUnsafe(
        `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) VALUES 
         ($1, 'usr_sarah_stage', pg_catalog.now() + interval '2 hours', 'ACTIVE_TEST_TOKEN'),
         ($2, 'usr_sarah_stage', pg_catalog.now() - interval '2 hours', 'EXPIRED_TEST_TOKEN')`,
        activeJti,
        expiredJti
      );

      // --- TEST 1: pulsepilot_app can SELECT ---
      await tx.$executeRawUnsafe(`SET LOCAL ROLE pulsepilot_app`);
      const selectResult = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) AS count FROM public.revoked_tokens WHERE jti = $1`,
        activeJti
      );
      if (!selectResult || Number(selectResult[0].count) < 1) {
        throw new Error("TEST 1 FAILED: pulsepilot_app could not select active test record!");
      }
      console.log("  ✅ LIVE TEST 1 PASSED: pulsepilot_app SELECT succeeded.");

      // --- TEST 2: pulsepilot_app can INSERT ---
      const appInsertJti = `pp_stage_sec03_app_ins_${Date.now()}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) VALUES ($1, 'usr_alex_stage', pg_catalog.now() + interval '30 minutes', 'APP_INSERT_TEST')`,
        appInsertJti
      );
      console.log("  ✅ LIVE TEST 2 PASSED: pulsepilot_app INSERT succeeded.");

      // --- TEST 3: pulsepilot_app cannot UPDATE (Must fail with 42501) ---
      let test3FailedAsExpected = false;
      try {
        await tx.$executeRawUnsafe(
          `UPDATE public.revoked_tokens SET reason = 'TAMPERED' WHERE jti = $1`,
          activeJti
        );
      } catch (err: any) {
        if (err.message.includes("42501") || err.message.includes("permission denied")) {
          test3FailedAsExpected = true;
        } else {
          throw new Error(`TEST 3 FAILED: Unexpected error: ${err.message}`);
        }
      }
      if (!test3FailedAsExpected) throw new Error("TEST 3 FAILED: pulsepilot_app UPDATE unexpectedly succeeded!");
      console.log("  ✅ LIVE TEST 3 PASSED: pulsepilot_app UPDATE rejected with SQLSTATE 42501.");

      // --- TEST 4: pulsepilot_app cannot DELETE (Must fail with 42501) ---
      let test4FailedAsExpected = false;
      try {
        await tx.$executeRawUnsafe(
          `DELETE FROM public.revoked_tokens WHERE jti = $1`,
          activeJti
        );
      } catch (err: any) {
        if (err.message.includes("42501") || err.message.includes("permission denied")) {
          test4FailedAsExpected = true;
        } else {
          throw new Error(`TEST 4 FAILED: Unexpected error: ${err.message}`);
        }
      }
      if (!test4FailedAsExpected) throw new Error("TEST 4 FAILED: pulsepilot_app DELETE unexpectedly succeeded!");
      console.log("  ✅ LIVE TEST 4 PASSED: pulsepilot_app DELETE rejected with SQLSTATE 42501.");

      // --- TEST 5: pulsepilot_app cannot TRUNCATE (Must fail with 42501) ---
      let test5FailedAsExpected = false;
      try {
        await tx.$executeRawUnsafe(`TRUNCATE TABLE public.revoked_tokens`);
      } catch (err: any) {
        if (err.message.includes("42501") || err.message.includes("permission denied")) {
          test5FailedAsExpected = true;
        } else {
          throw new Error(`TEST 5 FAILED: Unexpected error: ${err.message}`);
        }
      }
      if (!test5FailedAsExpected) throw new Error("TEST 5 FAILED: pulsepilot_app TRUNCATE unexpectedly succeeded!");
      console.log("  ✅ LIVE TEST 5 PASSED: pulsepilot_app TRUNCATE rejected with SQLSTATE 42501.");

      // --- TEST 6: anon role cannot access table (Must fail with 42501) ---
      await tx.$executeRawUnsafe(`RESET ROLE`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE anon`);
      let test6FailedAsExpected = false;
      try {
        await tx.$queryRawUnsafe(`SELECT * FROM public.revoked_tokens LIMIT 1`);
      } catch (err: any) {
        if (err.message.includes("42501") || err.message.includes("permission denied")) {
          test6FailedAsExpected = true;
        }
      }
      if (!test6FailedAsExpected) throw new Error("TEST 6 FAILED: anon SELECT unexpectedly succeeded!");
      console.log("  ✅ LIVE TEST 6 PASSED: anon role denied access (SQLSTATE 42501).");

      // --- TEST 7: authenticated role cannot access table (Must fail with 42501) ---
      await tx.$executeRawUnsafe(`RESET ROLE`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`);
      let test7FailedAsExpected = false;
      try {
        await tx.$queryRawUnsafe(`SELECT * FROM public.revoked_tokens LIMIT 1`);
      } catch (err: any) {
        if (err.message.includes("42501") || err.message.includes("permission denied")) {
          test7FailedAsExpected = true;
        }
      }
      if (!test7FailedAsExpected) throw new Error("TEST 7 FAILED: authenticated SELECT unexpectedly succeeded!");
      console.log("  ✅ LIVE TEST 7 PASSED: authenticated role denied access (SQLSTATE 42501).");

      // --- TEST 8: pulsepilot_app cannot execute cleanup function ---
      await tx.$executeRawUnsafe(`RESET ROLE`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE pulsepilot_app`);
      let test8FailedAsExpected = false;
      try {
        await tx.$executeRawUnsafe(`SELECT public.cleanup_expired_revoked_tokens()`);
      } catch (err: any) {
        if (err.message.includes("42501") || err.message.includes("permission denied")) {
          test8FailedAsExpected = true;
        }
      }
      if (!test8FailedAsExpected) throw new Error("TEST 8 FAILED: pulsepilot_app executed cleanup function!");
      console.log("  ✅ LIVE TEST 8 PASSED: pulsepilot_app denied EXECUTE on cleanup function (SQLSTATE 42501).");

      // --- TEST 9: pulsepilot_revocation_maint under FORCE RLS ---
      await tx.$executeRawUnsafe(`RESET ROLE`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE pulsepilot_revocation_maint`);
      
      // 9a: Attempt to delete ACTIVE row -> RLS must block (0 rows affected)
      const delActiveCount = await tx.$executeRawUnsafe(
        `DELETE FROM public.revoked_tokens WHERE jti = $1`,
        activeJti
      );
      if (delActiveCount !== 0) {
        throw new Error(`TEST 9a FAILED: Maintenance role deleted active row (${delActiveCount} rows affected)!`);
      }
      console.log("  ✅ LIVE TEST 9a PASSED: Maintenance role RLS strictly prevented active row deletion (0 rows deleted).");

      // 9b: Attempt to delete EXPIRED row -> RLS permits (>=1 rows affected)
      const delExpiredCount = await tx.$executeRawUnsafe(
        `DELETE FROM public.revoked_tokens WHERE jti = $1`,
        expiredJti
      );
      if (delExpiredCount < 1) {
        throw new Error(`TEST 9b FAILED: Maintenance role failed to delete expired row (${delExpiredCount} rows affected)!`);
      }
      console.log("  ✅ LIVE TEST 9b PASSED: Maintenance role successfully deleted expired row under FORCE RLS.");

      // --- TEST 10: service_role can execute cleanup function ---
      await tx.$executeRawUnsafe(`RESET ROLE`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE service_role`);
      const fnTestExpJti = `pp_stage_sec03_fnexp_${Date.now()}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) VALUES ($1, 'usr_sarah_stage', pg_catalog.now() - interval '2 hours', 'FN_TEST')`,
        fnTestExpJti
      );
      const cleanedRows = await tx.$queryRawUnsafe<Array<{ cleanup_expired_revoked_tokens: number }>>(
        `SELECT public.cleanup_expired_revoked_tokens() AS cleanup_expired_revoked_tokens`
      );
      if (!cleanedRows || Number(cleanedRows[0].cleanup_expired_revoked_tokens) < 1) {
        throw new Error("TEST 10 FAILED: service_role cleanup function returned 0 rows deleted!");
      }
      console.log("  ✅ LIVE TEST 10 PASSED: service_role executed cleanup function successfully.");

      // --- TEST 11: Real Schema-Shadowing Attack Test (Dual Proof) ---
      await tx.$executeRawUnsafe(`RESET ROLE`);
      const shadowActJti = `pp_stage_sec03_shad_act_${Date.now()}`;
      const shadowExpJti = `pp_stage_sec03_shad_exp_${Date.now()}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO public.revoked_tokens (jti, user_id, expires_at, reason) VALUES 
         ($1, 'usr_sarah_stage', pg_catalog.now() + interval '5 hours', 'SHADOW_ACT'),
         ($2, 'usr_sarah_stage', pg_catalog.now() - interval '3 hours', 'SHADOW_EXP')`,
        shadowActJti,
        shadowExpJti
      );

      // Inject hostile public.now() returning future date (year 2099)
      await tx.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION public.now() RETURNS timestamptz AS $$
        BEGIN RETURN '2099-01-01 00:00:00+00'::timestamptz; END;
        $$ LANGUAGE plpgsql;
      `);

      // Run cleanup as service_role
      await tx.$executeRawUnsafe(`SET LOCAL ROLE service_role`);
      await tx.$queryRawUnsafe(`SELECT public.cleanup_expired_revoked_tokens()`);
      await tx.$executeRawUnsafe(`RESET ROLE`);

      // Verify active token survived (search_path=pg_catalog ignored hostile public.now)
      const remainingAct = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) AS count FROM public.revoked_tokens WHERE jti = $1`,
        shadowActJti
      );
      if (Number(remainingAct[0].count) !== 1) {
        throw new Error("TEST 11 CRITICAL FAILURE: Hostile public.now() purged active token!");
      }

      // Verify expired token was deleted
      const remainingExp = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) AS count FROM public.revoked_tokens WHERE jti = $1`,
        shadowExpJti
      );
      if (Number(remainingExp[0].count) !== 0) {
        throw new Error("TEST 11 CRITICAL FAILURE: Expired token was not deleted during shadow test!");
      }

      // Drop hostile shadow function
      await tx.$executeRawUnsafe(`DROP FUNCTION public.now()`);
      console.log("  ✅ LIVE TEST 11 PASSED (DUAL PROOF): search_path=pg_catalog defeated schema-shadowing attack.");

      // --- TEST 12: service_role has NO DIRECT Table Privileges ---
      await tx.$executeRawUnsafe(`RESET ROLE`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE service_role`);
      let test12FailedAsExpected = false;
      try {
        await tx.$queryRawUnsafe(`SELECT * FROM public.revoked_tokens LIMIT 1`);
      } catch (err: any) {
        if (err.message.includes("42501") || err.message.includes("permission denied")) {
          test12FailedAsExpected = true;
        }
      }
      if (!test12FailedAsExpected) throw new Error("TEST 12 FAILED: service_role directly accessed table!");
      console.log("  ✅ LIVE TEST 12 PASSED: service_role denied direct table access (SQLSTATE 42501; function execution only).");

      // --- TEST 13: pulsepilot_app cannot ALTER Maintenance Function ---
      await tx.$executeRawUnsafe(`RESET ROLE`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE pulsepilot_app`);
      let test13FailedAsExpected = false;
      try {
        await tx.$executeRawUnsafe(`ALTER FUNCTION public.cleanup_expired_revoked_tokens() OWNER TO pulsepilot_app`);
      } catch (err: any) {
        if (err.message.includes("42501") || err.message.includes("permission denied") || err.message.includes("must be owner")) {
          test13FailedAsExpected = true;
        }
      }
      if (!test13FailedAsExpected) throw new Error("TEST 13 FAILED: pulsepilot_app altered function ownership!");
      console.log("  ✅ LIVE TEST 13 PASSED: pulsepilot_app cannot ALTER or hijack maintenance function.");

      // Intentional Rollback: Trigger error to roll back test transaction cleanly
      throw new Error("__PULSEPILOT_INTENTIONAL_ROLLBACK__");
    });
  } catch (err: any) {
    if (err.message === "__PULSEPILOT_INTENTIONAL_ROLLBACK__") {
      console.log("\n=================================================================");
      console.log("   🎉 ALL 13 LIVE POSTGRESQL ACCEPTANCE TESTS PASSED             ");
      console.log("   (Test transaction rolled back: staging database remains clean)");
      console.log("=================================================================\n");
      await prisma.$disconnect();
      process.exit(0);
    } else {
      await prisma.$disconnect().catch(() => {});
      console.error(`\n❌ [ACCEPTANCE TEST FAILED]: ${err.message}\n`);
      process.exit(1);
    }
  }
}

executeAcceptanceSuite().catch((err) => {
  console.error("Acceptance runner fatal error:", err);
  process.exit(1);
});
