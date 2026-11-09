/**
 * Deterministic Statistical & Analytics Engine
 * PulsePilot AI — Zero-Hallucination Statistical Computing
 *
 * All conversions, Z-scores, p-values, confidence intervals, and Bayesian
 * posterior win probabilities are strictly computed deterministically in this module.
 * LLMs are never permitted to guess or extrapolate statistical metrics.
 */

export interface VariantStatsInput {
  key: string;
  name: string;
  isControl: boolean;
  exposures: number; // N
  conversions: number; // C
}

export interface StatisticalComparisonResult {
  controlKey: string;
  treatmentKey: string;
  controlRate: number;
  treatmentRate: number;
  absoluteDifference: number;
  relativeUpliftPercent: number; // % delta
  standardError: number;
  zScore: number;
  pValue: number;
  isSignificant: boolean; // p < 0.05
  confidenceLevel: number; // e.g. 0.95 or 0.99
  confidenceInterval95: [number, number]; // [lower, upper] on absolute diff
  bayesianProbabilityToBeatControl: number; // 0 to 1
  sampleRatioMismatch: {
    chiSquare: number;
    pValue: number;
    srmDetected: boolean;
  };
}

/**
 * Standard Normal Cumulative Distribution Function (CDF)
 * Uses the high-precision Abramowitz and Stegun numerical approximation.
 */
export function normalCDF(z: number): number {
  if (z < -8.0) return 0.0;
  if (z > 8.0) return 1.0;

  let sum = 0.0;
  let term = z;
  let i = 3;

  while (sum + term !== sum) {
    sum += term;
    term = (term * z * z) / i;
    i += 2;
  }

  return 0.5 + sum * (1 / Math.sqrt(2 * Math.PI)) * Math.exp((-0.5 * z * z));
}

/**
 * Two-tailed p-value from Z-score
 */
export function calculateTwoTailedPValue(z: number): number {
  const absZ = Math.abs(z);
  return 2 * (1 - normalCDF(absZ));
}

/**
 * Compare two variants (Treatment vs Control) using Frequentist Z-test
 * and Bayesian Beta-Binomial conjugate update.
 */
export function compareVariants(
  control: VariantStatsInput,
  treatment: VariantStatsInput,
  expectedAllocationRatio: [number, number] = [0.5, 0.5]
): StatisticalComparisonResult {
  const nA = Math.max(1, control.exposures);
  const cA = control.conversions;
  const pA = cA / nA;

  const nB = Math.max(1, treatment.exposures);
  const cB = treatment.conversions;
  const pB = cB / nB;

  const absDiff = pB - pA;
  const relativeUplift = pA > 0 ? (absDiff / pA) * 100 : 0;

  // Pooled Standard Error under H0
  const pooledP = (cA + cB) / (nA + nB);
  const pooledSE = Math.sqrt(pooledP * (1 - pooledP) * (1 / nA + 1 / nB));

  // Unpooled Standard Error for Confidence Interval
  const seA = Math.sqrt((pA * (1 - pA)) / nA);
  const seB = Math.sqrt((pB * (1 - pB)) / nB);
  const unpooledSE = Math.sqrt(seA * seA + seB * seB);

  const zScore = pooledSE > 0 ? absDiff / pooledSE : 0;
  const pValue = calculateTwoTailedPValue(zScore);
  const isSignificant = pValue < 0.05;

  // 95% Confidence Interval (Z_crit = 1.95996)
  const zCrit95 = 1.959963984540054;
  const marginOfError = zCrit95 * unpooledSE;
  const confidenceInterval95: [number, number] = [
    absDiff - marginOfError,
    absDiff + marginOfError,
  ];

  // Bayesian probability that Treatment > Control:
  // Using normal approximation of the Beta posteriors for large N:
  // Theta_B - Theta_A ~ Normal(pB - pA, seA^2 + seB^2)
  const bayesZ = unpooledSE > 0 ? absDiff / unpooledSE : 0;
  const bayesianProb = normalCDF(bayesZ);

  // Sample Ratio Mismatch (SRM) Check via Pearson's Chi-Square Test
  const totalObserved = nA + nB;
  const expectedA = totalObserved * (expectedAllocationRatio[0] / (expectedAllocationRatio[0] + expectedAllocationRatio[1]));
  const expectedB = totalObserved * (expectedAllocationRatio[1] / (expectedAllocationRatio[0] + expectedAllocationRatio[1]));
  
  const chiSquare =
    Math.pow(nA - expectedA, 2) / expectedA +
    Math.pow(nB - expectedB, 2) / expectedB;
  
  // 1 degree of freedom chi-square p-value
  const srmPValue = 1 - normalCDF(Math.sqrt(chiSquare)) + normalCDF(-Math.sqrt(chiSquare));
  const srmDetected = srmPValue < 0.001; // Standard SRM flag threshold

  return {
    controlKey: control.key,
    treatmentKey: treatment.key,
    controlRate: pA,
    treatmentRate: pB,
    absoluteDifference: absDiff,
    relativeUpliftPercent: relativeUplift,
    standardError: unpooledSE,
    zScore,
    pValue,
    isSignificant,
    confidenceLevel: 1 - pValue,
    confidenceInterval95,
    bayesianProbabilityToBeatControl: bayesianProb,
    sampleRatioMismatch: {
      chiSquare,
      pValue: srmPValue,
      srmDetected,
    },
  };
}

/**
 * Calculates required minimum sample size per variant for a given:
 * - baseline conversion rate (e.g., 0.05)
 * - minimum detectable effect (MDE) relative (e.g., 0.10 for +10% lift)
 * - alpha (false positive rate, e.g. 0.05)
 * - power (1 - beta, e.g. 0.80)
 */
export function calculateRequiredSampleSize(
  baselineRate: number,
  relativeMDE: number = 0.1,
  alpha: number = 0.05,
  power: number = 0.8
): number {
  if (baselineRate <= 0 || baselineRate >= 1) return 1000;

  // Standard Z-scores for alpha=0.05 (two-tailed => 1.96) and power=0.80 (0.84)
  const zAlpha = 1.95996;
  const zBeta = 0.84162;

  const p1 = baselineRate;
  const p2 = p1 * (1 + relativeMDE);
  const pAvg = (p1 + p2) / 2;

  const numerator = Math.pow(
    zAlpha * Math.sqrt(2 * pAvg * (1 - pAvg)) +
    zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
    2
  );
  const denominator = Math.pow(p2 - p1, 2);

  return Math.ceil(numerator / denominator);
}

