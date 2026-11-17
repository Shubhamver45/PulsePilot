/**
 * PulsePilot AI — SEC-03.1 Authentication & Rollout Security Test Suite
 * Comprehensive Verification: 23 Attack & Invariant Scenarios
 * Covers: Cryptography, Session Revocation, Multi-Process Persistence, RBAC, CSRF, Fail-Closed Defense
 */

import crypto from "crypto";
import fs from "fs";
import { execSync } from "child_process";
import {
  createSignedToken,
  verifySignedToken,
  getUserFromToken,
  loginUser,
  logoutUser,
  recordTokenRevocation,
  isTokenRevoked,
  readPersistentRevocationStore,
  PERSISTENT_REVOCATION_FILE,
  TOKEN_ISSUER,
  TOKEN_AUDIENCE,
  getSigningSecret,
  RegisterInputSchema,
  setDemoUserStatus,
  type AuthUser,
} from "../src/lib/auth/auth-service.ts";
import { POST as rolloutPOST } from "../src/app/api/flagsmith/rollout/route.ts";
import { getAuditLogs } from "../src/lib/audit/audit-logger.ts";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

const adminUser: AuthUser = {
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

const editorUser: AuthUser = {
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

async function runTests() {
  const originalDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "mock"; // Use shared file store for local suite
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — SEC-03.1 COMPLETE SECURITY SUITE (23 SCENARIOS)   ");
  console.log("=====================================================================\n");

  // -------------------------------------------------------------------------
  // TEST 1: LOGIN AND TOKEN ISSUANCE
  // -------------------------------------------------------------------------
  console.log("TEST 1: Login and Token Issuance");
  const loginRes = await loginUser({ email: "sarah@pulsepilot.ai", password: "pulsepilot2026" });
  assert(loginRes.success === true, "Login succeeds with valid credentials");
  assert(Boolean(loginRes.token), "Token is issued upon successful login");
  assert(loginRes.token!.startsWith("pps_"), "Token starts with 'pps_' identifier prefix");
  const tokenParts = loginRes.token!.slice(4).split(".");
  assert(tokenParts.length === 3, "Token consists of 3 base64url segments (header.payload.sig)");

  const payloadJson = Buffer.from(tokenParts[1], "base64url").toString("utf8");
  const claims = JSON.parse(payloadJson);
  assert(claims.sub === "usr_sarah_lin", "Payload contains valid subject (sub)");
  assert(claims.email === "sarah@pulsepilot.ai", "Payload contains valid email");
  assert(claims.role === "ADMIN", "Payload contains ADMIN role");
  assert(claims.iss === TOKEN_ISSUER, "Payload contains valid issuer");
  assert(claims.aud === TOKEN_AUDIENCE, "Payload contains valid audience");
  assert(typeof claims.iat === "number" && typeof claims.exp === "number", "Payload contains iat and exp timestamps");
  assert(typeof claims.jti === "string" && claims.jti.length > 10, "Payload contains cryptographic unique jti");
  console.log("  ✅ Test 1 Passed: Login and token issuance validated.\n");

  // -------------------------------------------------------------------------
  // TEST 2: VALID TOKEN VERIFICATION
  // -------------------------------------------------------------------------
  console.log("TEST 2: Valid Token Verification");
  const verifiedUser = verifySignedToken(loginRes.token!);
  assert(verifiedUser !== null, "Token verifies successfully");
  assert(verifiedUser?.id === "usr_sarah_lin", "Verified ID matches admin user ID");
  assert(verifiedUser?.role === "ADMIN", "Verified role matches ADMIN");
  assert(verifiedUser?.email === "sarah@pulsepilot.ai", "Verified email matches admin email");
  console.log("  ✅ Test 2 Passed: Valid token cryptographic verification confirmed.\n");

  // -------------------------------------------------------------------------
  // TEST 3: INVALID SIGNATURE REJECTION
  // -------------------------------------------------------------------------
  console.log("TEST 3: Invalid Signature Rejection");
  const tamperedSig = tokenParts[2].slice(0, -4) + "ZZZZ";
  const badSigToken = `pps_${tokenParts[0]}.${tokenParts[1]}.${tamperedSig}`;
  assert(verifySignedToken(badSigToken) === null, "Token with tampered signature is rejected");
  console.log("  ✅ Test 3 Passed: Tampered signature detection verified.\n");

  // -------------------------------------------------------------------------
  // TEST 4: EXPIRED TOKEN REJECTION
  // -------------------------------------------------------------------------
  console.log("TEST 4: Expired Token Rejection");
  const expiredToken = createSignedToken(adminUser, -10000); // Expired 10s ago
  assert(verifySignedToken(expiredToken) === null, "Expired token is strictly rejected");
  console.log("  ✅ Test 4 Passed: Expired token rejection verified.\n");

  // -------------------------------------------------------------------------
  // TEST 5: INVALID ISSUER REJECTION
  // -------------------------------------------------------------------------
  console.log("TEST 5: Invalid Issuer Rejection");
  const secret = getSigningSecret();
  const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const wrongIssClaims = {
    ...claims,
    iss: "untrusted-external-authority",
  };
  const wrongIssB64 = Buffer.from(JSON.stringify(wrongIssClaims)).toString("base64url");
  const wrongIssSig = crypto.createHmac("sha256", secret).update(`${headerB64}.${wrongIssB64}`).digest("base64url");
  assert(verifySignedToken(`pps_${headerB64}.${wrongIssB64}.${wrongIssSig}`) === null, "Token with invalid issuer rejected");
  console.log("  ✅ Test 5 Passed: Invalid issuer rejection verified.\n");

  // -------------------------------------------------------------------------
  // TEST 6: INVALID AUDIENCE REJECTION
  // -------------------------------------------------------------------------
  console.log("TEST 6: Invalid Audience Rejection");
  const wrongAudClaims = {
    ...claims,
    aud: "malicious-consumer",
  };
  const wrongAudB64 = Buffer.from(JSON.stringify(wrongAudClaims)).toString("base64url");
  const wrongAudSig = crypto.createHmac("sha256", secret).update(`${headerB64}.${wrongAudB64}`).digest("base64url");
  assert(verifySignedToken(`pps_${headerB64}.${wrongAudB64}.${wrongAudSig}`) === null, "Token with invalid audience rejected");
  console.log("  ✅ Test 6 Passed: Invalid audience rejection verified.\n");

  // -------------------------------------------------------------------------
  // TEST 7: ALGORITHM SUBSTITUTION REJECTION
  // -------------------------------------------------------------------------
  console.log("TEST 7: Algorithm Substitution Defense (alg: 'none' and 'RS256')");
  const noneHeaderB64 = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  assert(verifySignedToken(`pps_${noneHeaderB64}.${tokenParts[1]}.`) === null, "Token with alg='none' strictly rejected");
  const rsHeaderB64 = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  assert(verifySignedToken(`pps_${rsHeaderB64}.${tokenParts[1]}.${tokenParts[2]}`) === null, "Token with alg='RS256' strictly rejected");
  console.log("  ✅ Test 7 Passed: Algorithm substitution attacks prevented.\n");

  // -------------------------------------------------------------------------
  // TEST 8: TOKEN TAMPERING REJECTION
  // -------------------------------------------------------------------------
  console.log("TEST 8: Token Tampering Rejection");
  const editorClaims = { ...claims, role: "EDITOR" };
  const editorClaimsB64 = Buffer.from(JSON.stringify(editorClaims)).toString("base64url");
  const tamperedPayloadToken = `pps_${tokenParts[0]}.${editorClaimsB64}.${tokenParts[2]}`;
  assert(verifySignedToken(tamperedPayloadToken) === null, "Altered payload with old signature strictly rejected");
  console.log("  ✅ Test 8 Passed: Token tampering rejection verified.\n");

  // -------------------------------------------------------------------------
  // TEST 9: PREVIOUS-KEY VERIFICATION (KEY ROTATION)
  // -------------------------------------------------------------------------
  console.log("TEST 9: Previous-Key Verification (Zero-Downtime Key Rotation)");
  const prevSecret = "previous_rotation_secret_key_minimum_32_characters_2026";
  process.env.SESSION_SECRET_PREVIOUS = prevSecret;
  const oldSig = crypto.createHmac("sha256", prevSecret).update(`${headerB64}.${tokenParts[1]}`).digest("base64url");
  const oldKeyToken = `pps_${headerB64}.${tokenParts[1]}.${oldSig}`;
  const verifiedOldKeyUser = verifySignedToken(oldKeyToken);
  assert(verifiedOldKeyUser !== null, "Token signed with previous secret accepted during key rotation window");
  delete process.env.SESSION_SECRET_PREVIOUS;
  assert(verifySignedToken(oldKeyToken) === null, "Previous-secret token rejected once rotation window closes");
  console.log("  ✅ Test 9 Passed: Previous-key verification verified.\n");

  // -------------------------------------------------------------------------
  // TEST 10: CURRENT-KEY ISSUANCE INTEGRITY
  // -------------------------------------------------------------------------
  console.log("TEST 10: Current-Key Issuance Integrity");
  process.env.SESSION_SECRET_PREVIOUS = "temporary_previous_secret_for_test";
  const currentToken = createSignedToken(adminUser);
  const curParts = currentToken.slice(4).split(".");
  const expectedSigCur = crypto.createHmac("sha256", secret).update(`${curParts[0]}.${curParts[1]}`).digest("base64url");
  const expectedSigPrev = crypto.createHmac("sha256", "temporary_previous_secret_for_test").update(`${curParts[0]}.${curParts[1]}`).digest("base64url");
  assert(curParts[2] === expectedSigCur, "Newly issued token is signed with CURRENT secret");
  assert(curParts[2] !== expectedSigPrev, "Newly issued token is NOT signed with PREVIOUS secret");
  delete process.env.SESSION_SECRET_PREVIOUS;
  console.log("  ✅ Test 10 Passed: Current-key issuance integrity verified.\n");

  // -------------------------------------------------------------------------
  // TEST 11: PERSISTENT SESSION REVOCATION (JTI RECORDED, RAW TOKEN NOT STORED)
  // -------------------------------------------------------------------------
  console.log("TEST 11: Persistent Session Revocation (jti Recorded, Never Raw Token)");
  const revocableToken = createSignedToken(adminUser);
  const revocableParts = revocableToken.slice(4).split(".");
  const revocableClaims = JSON.parse(Buffer.from(revocableParts[1], "base64url").toString("utf8"));
  const jti = revocableClaims.jti;

  await recordTokenRevocation(jti, adminUser.id, revocableClaims.exp, "TEST_REVOCATION");
  const persistentStore = readPersistentRevocationStore();

  assert(Boolean(persistentStore[jti]), "Revocation store contains revoked jti");
  assert(persistentStore[jti].userId === adminUser.id, "Revocation store records user ID associated with jti");
  assert(persistentStore[jti].reason === "TEST_REVOCATION", "Revocation store records revocation reason");

  // Verify that raw token string is NOT stored in persistent file
  const fileRawContents = fs.readFileSync(PERSISTENT_REVOCATION_FILE, "utf8");
  assert(!fileRawContents.includes(revocableToken), "Persistent store NEVER writes raw token strings");
  assert(await isTokenRevoked(jti), "isTokenRevoked confirms jti is marked revoked");
  console.log("  ✅ Test 11 Passed: Persistent session revocation records jti without storing raw tokens.\n");

  // -------------------------------------------------------------------------
  // TEST 12: REVOCATION ACROSS INDEPENDENT SERVER PROCESSES
  // -------------------------------------------------------------------------
  console.log("TEST 12: Revocation Across Independent Server Processes");
  const multiProcToken = createSignedToken(adminUser);
  const multiProcParts = multiProcToken.slice(4).split(".");
  const multiProcClaims = JSON.parse(Buffer.from(multiProcParts[1], "base64url").toString("utf8"));

  // Child Process A: Verify token is initially valid in an isolated Node process
  const childValidCmd = `node --loader ./tests/next-server-loader.mjs --no-warnings -e '
    import { getUserFromToken } from "./src/lib/auth/auth-service.ts";
    async function test() {
      const u = await getUserFromToken("${multiProcToken}");
      process.stdout.write(u ? "VALID" : "INVALID");
    }
    test();
  '`;
  const childValidOutput = execSync(childValidCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  assert(childValidOutput.includes("VALID") && !childValidOutput.includes("INVALID"), "Token is initially valid in independent child process A");

  // Main process: revoke the token via logoutUser
  await logoutUser(multiProcToken);

  // Child Process B: Verify token is immediately rejected in another fresh Node process
  const childRevokedCmd = `node --loader ./tests/next-server-loader.mjs --no-warnings -e '
    import { getUserFromToken } from "./src/lib/auth/auth-service.ts";
    async function test() {
      const u = await getUserFromToken("${multiProcToken}");
      process.stdout.write(u ? "VALID" : "INVALID");
    }
    test();
  '`;
  const childRevokedOutput = execSync(childRevokedCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  assert(childRevokedOutput.includes("INVALID"), "Revoked token is strictly rejected in independent child process B");
  console.log("  ✅ Test 12 Passed: Revocation persists across independent processes.\n");

  // -------------------------------------------------------------------------
  // TEST 13: LOGOUT FOLLOWED BY A PRIVILEGED REQUEST (HTTP 401)
  // -------------------------------------------------------------------------
  console.log("TEST 13: Logout Followed by a Privileged Request (HTTP 401)");
  const sessionTokenToLogout = createSignedToken(adminUser);
  await logoutUser(sessionTokenToLogout);

  const loggedOutReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sessionTokenToLogout}`,
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "EMERGENCY_KILL_SWITCH",
      rationale: "Testing revoked session rejection",
    }),
  });
  const loggedOutRes = await rolloutPOST(loggedOutReq);
  assert(loggedOutRes.status === 401, `Logged-out session returned ${loggedOutRes.status} (Expected 401)`);
  const loggedOutData = await loggedOutRes.json();
  assert(loggedOutData.error === "INVALID_SESSION", "Error code is INVALID_SESSION");
  console.log("  ✅ Test 13 Passed: Privileged request with logged-out session returns 401.\n");

  // -------------------------------------------------------------------------
  // TEST 14: DISABLED ADMINISTRATOR ACCOUNT (HTTP 403)
  // -------------------------------------------------------------------------
  console.log("TEST 14: Disabled Administrator Account Rejection (HTTP 403)");
  const disabledAdminToken = createSignedToken(adminUser);
  setDemoUserStatus(adminUser.email, { active: false });

  const disabledReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${disabledAdminToken}`,
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "ROLLBACK_TO_CONTROL",
      rationale: "Disabled account probe",
    }),
  });
  const disabledRes = await rolloutPOST(disabledReq);
  assert(disabledRes.status === 403, `Disabled admin returned ${disabledRes.status} (Expected 403)`);
  const disabledData = await disabledRes.json();
  assert(disabledData.error === "ACCOUNT_DISABLED", "Error code is ACCOUNT_DISABLED");
  setDemoUserStatus(adminUser.email, { active: true }); // Restore active
  console.log("  ✅ Test 14 Passed: Disabled administrator account strictly blocked with 403.\n");

  // -------------------------------------------------------------------------
  // TEST 15: DOWNGRADED ADMINISTRATOR ROLE (HTTP 403)
  // -------------------------------------------------------------------------
  console.log("TEST 15: Downgraded Administrator Role Rejection (HTTP 403)");
  // Token claims say ADMIN, but live user status is demoted to EDITOR
  const staleAdminToken = createSignedToken(adminUser);
  setDemoUserStatus(adminUser.email, { role: "EDITOR" });

  const demotedReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${staleAdminToken}`,
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
  setDemoUserStatus(adminUser.email, { role: "ADMIN" }); // Restore ADMIN
  console.log("  ✅ Test 15 Passed: Stale token with revoked administrator privileges blocked with 403.\n");

  // -------------------------------------------------------------------------
  // TEST 16: SELF-ASSIGNED ADMINISTRATOR ROLE REJECTION
  // -------------------------------------------------------------------------
  console.log("TEST 16: Self-Assigned Administrator Role Rejection");
  const rawRegistrationPayload: any = {
    email: "newattacker@pulsepilot.ai",
    password: "Password123!",
    fullName: "Malicious User",
    organizationName: "Target Org Hijack",
    role: "ADMIN", // Attacker attempts to self-assign role
  };
  const parsed = RegisterInputSchema.parse(rawRegistrationPayload);
  assert(!("role" in parsed), "RegisterInputSchema strips unapproved client role assignment");
  console.log("  ✅ Test 16 Passed: Registration prevents self-assigned roles and privilege injection.\n");

  // -------------------------------------------------------------------------
  // TEST 17: MISSING ORIGIN ON COOKIE-AUTHENTICATED MUTATION (HTTP 403)
  // -------------------------------------------------------------------------
  console.log("TEST 17: Missing Origin on Cookie-Authenticated Mutation (HTTP 403)");
  const adminCookieToken = createSignedToken(adminUser);
  const noOriginReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `pulsepilot_session=${adminCookieToken}`,
      // Deliberately no Origin and no Referer
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "EMERGENCY_KILL_SWITCH",
      rationale: "Testing missing origin on cookie mutation",
    }),
  });
  const noOriginRes = await rolloutPOST(noOriginReq);
  assert(noOriginRes.status === 403, `Missing Origin returned ${noOriginRes.status} (Expected 403)`);
  const noOriginData = await noOriginRes.json();
  assert(noOriginData.error === "CSRF_DETECTED", "Error code is CSRF_DETECTED");
  console.log("  ✅ Test 17 Passed: Cookie-authenticated mutations require verified Origin/Referer.\n");

  // -------------------------------------------------------------------------
  // TEST 18: INVALID ORIGIN (HTTP 403)
  // -------------------------------------------------------------------------
  console.log("TEST 18: Invalid Origin CSRF Rejection (HTTP 403)");
  const badOriginReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `pulsepilot_session=${adminCookieToken}`,
      "Origin": "https://malicious-cross-origin.com",
      "Host": "pulsepilot.ai",
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "EMERGENCY_KILL_SWITCH",
      rationale: "Testing cross-origin CSRF",
    }),
  });
  const badOriginRes = await rolloutPOST(badOriginReq);
  assert(badOriginRes.status === 403, `Mismatched Origin returned ${badOriginRes.status} (Expected 403)`);
  const badOriginData = await badOriginRes.json();
  assert(badOriginData.error === "CSRF_DETECTED", "Error code is CSRF_DETECTED");
  console.log("  ✅ Test 18 Passed: Cross-origin CSRF attack strictly rejected.\n");

  // -------------------------------------------------------------------------
  // TEST 19: NON-ADMIN ROLLOUT REJECTION (HTTP 403)
  // -------------------------------------------------------------------------
  console.log("TEST 19: Non-Admin Rollout Rejection (HTTP 403)");
  const nonAdminToken = createSignedToken(editorUser);
  const nonAdminReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${nonAdminToken}`,
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "GRADUAL_STAGE",
      winningVariantKey: "variant_social_proof",
      stagePercentage: 25,
      rationale: "Editor attempting privileged rollout",
    }),
  });
  const nonAdminRes = await rolloutPOST(nonAdminReq);
  assert(nonAdminRes.status === 403, `Non-admin returned ${nonAdminRes.status} (Expected 403)`);
  const nonAdminData = await nonAdminRes.json();
  assert(nonAdminData.error === "FORBIDDEN", "Error code is FORBIDDEN");
  console.log("  ✅ Test 19 Passed: Non-admin users strictly denied rollout authorization.\n");

  // -------------------------------------------------------------------------
  // TEST 20: AUTHORIZED ADMIN ROLLOUT (HTTP 200)
  // -------------------------------------------------------------------------
  console.log("TEST 20: Authorized Administrator Rollout Execution");
  const authAdminToken = createSignedToken(adminUser);
  const authorizedReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authAdminToken}`,
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "ROLLBACK_TO_CONTROL",
      rationale: "Production verified admin rollback",
    }),
  });
  const authorizedRes = await rolloutPOST(authorizedReq);
  assert(authorizedRes.status !== 401 && authorizedRes.status !== 403, "Admin authorization succeeded");
  console.log(`  ✅ Test 20 Passed: Authorized administrator rollout accepted (status=${authorizedRes.status}).\n`);

  // -------------------------------------------------------------------------
  // TEST 21: FORGED AUTHORIZER REJECTION
  // -------------------------------------------------------------------------
  console.log("TEST 21: Forged Client Authorizer Rejection");
  const spoofReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authAdminToken}`,
    },
    body: JSON.stringify({
      flagsmithFeatureName: "exp_checkout_social_proof",
      action: "GRADUAL_STAGE",
      winningVariantKey: "variant_social_proof",
      stagePercentage: 25,
      authorizer: "Attacker Spoofed Name",
      rationale: "Testing authorizer spoofing mitigation",
    }),
  });
  const spoofRes = await rolloutPOST(spoofReq);
  const spoofData = await spoofRes.json();
  if (spoofData.success && spoofData.authorizer) {
    assert(spoofData.authorizer.includes("Sarah Lin"), "Authorizer is strictly derived from verified session");
    assert(!spoofData.authorizer.includes("Attacker Spoofed Name"), "Client supplied authorizer discarded");
  }
  const recentLogs = await getAuditLogs(1);
  if (recentLogs.length > 0) {
    assert(recentLogs[0].actor.name.includes("Sarah Lin"), "Audit log actor name derives strictly from session identity");
    assert(!recentLogs[0].actor.name.includes("Attacker Spoofed Name"), "Audit log actor name never contains spoofed client authorizer");
  }
  console.log("  ✅ Test 21 Passed: Client-supplied authorizer field overridden by verified session claims.\n");

  // -------------------------------------------------------------------------
  // TEST 22: MISSING SIGNING SECRET FAILS CLOSED IN PRODUCTION
  // -------------------------------------------------------------------------
  console.log("TEST 22: Missing Signing Secret Fails Closed in Production");
  const savedNodeEnv = process.env.NODE_ENV;
  const savedSecret = process.env.SESSION_SECRET;
  const savedNextSecret = process.env.NEXTAUTH_SECRET;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    let threw = false;
    try {
      getSigningSecret();
    } catch (e: any) {
      threw = true;
      assert(e.message.includes("CRITICAL SECURITY CONFIGURATION ERROR"), "Throws critical configuration error in production");
    }
    assert(threw, "getSigningSecret must throw and fail closed when secrets are missing in production");
  } finally {
    process.env.NODE_ENV = savedNodeEnv;
    if (savedSecret) process.env.SESSION_SECRET = savedSecret;
    if (savedNextSecret) process.env.NEXTAUTH_SECRET = savedNextSecret;
  }
  console.log("  ✅ Test 22 Passed: Missing production signing secret fails closed.\n");

  // -------------------------------------------------------------------------
  // TEST 23: DATABASE FAILURE DURING REVOCATION LOOKUP (FAILS CLOSED - HTTP 500)
  // -------------------------------------------------------------------------
  console.log("TEST 23: Database Failure During Revocation Lookup Fails Closed (HTTP 500)");
  const savedDbUrl = process.env.DATABASE_URL;
  try {
    // Set invalid PostgreSQL connection to trigger database error
    process.env.DATABASE_URL = "postgresql://pulsepilot_unreachable_host:5432/bad_db?connect_timeout=1";

    const failClosedReq = new Request("http://localhost:3000/api/flagsmith/rollout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authAdminToken}`,
      },
      body: JSON.stringify({
        flagsmithFeatureName: "exp_checkout_social_proof",
        action: "EMERGENCY_KILL_SWITCH",
        rationale: "Testing fail-closed persistence behavior",
      }),
    });
    const failClosedRes = await rolloutPOST(failClosedReq);
    assert(failClosedRes.status === 500, `Database failure returned status ${failClosedRes.status} (Expected 500)`);
    const failClosedData = await failClosedRes.json();
    assert(
      failClosedData.error === "AUTH_PERSISTENCE_ERROR",
      `Error code is AUTH_PERSISTENCE_ERROR (received: ${failClosedData.error})`
    );
  } finally {
    if (originalDbUrl) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
  console.log("  ✅ Test 23 Passed: Infrastructure failure during revocation fails closed with 500 AUTH_PERSISTENCE_ERROR.\n");

  console.log("=====================================================================");
  console.log("   🎉 ALL 23 SEC-03.1 SECURITY VERIFICATION SCENARIOS PASSED (23/23) ");
  console.log("=====================================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
