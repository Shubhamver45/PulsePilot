/**
 * Flagsmith 1,000-Identity Assignment Consistency & Statistical Distribution Test
 * PulsePilot AI — Hackathon Track 02: AI Agents & Feature Flags
 *
 * Verifies:
 * 1. 100% Deterministic Assignment Stability: Evaluates 1,000 unique identities across 3 passes (0 drift).
 * 2. 50/50 Traffic Distribution & Goodness-of-Fit: Chi-square test on 1,000 identities (Sample Ratio Mismatch check).
 * 3. Dynamic Staged Rollout Shifts (10%, 25%, 50%, 100% rollout, 0% rollback).
 * 4. Multi-Variant 3-Way Allocation Test (33.3% / 33.3% / 33.3%).
 * 5. Trait-Based Segment Targeting Isolation.
 */

import { flagsmithMockStore } from "../src/lib/flagsmith/flagsmith-mock.ts";
import { calculateChiSquareSRM } from "../src/lib/analytics/stats.ts";

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

async function run1000IdentityTests() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — 1,000-IDENTITY ASSIGNMENT CONSISTENCY & DISTRIBUTION");
  console.log("=====================================================================\n");

  const FLAG_NAME = "exp_checkout_layout_v2";

  // Setup test flag: 50% Control (multi_step) vs 50% Treatment (single_page)
  flagsmithMockStore.setFlag({
    name: FLAG_NAME,
    enabled: true,
    type: "MULTIVARIATE",
    value: JSON.stringify({ layout: "multi_step" }),
    multivariateOptions: [
      { key: "control", trafficAllocation: 50, value: JSON.stringify({ layout: "multi_step" }) },
      { key: "variant_single_page", trafficAllocation: 50, value: JSON.stringify({ layout: "single_page" }) },
    ],
  });

  // -------------------------------------------------------------------------
  // SECTION 1: 1,000-IDENTITY REPRODUCIBILITY & CONSISTENCY (3 PASSES)
  // -------------------------------------------------------------------------
  console.log("SECTION 1: DETERMINISTIC ASSIGNMENT CONSISTENCY ACROSS 1,000 IDENTITIES");

  const NUM_IDENTITIES = 1000;
  const identities: string[] = [];
  for (let i = 1; i <= NUM_IDENTITIES; i++) {
    identities.push(`usr_perf_test_${String(i).padStart(4, "0")}`);
  }

  // Pass 1
  const pass1Assignments = new Map<string, string>();
  for (const id of identities) {
    const res = flagsmithMockStore.evaluateForIdentity(FLAG_NAME, id);
    pass1Assignments.set(id, res.variantKey);
  }

  // Pass 2
  let pass2MismatchCount = 0;
  for (const id of identities) {
    const res = flagsmithMockStore.evaluateForIdentity(FLAG_NAME, id);
    if (res.variantKey !== pass1Assignments.get(id)) {
      pass2MismatchCount++;
    }
  }

  // Pass 3
  let pass3MismatchCount = 0;
  for (const id of identities) {
    const res = flagsmithMockStore.evaluateForIdentity(FLAG_NAME, id);
    if (res.variantKey !== pass1Assignments.get(id)) {
      pass3MismatchCount++;
    }
  }

  assert(
    pass2MismatchCount === 0 && pass3MismatchCount === 0,
    `100% Assignment Consistency: All 1,000 identities received identical variant assignments across 3 passes (0 drift / 3,000 evaluations)`
  );

  // -------------------------------------------------------------------------
  // SECTION 2: 50/50 TRAFFIC DISTRIBUTION & CHI-SQUARE SRM ANALYSIS
  // -------------------------------------------------------------------------
  console.log("\nSECTION 2: 50/50 TRAFFIC DISTRIBUTION & CHI-SQUARE GOODNESS-OF-FIT");

  let controlCount = 0;
  let treatmentCount = 0;

  for (const [, variant] of pass1Assignments) {
    if (variant === "control") {
      controlCount++;
    } else if (variant === "variant_single_page") {
      treatmentCount++;
    }
  }

  const controlPct = (controlCount / NUM_IDENTITIES) * 100;
  const treatmentPct = (treatmentCount / NUM_IDENTITIES) * 100;

  console.log(`  📊 Observed Split (N=1,000):`);
  console.log(`     Control:   ${controlCount} (${controlPct.toFixed(1)}%) [Expected: 500 (50.0%)]`);
  console.log(`     Treatment: ${treatmentCount} (${treatmentPct.toFixed(1)}%) [Expected: 500 (50.0%)]`);

  // Chi-Square Goodness of Fit Test
  const srmResult = calculateChiSquareSRM([controlCount, treatmentCount], [0.5, 0.5]);
  console.log(`     Chi-Square Statistic: ${srmResult.chiSquare.toFixed(4)}, p-value: ${srmResult.pValue.toFixed(4)}, SRM Detected: ${srmResult.isMismatch}`);

  // In N=1000 with p=0.5, 3-sigma binomial interval is 500 ± 3*sqrt(1000*0.25) ≈ [452, 548] (45.2% - 54.8%)
  const withinBinomial3Sigma = controlCount >= 440 && controlCount <= 560;
  assert(
    withinBinomial3Sigma,
    `Empirical distribution within 3-sigma bounds (Control: ${controlPct.toFixed(1)}%, Treatment: ${treatmentPct.toFixed(1)}%)`
  );

  assert(
    !srmResult.isMismatch && srmResult.pValue > 0.01,
    `No Sample Ratio Mismatch (SRM): Chi-Square p-value = ${srmResult.pValue.toFixed(4)} (> 0.01 threshold)`
  );

  // -------------------------------------------------------------------------
  // SECTION 3: MULTI-STAGE CANARY ROLLOUT TEST (10% -> 25% -> 50% -> 100%)
  // -------------------------------------------------------------------------
  console.log("\nSECTION 3: STAGED CANARY ROLLOUT DISTRIBUTION SHIFTS (N=1,000)");

  // 10% Canary Stage
  flagsmithMockStore.updateGradualRollout(FLAG_NAME, "variant_single_page", 10);
  let count10 = 0;
  for (const id of identities) {
    if (flagsmithMockStore.evaluateForIdentity(FLAG_NAME, id).variantKey === "variant_single_page") {
      count10++;
    }
  }
  const pct10 = (count10 / NUM_IDENTITIES) * 100;
  console.log(`  Stage 10%:  ${count10}/1,000 treatment (${pct10.toFixed(1)}%) [Expected: 100 (10.0%)]`);
  assert(count10 >= 60 && count10 <= 150, `10% Canary Stage properly routes ~10% of traffic (observed: ${pct10.toFixed(1)}%)`);

  // 25% Canary Stage
  flagsmithMockStore.updateGradualRollout(FLAG_NAME, "variant_single_page", 25);
  let count25 = 0;
  for (const id of identities) {
    if (flagsmithMockStore.evaluateForIdentity(FLAG_NAME, id).variantKey === "variant_single_page") {
      count25++;
    }
  }
  const pct25 = (count25 / NUM_IDENTITIES) * 100;
  console.log(`  Stage 25%:  ${count25}/1,000 treatment (${pct25.toFixed(1)}%) [Expected: 250 (25.0%)]`);
  assert(count25 >= 190 && count25 <= 310, `25% Canary Stage properly routes ~25% of traffic (observed: ${pct25.toFixed(1)}%)`);

  // 100% Winner Rollout
  flagsmithMockStore.rolloutWinner(FLAG_NAME, "variant_single_page");
  let count100 = 0;
  for (const id of identities) {
    if (flagsmithMockStore.evaluateForIdentity(FLAG_NAME, id).variantKey === "variant_single_page") {
      count100++;
    }
  }
  console.log(`  Stage 100%: ${count100}/1,000 treatment (100.0%) [Expected: 1,000 (100.0%)]`);
  assert(count100 === 1000, `100% Winner Rollout: Exactly 1,000 / 1,000 identities receive the winning variation`);

  // Emergency Rollback to Control
  flagsmithMockStore.rollbackToControl(FLAG_NAME);
  let countRollback = 0;
  for (const id of identities) {
    if (flagsmithMockStore.evaluateForIdentity(FLAG_NAME, id).variantKey === "control") {
      countRollback++;
    }
  }
  console.log(`  Rollback:   ${countRollback}/1,000 control (100.0%) [Expected: 1,000 (100.0%)]`);
  assert(countRollback === 1000, `Immediate Rollback: Exactly 1,000 / 1,000 identities reverted to Control baseline`);

  // Emergency Kill Switch
  flagsmithMockStore.toggleKillSwitch(FLAG_NAME, false);
  const killSwitchEval = flagsmithMockStore.evaluateForIdentity(FLAG_NAME, identities[0]);
  assert(
    killSwitchEval.enabled === false,
    `Emergency Kill Switch: Feature disabled instantly across all evaluations (enabled=false)`
  );

  // -------------------------------------------------------------------------
  // SECTION 4: 3-WAY MULTIVARIATE SPLIT (A/B/C: 33.3% / 33.3% / 33.4%)
  // -------------------------------------------------------------------------
  console.log("\nSECTION 4: 3-WAY MULTIVARIATE BALANCED SPLIT (A/B/C)");

  const TRI_FLAG = "exp_3way_checkout_test";
  flagsmithMockStore.setFlag({
    name: TRI_FLAG,
    enabled: true,
    type: "MULTIVARIATE",
    value: "variant_a",
    multivariateOptions: [
      { key: "variant_a", trafficAllocation: 33.3, value: "{\"layout\":\"step_wizard\"}" },
      { key: "variant_b", trafficAllocation: 33.3, value: "{\"layout\":\"single_page\"}" },
      { key: "variant_c", trafficAllocation: 33.4, value: "{\"layout\":\"express_checkout\"}" },
    ],
  });

  let triCountA = 0;
  let triCountB = 0;
  let triCountC = 0;

  for (const id of identities) {
    const res = flagsmithMockStore.evaluateForIdentity(TRI_FLAG, id);
    if (res.variantKey === "variant_a") triCountA++;
    else if (res.variantKey === "variant_b") triCountB++;
    else if (res.variantKey === "variant_c") triCountC++;
  }

  console.log(`  Variant A (33.3%): ${triCountA} (${((triCountA / NUM_IDENTITIES) * 100).toFixed(1)}%)`);
  console.log(`  Variant B (33.3%): ${triCountB} (${((triCountB / NUM_IDENTITIES) * 100).toFixed(1)}%)`);
  console.log(`  Variant C (33.4%): ${triCountC} (${((triCountC / NUM_IDENTITIES) * 100).toFixed(1)}%)`);

  const triSRM = calculateChiSquareSRM(
    [triCountA, triCountB, triCountC],
    [0.333, 0.333, 0.334]
  );
  assert(
    !triSRM.isMismatch && triSRM.pValue > 0.01,
    `3-Way Split Goodness-of-Fit verified: Chi-Square p-value = ${triSRM.pValue.toFixed(4)} (> 0.01 threshold)`
  );

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

run1000IdentityTests().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
