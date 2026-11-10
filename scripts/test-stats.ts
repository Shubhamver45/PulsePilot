import {
  normalCDF,
  calculateTwoTailedPValue,
  compareVariants,
  calculateRequiredSampleSize,
} from "../src/lib/analytics/stats.ts";
import { assertZeroSecretLeakage } from "../src/lib/security/input-sanitizer.ts";

function assertClose(actual: number, expected: number, tolerance = 0.005, description: string) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(`❌ FAILED: ${description}. Expected ~${expected}, got ${actual} (diff: ${diff.toFixed(6)})`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${description} (got ${actual.toFixed(4)}, expected ~${expected})`);
  }
}

function assertThrows(fn: () => void, expectedErrorType: any, description: string) {
  try {
    fn();
    console.error(`❌ FAILED: ${description}. Expected function to throw ${expectedErrorType.name}, but it did not.`);
    process.exit(1);
  } catch (err: any) {
    if (err instanceof expectedErrorType) {
      console.log(`✅ PASSED: ${description} (threw ${err.name}: "${err.message}")`);
    } else {
      console.error(`❌ FAILED: ${description}. Expected ${expectedErrorType.name}, got ${err}`);
      process.exit(1);
    }
  }
}

console.log("=== Testing Deterministic Statistical Engine & Security Hardening ===\n");

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
  [0.5, 0.5]
);
console.log(`- ChiSquare: ${srmResult.sampleRatioMismatch.chiSquare.toFixed(2)}, p-value: ${srmResult.sampleRatioMismatch.pValue.toExponential(3)}, SRM Detected: ${srmResult.sampleRatioMismatch.srmDetected}`);
if (srmResult.sampleRatioMismatch.srmDetected) {
  console.log("✅ PASSED: SRM successfully flagged for biased traffic allocation (10,000 vs 12,000 on 50/50 split).");
} else {
  console.error("❌ FAILED: SRM should have been flagged for severe traffic split deviation.");
  process.exit(1);
}

// 5. Test Sample Size Estimation & Edge Cases
console.log("\n5. Sample Size Estimation (calculateRequiredSampleSize) & Edge Case Validation:");

// Normal calculation: baseline 5%, MDE 10% (relative), alpha 0.05, power 0.80
const normalSample = calculateRequiredSampleSize(0.05, 0.10, 0.05, 0.80);
console.log(`- Required sample size for 5% baseline, 10% MDE: ${normalSample} per variant`);
if (normalSample > 25000 && normalSample < 35000) {
  console.log(`✅ PASSED: Normal valid sample size calculated correctly (~30,000 visitors).`);
} else {
  console.error(`❌ FAILED: Unexpected sample size: ${normalSample}`);
  process.exit(1);
}

// Extremely small MDE (e.g. 1% relative lift): should yield large sample size (> 1M)
const smallMdeSample = calculateRequiredSampleSize(0.05, 0.01, 0.05, 0.80);
console.log(`- Required sample size for 5% baseline, 1% MDE: ${smallMdeSample} per variant`);
if (smallMdeSample > 1_000_000) {
  console.log(`✅ PASSED: Extremely small MDE correctly requires large sample size.`);
} else {
  console.error(`❌ FAILED: Small MDE sample size expected > 1,000,000, got ${smallMdeSample}`);
  process.exit(1);
}

// Zero MDE must throw RangeError
assertThrows(
  () => calculateRequiredSampleSize(0.05, 0),
  RangeError,
  "Zero MDE (relativeMDE = 0) must throw RangeError"
);

// Negative MDE must throw RangeError
assertThrows(
  () => calculateRequiredSampleSize(0.05, -0.10),
  RangeError,
  "Negative MDE (relativeMDE = -0.10) must throw RangeError"
);

// Undefined/NaN relativeMDE must throw RangeError
assertThrows(
  () => calculateRequiredSampleSize(0.05, NaN),
  RangeError,
  "NaN relativeMDE must throw RangeError"
);

// Invalid baselineRate (<= 0 or >= 1) must throw RangeError
assertThrows(
  () => calculateRequiredSampleSize(0, 0.10),
  RangeError,
  "Zero baselineRate must throw RangeError"
);
assertThrows(
  () => calculateRequiredSampleSize(1.0, 0.10),
  RangeError,
  "BaselineRate = 1.0 must throw RangeError"
);
assertThrows(
  () => calculateRequiredSampleSize(-0.05, 0.10),
  RangeError,
  "Negative baselineRate must throw RangeError"
);

// Invalid alpha / power must throw RangeError
assertThrows(
  () => calculateRequiredSampleSize(0.05, 0.10, 0),
  RangeError,
  "Alpha = 0 must throw RangeError"
);
assertThrows(
  () => calculateRequiredSampleSize(0.05, 0.10, 0.05, 0),
  RangeError,
  "Power = 0 must throw RangeError"
);

// 6. Test Secret Scanning & Input Sanitization
console.log("\n6. Secret Leakage Detection (assertZeroSecretLeakage):");

// Safe object should pass
const safePayload = {
  experimentId: "exp_101",
  recommendedVariant: "social_proof_v2",
  analysis: "Conversion rate increased from 10.0% to 11.5% with p < 0.01.",
};
if (assertZeroSecretLeakage(safePayload)) {
  console.log("✅ PASSED: Clean output payload approved without false positives.");
}

// Test detection of Google AI Studio AQ. key
assertThrows(
  () => assertZeroSecretLeakage({ leakedKey: "AQ.mockTestingPattern123456789012345678901234567890" }),
  Error,
  "Detection of Google AI Studio AQ. key pattern"
);

// Test detection of legacy Google API key
assertThrows(
  () => assertZeroSecretLeakage({ config: "AIzaSyD-mockKey12345678901234567890" }),
  Error,
  "Detection of Google Legacy API key pattern"
);

// Test detection of Flagsmith server environment key
assertThrows(
  () => assertZeroSecretLeakage({ serverKey: "ser.WfzY3pJshTQofYbAtWGSkR1234" }),
  Error,
  "Detection of Flagsmith server-side environment key pattern"
);

// Test detection of Database URI
assertThrows(
  () => assertZeroSecretLeakage({ connection: "postgresql://postgres:secret123@db.example.co:5432/postgres" }),
  Error,
  "Detection of PostgreSQL connection string with password"
);

console.log("\n✨ ALL DETERMINISTIC STATISTICAL & SECURITY HARDENING TESTS PASSED!");
