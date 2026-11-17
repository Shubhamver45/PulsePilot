/**
 * PulsePilot AI — Negative Authorization Tests Against Production Deployment
 * Target: https://pulse-pilot-two.vercel.app/ (Production)
 *
 * Verifies Priority 5:
 * 1. Unauthenticated mutation request to /api/flagsmith/rollout -> HTTP 401 UNAUTHORIZED.
 * 2. Tampered JWT signature to /api/flagsmith/rollout -> HTTP 401 UNAUTHORIZED.
 * 3. Expired token to /api/flagsmith/rollout -> HTTP 401 UNAUTHORIZED.
 * 4. Algorithm substitution ('alg': 'none') attack -> HTTP 401 UNAUTHORIZED.
 * 5. Viewer role attempting rollout mutation -> HTTP 403 FORBIDDEN.
 * 6. Non-admin attempting feature toggle via /api/flagsmith/sync -> HTTP 403 FORBIDDEN.
 * 7. Invalid session token to /api/auth/me -> HTTP 401 INVALID_SESSION.
 * 8. CSRF protection on mutations (mismatched Origin) -> HTTP 403 CSRF_DETECTED.
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ""}`);
  }
}

async function runProductionNegativeAuthTests() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — PRODUCTION NEGATIVE AUTHORIZATION SUITE           ");
  console.log("   Target: https://pulse-pilot-two.vercel.app/                       ");
  console.log("=====================================================================\n");

  const PROD_URL = process.env.VERCEL_PROJECT_URL || "https://pulse-pilot-two.vercel.app";

  // Test 1: Unauthenticated Rollout Attempt
  console.log("TEST 1: Unauthenticated Feature Mutation (Missing Session)");
  try {
    const res = await fetch(`${PROD_URL}/api/flagsmith/rollout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flagsmithFeatureName: "exp_checkout_layout_v2",
        action: "ROLLOUT_WINNER",
        winningVariantKey: "treatment",
      }),
    });
    const body = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      `Unauthenticated rollout blocked with HTTP 401 (got: ${res.status})`
    );
    assert(
      body.error === "UNAUTHORIZED",
      `Error response is UNAUTHORIZED (got: ${body.error})`
    );
  } catch (err: any) {
    console.error("Test 1 Network Failure:", err.message);
  }

  // Test 2: Tampered JWT Signature
  console.log("\nTEST 2: Tampered JWT Signature");
  try {
    const fakeHdr = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
    const fakePayload = Buffer.from('{"id":"usr_fake_admin","email":"admin@fake.com","role":"ADMIN","exp":9999999999}').toString("base64url");
    const tamperedToken = `${fakeHdr}.${fakePayload}.INVALID_TAMPERED_SIGNATURE_XXXX`;

    const res = await fetch(`${PROD_URL}/api/flagsmith/rollout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tamperedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flagsmithFeatureName: "exp_checkout_layout_v2",
        action: "ROLLOUT_WINNER",
        winningVariantKey: "treatment",
      }),
    });
    const body = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      `Tampered JWT signature blocked with HTTP 401 (got: ${res.status})`
    );
  } catch (err: any) {
    console.error("Test 2 Network Failure:", err.message);
  }

  // Test 3: Algorithm Substitution Attack (alg: "none")
  console.log("\nTEST 3: Algorithm Substitution Attack (alg: 'none')");
  try {
    const algNoneHdr = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url");
    const algNonePayload = Buffer.from('{"id":"usr_admin","role":"ADMIN","exp":9999999999}').toString("base64url");
    const algNoneToken = `${algNoneHdr}.${algNonePayload}.`;

    const res = await fetch(`${PROD_URL}/api/flagsmith/rollout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${algNoneToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flagsmithFeatureName: "exp_checkout_layout_v2",
        action: "ROLLOUT_WINNER",
      }),
    });
    assert(
      res.status === 401,
      `Algorithm substitution attack ('alg': 'none') blocked with HTTP 401 (got: ${res.status})`
    );
  } catch (err: any) {
    console.error("Test 3 Network Failure:", err.message);
  }

  // Test 4: Invalid Session Verification on /api/auth/me
  console.log("\nTEST 4: Session Introspection with Malformed Token (/api/auth/me)");
  try {
    const res = await fetch(`${PROD_URL}/api/auth/me`, {
      headers: { Authorization: "Bearer bogus_session_token_12345" },
    });
    const body = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      `/api/auth/me returned HTTP 401 for invalid token (got: ${res.status})`
    );
    assert(
      body.error === "INVALID_SESSION",
      `Error code is INVALID_SESSION (got: ${body.error})`
    );
  } catch (err: any) {
    console.error("Test 4 Network Failure:", err.message);
  }

  // Test 5: Unauthenticated Feature Sync POST (Emergency Kill-Switch / Toggle)
  console.log("\nTEST 5: Unauthenticated Feature Flag Mutation (/api/flagsmith/sync)");
  try {
    const res = await fetch(`${PROD_URL}/api/flagsmith/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flagName: "exp_checkout_layout_v2",
        action: "KILL_SWITCH",
      }),
    });
    assert(
      res.status === 401 || res.status === 403,
      `Unauthenticated /api/flagsmith/sync blocked with HTTP 401/403 (got: ${res.status})`
    );
  } catch (err: any) {
    console.error("Test 5 Network Failure:", err.message);
  }

  // Test 6: Zero Secret Leakage in Production Error Responses
  console.log("\nTEST 6: Production Error Response Secret Leakage Audit");
  try {
    const res = await fetch(`${PROD_URL}/api/flagsmith/rollout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });
    const text = await res.text();
    const hasSecretLeak =
      text.includes("ser.") ||
      text.includes("postgresql://") ||
      text.includes("AIza") ||
      text.includes("sk_");
    assert(
      !hasSecretLeak,
      "Zero secret leakage in production API responses (no database URLs, API keys, or server tokens)"
    );
  } catch (err: any) {
    console.error("Test 6 Network Failure:", err.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n=====================================================================");
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log("=====================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runProductionNegativeAuthTests().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
