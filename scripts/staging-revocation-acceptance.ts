/**
 * PulsePilot AI — SEC-03.1 Staging Revocation Storage Acceptance Suite
 * Verifies PostgreSQL-backed session revocation, cross-instance isolation,
 * least-privilege access, fail-closed defenses, and audit-chain integrity.
 */

import crypto from "crypto";
import { execSync } from "child_process";
import {
  createSignedToken,
  verifySignedToken,
  getUserFromToken,
  recordTokenRevocation,
  isTokenRevoked,
  setDemoUserStatus,
  type AuthUser,
} from "../src/lib/auth/auth-service.ts";
import { POST as rolloutPOST } from "../src/app/api/flagsmith/rollout/route.ts";
import { recordAuditLog, getAuditLogs, verifyAuditLogIntegrity } from "../src/lib/audit/audit-logger.ts";
import { getFlagsmithExperimentResults } from "../src/lib/flagsmith/experimentation-service.ts";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

const stagingAdmin: AuthUser = {
  id: "usr_sarah_lin",
  email: "sarah@pulsepilot.ai",
  fullName: "Sarah Lin",
  role: "ADMIN",
  organizationId: "org_acme_growth",
  organizationName: "Acme Growth Inc.",
  activeWorkspaceId: "ws_acme_prod",
  activeWorkspaceName: "Acme Growth (Production)",
  createdAt: new Date().toISOString(),
};

const stagingEditor: AuthUser = {
  id: "usr_alex_rivera",
  email: "alex@pulsepilot.ai",
  fullName: "Alex Rivera",
  role: "EDITOR",
  organizationId: "org_acme_growth",
  organizationName: "Acme Growth Inc.",
  activeWorkspaceId: "ws_acme_prod",
  activeWorkspaceName: "Acme Growth (Production)",
  createdAt: new Date().toISOString(),
};

async function runStagingAcceptanceTests() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — SEC-03.1 STAGING ACCEPTANCE TEST RUNBOOK          ");
  console.log("=====================================================================\n");

  // -------------------------------------------------------------------------
  // 1. A valid session is accepted
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 1: Valid Session Acceptance");
  const validToken = createSignedToken(stagingAdmin);
  const user = await getUserFromToken(validToken, { checkRevocation: true, failClosed: true });
  assert(user !== null && user.id === stagingAdmin.id, "Valid session is accepted by identity resolver");
  console.log("  ✅ Test 1 Passed.\n");

  // -------------------------------------------------------------------------
  // 2. Revoking its jti makes it invalid
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 2: Revoking jti Invalidates Session");
  const parts = validToken.slice(4).split(".");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  await recordTokenRevocation(claims.jti, stagingAdmin.id, claims.exp, "STAGING_TEST_LOGOUT");
  const revokedUser = await getUserFromToken(validToken, { checkRevocation: true, failClosed: true });
  assert(revokedUser === null, "Revoked jti causes session token to be immediately rejected");
  console.log("  ✅ Test 2 Passed.\n");

  // -------------------------------------------------------------------------
  // 3. A second independent process observes the revocation
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 3: Cross-Process Revocation Visibility");
  const crossProcToken = createSignedToken(stagingAdmin);
  const cpParts = crossProcToken.slice(4).split(".");
  const cpClaims = JSON.parse(Buffer.from(cpParts[1], "base64url").toString("utf8"));
  
  // Revoke in parent process
  await recordTokenRevocation(cpClaims.jti, stagingAdmin.id, cpClaims.exp, "CROSS_PROCESS_TEST");

  // Verify in independent child process
  const childCmd = `node --loader ./tests/next-server-loader.mjs --no-warnings -e '
    import { getUserFromToken } from "./src/lib/auth/auth-service.ts";
    async function test() {
      const u = await getUserFromToken("${crossProcToken}", { checkRevocation: true });
      process.stdout.write(u ? "VALID" : "REVOKED");
    }
    test();
  '`;
  const childRes = execSync(childCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  assert(childRes.includes("REVOKED"), "Child process correctly observes token revocation");
  console.log("  ✅ Test 3 Passed.\n");

  // -------------------------------------------------------------------------
  // 4. Duplicate revocation is handled safely (Idempotency)
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 4: Duplicate Revocation Idempotency (ON CONFLICT DO NOTHING)");
  const duplicateJti = crypto.randomUUID();
  const res1 = await recordTokenRevocation(duplicateJti, stagingAdmin.id, Math.floor(Date.now() / 1000) + 3600, "FIRST_CALL");
  const res2 = await recordTokenRevocation(duplicateJti, stagingAdmin.id, Math.floor(Date.now() / 1000) + 3600, "DUPLICATE_CALL");
  assert(res1 && res2, "Duplicate revocation records processed idempotently without error");
  console.log("  ✅ Test 4 Passed.\n");

  // -------------------------------------------------------------------------
  // 5. Expired revocation records are handled correctly
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 5: Expired Revocation Records Handling");
  const pastJti = crypto.randomUUID();
  const pastExpiry = Math.floor(Date.now() / 1000) - 30; // Expired 30 seconds ago
  await recordTokenRevocation(pastJti, stagingAdmin.id, pastExpiry, "EXPIRED_TEST");
  const isRevoked = await isTokenRevoked(pastJti);
  assert(!isRevoked, "Past/expired revocation entry is treated as naturally inactive");
  console.log("  ✅ Test 5 Passed.\n");

  // -------------------------------------------------------------------------
  // 6. Database disconnection fails closed
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 6: Database Disconnection Fails Closed (HTTP 500)");
  const savedDbUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://pulsepilot_bad_host:5432/bad_db?connect_timeout=1";
    const failClosedToken = createSignedToken(stagingAdmin);
    const failReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${failClosedToken}`,
      },
      body: JSON.stringify({
        flagsmithFeatureName: "exp_checkout_social_proof",
        action: "EMERGENCY_KILL_SWITCH",
        rationale: "Database disconnection test",
      }),
    });
    const failRes = await rolloutPOST(failReq);
    assert(failRes.status === 500, `Database disconnection returned status ${failRes.status} (Expected 500)`);
    const failData = await failRes.json();
    assert(failData.error === "AUTH_PERSISTENCE_ERROR", "Error code is AUTH_PERSISTENCE_ERROR");
  } finally {
    if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
  }
  console.log("  ✅ Test 6 Passed.\n");

  // -------------------------------------------------------------------------
  // 7. Production cannot use file-store fallback
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 7: Production Rejects File-Store Fallback");
  const savedEnv = process.env.NODE_ENV;
  const savedDb = process.env.DATABASE_URL;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL; // Simulate missing DB in production

    let threw = false;
    try {
      await isTokenRevoked(crypto.randomUUID());
    } catch (e: any) {
      threw = true;
      assert(e.message.includes("DATABASE_URL is not configured"), "Fails closed when DB unconfigured in production");
    }
    assert(threw, "Production must never silently fallback to filesystem");
  } finally {
    process.env.NODE_ENV = savedEnv;
    if (savedDb) process.env.DATABASE_URL = savedDb;
  }
  console.log("  ✅ Test 7 Passed.\n");

  // -------------------------------------------------------------------------
  // 8. Non-admin users cannot perform rollout operations
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 8: Non-Admin Rollout Rejection (HTTP 403)");
  const editorToken = createSignedToken(stagingEditor);
  const editorReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${editorToken}`,
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "GRADUAL_STAGE",
      winningVariantKey: "variant_social_proof",
      stagePercentage: 25,
      rationale: "Editor test",
    }),
  });
  const editorRes = await rolloutPOST(editorReq);
  assert(editorRes.status === 403, `Non-admin request returned ${editorRes.status} (Expected 403)`);
  console.log("  ✅ Test 8 Passed.\n");

  // -------------------------------------------------------------------------
  // 9. Demoted administrators cannot perform rollout operations
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 9: Demoted Administrator Rejection (HTTP 403)");
  const demotedAdminToken = createSignedToken(stagingAdmin);
  setDemoUserStatus(stagingAdmin.email, { role: "EDITOR" }); // Live demotion

  const demotedReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${demotedAdminToken}`,
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "ROLLBACK_TO_CONTROL",
      rationale: "Demoted admin probe",
    }),
  });
  const demotedRes = await rolloutPOST(demotedReq);
  assert(demotedRes.status === 403, `Demoted admin returned ${demotedRes.status} (Expected 403)`);
  const demotedData = await demotedRes.json();
  assert(demotedData.error === "ROLE_REVOKED", "Error code is ROLE_REVOKED");
  setDemoUserStatus(stagingAdmin.email, { role: "ADMIN" }); // Restore
  console.log("  ✅ Test 9 Passed.\n");

  // -------------------------------------------------------------------------
  // 10. Existing telemetry and audit functionality still works
  // -------------------------------------------------------------------------
  console.log("STAGE TEST 10: Existing Telemetry & Cryptographic Audit Verification");
  const experimentResults = await getFlagsmithExperimentResults("checkout_experience");
  assert(experimentResults !== null, "Telemetry aggregation scorecard retrieved");
  assert(experimentResults?.summary?.totalExposures! > 0, "Telemetry exposures recorded");

  const auditEntry = await recordAuditLog({
    action: "ROLLOUT_RECOMMENDED",
    actor: { name: "Automated Staging Validator", type: "system" },
    entityType: "EXPERIMENT",
    entityId: "exp_checkout_social_proof",
    details: "Staging acceptance verification audit ledger check",
  });
  assert(Boolean(auditEntry.signature), "Audit log entry generated SHA-256 signature");

  const chainIntegrity = await verifyAuditLogIntegrity();
  assert(chainIntegrity.valid, "Cryptographic audit chain remains 100% valid and untampered");
  console.log("  ✅ Test 10 Passed.\n");

  console.log("=====================================================================");
  console.log("   🎉 ALL 10 STAGING ACCEPTANCE CRITERIA PASSED                      ");
  console.log("=====================================================================");
}

runStagingAcceptanceTests().catch((err) => {
  console.error("Staging acceptance test failed:", err);
  process.exit(1);
});
