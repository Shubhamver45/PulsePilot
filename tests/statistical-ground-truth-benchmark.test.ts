/**
 * Statistical Calculations Verification Against Independently Computed Reference Datasets
 * PulsePilot AI — Hackathon Track 02: AI Agents & Feature Flags
 *
 * Verifies Priority 3:
 * 1. High-power conversion dataset (Evan Miller / NIST reference).
 * 2. Underpowered directional dataset (Kohavi / Trustworthy Online Controlled Experiments benchmark).
 * 3. Null-effect / A-A test dataset (Zero false positives, p=1.0).
 * 4. 95% Confidence interval bounds (Wald / Wilson score).
 * 5. Sample size adequacy & power bounds (Fleiss / Lehr formulas).
 * 6. Sample Ratio Mismatch (SRM) Chi-Square detection.
 */

import {
  normalCDF,
  calculateTwoTailedPValue,
  compareVariants,
  calculateRequiredSampleSize,
  calculateChiSquareSRM,
} from "../src/lib/analytics/stats.ts";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertClose(actual: number, expected: number, tolerance: number, testName: string) {
  totalTests++;
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName} (actual: ${actual.toFixed(4)}, expected: ~${expected.toFixed(4)}, diff: ${diff.toFixed(6)})`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} (actual: ${actual.toFixed(4)}, expected: ~${expected.toFixed(4)}, diff: ${diff.toFixed(6)})`);
  }
}

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

async function runStatisticalBenchmarkTests() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — INDEPENDENT STATISTICAL GROUND TRUTH BENCHMARK    ");
  console.log("=====================================================================\n");

  // -------------------------------------------------------------------------
  // DATASET 1: HIGH-POWER CONVERSION EXPERIMENT (EVAN MILLER BENCHMARK)
  // Control: N=50,000, C=2,500 (5.00%) | Treatment: N=50,000, C=2,800 (5.60%)
  // -------------------------------------------------------------------------
  console.log("DATASET 1: HIGH-POWER SIGNIFICANT EXPERIMENT (N=100,000)");

  const ds1 = compareVariants(
    { key: "control", name: "Baseline", isControl: true, exposures: 50000, conversions: 2500 },
    { key: "treatment", name: "Variant", isControl: false, exposures: 50000, conversions: 2800 }
  );

  assertClose(ds1.controlRate, 0.0500, 0.0001, "Control Rate = 5.00%");
  assertClose(ds1.treatmentRate, 0.0560, 0.0001, "Treatment Rate = 5.60%");
  assertClose(ds1.absoluteDifference, 0.0060, 0.0001, "Absolute Uplift = +0.60%");
  assertClose(ds1.relativeUpliftPercent, 12.00, 0.05, "Relative Uplift = +12.00%");
  assertClose(ds1.zScore, 4.234, 0.05, "Z-Score ≈ 4.234");
  assert(ds1.pValue < 0.0001, `Two-tailed p-value < 0.0001 (observed: ${ds1.pValue.toExponential(3)})`);
  assert(ds1.isSignificant === true, "Marked as Statistically Significant at α = 0.05");
  assertClose(ds1.confidenceInterval95[0], 0.0032, 0.0004, "95% CI Lower Bound ≈ +0.32%");
  assertClose(ds1.confidenceInterval95[1], 0.0088, 0.0004, "95% CI Upper Bound ≈ +0.88%");
  assert(ds1.confidenceInterval95[0] > 0, "95% CI strictly excludes zero");
  assert(ds1.bayesianProbabilityToBeatControl > 0.9999, "Bayesian Probability to Beat Control > 99.99%");

  // -------------------------------------------------------------------------
  // DATASET 2: UNDERPOWERED DIRECTIONAL SIGNAL (KOHAVI BENCHMARK)
  // Control: N=2,840, C=116 (4.08%) | Treatment: N=2,810, C=138 (4.91%)
  // -------------------------------------------------------------------------
  console.log("\nDATASET 2: UNDERPOWERED DIRECTIONAL EXPERIMENT (PEEKING BIAS CHECK)");

  const ds2 = compareVariants(
    { key: "control", name: "Multi-Step", isControl: true, exposures: 2840, conversions: 116 },
    { key: "treatment", name: "Single-Page", isControl: false, exposures: 2810, conversions: 138 }
  );

  assertClose(ds2.controlRate, 0.04085, 0.0005, "Control Rate ≈ 4.08%");
  assertClose(ds2.treatmentRate, 0.04911, 0.0005, "Treatment Rate ≈ 4.91%");
  assertClose(ds2.relativeUpliftPercent, 20.23, 0.15, "Relative Uplift ≈ +20.23%");
  assertClose(ds2.zScore, 1.499, 0.05, "Z-Score ≈ 1.50");
  assertClose(ds2.pValue, 0.1338, 0.01, "Two-tailed p-value ≈ 0.134 (p >= 0.05)");
  assert(ds2.isSignificant === false, "Correctly marked as NOT statistically significant (p >= 0.05)");
  assert(
    ds2.confidenceInterval95[0] < 0 && ds2.confidenceInterval95[1] > 0,
    `95% CI crosses zero [-0.25%, +1.91%] (observed: [${(ds2.confidenceInterval95[0]*100).toFixed(2)}%, ${(ds2.confidenceInterval95[1]*100).toFixed(2)}%])`
  );
  assertClose(ds2.bayesianProbabilityToBeatControl, 0.933, 0.015, "Bayesian Win Probability ≈ 93.3%");

  // -------------------------------------------------------------------------
  // DATASET 3: NULL EFFECT / A-A TEST (NO FALSE POSITIVES)
  // Control: N=20,000, C=1,000 (5.00%) | Treatment: N=20,000, C=1,000 (5.00%)
  // -------------------------------------------------------------------------
  console.log("\nDATASET 3: NULL EFFECT / A-A VALIDATION (ZERO FALSE POSITIVES)");

  const ds3 = compareVariants(
    { key: "control", name: "Original", isControl: true, exposures: 20000, conversions: 1000 },
    { key: "treatment", name: "Clone", isControl: false, exposures: 20000, conversions: 1000 }
  );

  assertClose(ds3.controlRate, 0.0500, 0.0001, "Control Rate = 5.00%");
  assertClose(ds3.treatmentRate, 0.0500, 0.0001, "Treatment Rate = 5.00%");
  assertClose(ds3.absoluteDifference, 0.0000, 0.0001, "Absolute Difference = 0.0000");
  assertClose(ds3.relativeUpliftPercent, 0.00, 0.01, "Relative Uplift = 0.00%");
  assertClose(ds3.zScore, 0.0000, 0.0001, "Z-Score = 0.0000");
  assertClose(ds3.pValue, 1.0000, 0.0001, "Two-Tailed p-value = 1.0000");
  assert(ds3.isSignificant === false, "Zero false positive: isSignificant strictly FALSE");
  assertClose(ds3.bayesianProbabilityToBeatControl, 0.5000, 0.001, "Bayesian Probability = 50.00% (Unbiased)");

  // -------------------------------------------------------------------------
  // DATASET 4: SAMPLE SIZE ADEQUACY & POWER CALCULATIONS
  // -------------------------------------------------------------------------
  console.log("\nDATASET 4: SAMPLE SIZE ADEQUACY & POWER BOUNDS");

  // Baseline 5%, Relative MDE 10%, α = 0.05, Power = 80%
  const sampleTarget5Pct = calculateRequiredSampleSize(0.05, 0.10, 0.05, 0.80);
  console.log(`  Required sample size for 5% baseline, 10% MDE: ${sampleTarget5Pct.toLocaleString()} per variant`);
  assert(
    sampleTarget5Pct >= 29000 && sampleTarget5Pct <= 33000,
    `Sample size target matches Lehr/Fleiss standard (~31,200 per variant)`
  );

  // Baseline 10%, Relative MDE 10%, α = 0.05, Power = 80%
  const sampleTarget10Pct = calculateRequiredSampleSize(0.10, 0.10, 0.05, 0.80);
  console.log(`  Required sample size for 10% baseline, 10% MDE: ${sampleTarget10Pct.toLocaleString()} per variant`);
  assert(
    sampleTarget10Pct >= 14000 && sampleTarget10Pct <= 16000,
    `Sample size target matches Lehr/Fleiss standard (~14,750 per variant)`
  );

  // -------------------------------------------------------------------------
  // DATASET 5: SAMPLE RATIO MISMATCH (SRM) CHI-SQUARE VALIDATION
  // -------------------------------------------------------------------------
  console.log("\nDATASET 5: SAMPLE RATIO MISMATCH (SRM) CHI-SQUARE VALIDATION");

  // Severe Mismatch: Expected 50/50, Observed 10,000 vs 12,000 (p < 1e-10)
  const severeSRM = calculateChiSquareSRM([10000, 12000], [0.5, 0.5]);
  assert(severeSRM.isMismatch === true, `Severe SRM correctly detected (ChiSquare: ${severeSRM.chiSquare.toFixed(2)}, p < 0.001)`);

  // Balanced: Expected 50/50, Observed 10,000 vs 10,050 (p ≈ 0.72)
  const balancedSRM = calculateChiSquareSRM([10000, 10050], [0.5, 0.5]);
  assert(balancedSRM.isMismatch === false, `Balanced traffic passed SRM check (ChiSquare: ${balancedSRM.chiSquare.toFixed(2)}, p: ${balancedSRM.pValue.toFixed(3)})`);

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

runStatisticalBenchmarkTests().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
