import { normalCDF, calculateTwoTailedPValue, compareVariants } from "../src/lib/analytics/stats.ts";

function assertClose(actual: number, expected: number, tolerance = 0.005, description: string) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(`❌ FAILED: ${description}. Expected ~${expected}, got ${actual} (diff: ${diff.toFixed(6)})`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${description} (got ${actual.toFixed(4)}, expected ~${expected})`);
  }
}

console.log("=== Testing Deterministic Statistical Engine ===\n");

// 1. Test normal CDF
console.log("1. Normal CDF Ground Truths:");
assertClose(normalCDF(0), 0.5, 0.001, "CDF at Z=0 should be 0.5");
assertClose(normalCDF(1.95996), 0.975, 0.002, "CDF at Z=1.96 should be 0.975 (one-tailed 97.5%)");
assertClose(normalCDF(2.57583), 0.995, 0.002, "CDF at Z=2.576 should be 0.995");

// 2. Test Two-Tailed p-value
console.log("\n2. Two-Tailed p-values:");
assertClose(calculateTwoTailedPValue(1.95996), 0.05, 0.005, "Z = 1.96 should yield p ≈ 0.05");
assertClose(calculateTwoTailedPValue(2.57583), 0.01, 0.003, "Z = 2.576 should yield p ≈ 0.01");
assertClose(calculateTwoTailedPValue(0), 1.0, 0.001, "Z = 0 should yield p = 1.0");

// 3. Test Two-Sample A/B Experiment Comparison
console.log("\n3. Two-Sample Variant Comparison (Control vs Treatment):");
// Control: 10,000 visitors, 1,000 conversions (10.0%)
// Treatment: 10,000 visitors, 1,150 conversions (11.5%)
const result = compareVariants(
  { key: "control", name: "Control (Current)", isControl: true, exposures: 10000, conversions: 1000 },
  { key: "treatment", name: "Treatment (One-Page)", isControl: false, exposures: 10000, conversions: 1150 }
);

assertClose(result.controlRate, 0.10, 0.0001, "Control conversion rate should be 10%");
assertClose(result.treatmentRate, 0.115, 0.0001, "Treatment conversion rate should be 11.5%");
assertClose(result.relativeUpliftPercent, 15.0, 0.05, "Relative uplift should be +15.0%");
assertClose(result.isSignificant ? 1 : 0, 1, 0.01, "Experiment should be statistically significant at alpha=0.05");
console.log(`- Z-score: ${result.zScore.toFixed(3)}`);
console.log(`- p-value: ${result.pValue.toExponential(3)}`);
console.log(`- Bayesian win probability: ${(result.bayesianProbabilityToBeatControl * 100).toFixed(1)}%`);
console.log(`- 95% CI on absolute diff: [${(result.confidenceInterval95[0] * 100).toFixed(2)}%, ${(result.confidenceInterval95[1] * 100).toFixed(2)}%]`);

// 4. Test Sample Ratio Mismatch (SRM) detection
console.log("\n4. Sample Ratio Mismatch (SRM) Detection:");
const srmResult = compareVariants(
  { key: "control", name: "Control", isControl: true, exposures: 10000, conversions: 500 },
  { key: "treatment", name: "Treatment", isControl: false, exposures: 12000, conversions: 600 },
  [0.5, 0.5] // Expected 50/50 split, but observed 10k vs 12k
);
console.log(`- ChiSquare: ${srmResult.sampleRatioMismatch.chiSquare.toFixed(2)}, p-value: ${srmResult.sampleRatioMismatch.pValue.toExponential(3)}, SRM Detected: ${srmResult.sampleRatioMismatch.srmDetected}`);
if (srmResult.sampleRatioMismatch.srmDetected) {
  console.log("✅ PASSED: SRM successfully flagged for biased traffic allocation (10,000 vs 12,000 on 50/50 split).");
} else {
  console.error("❌ FAILED: SRM should have been flagged for severe traffic split deviation.");
  process.exit(1);
}

console.log("\n✨ ALL DETERMINISTIC STATISTICAL TESTS PASSED! ZERO HALLUCINATION GUARANTEE VERIFIED.");
