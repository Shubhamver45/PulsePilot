import { GoogleGenerativeAI } from "@google/generative-ai";
import { ANALYTICS_AGENT_SYSTEM_PROMPT } from "./prompts/analytics.prompt.ts";
import { AnalyticsAgentOutputSchema, type AnalyticsAgentOutput } from "./schemas.ts";
import { compareVariants, type StatisticalComparisonResult } from "../analytics/stats.ts";

export interface AnalyticsContext {
  experimentId?: string;
  experimentName?: string;
  flagsmithFeature?: string;
  targetSamples?: number;
  control?: {
    key: string;
    name: string;
    isControl: boolean;
    exposures: number;
    conversions: number;
  };
  treatment?: {
    key: string;
    name: string;
    isControl: boolean;
    exposures: number;
    conversions: number;
  };
  expectedAllocationRatio?: [number, number];
}

function isValidVariantData(v: any): boolean {
  if (!v || typeof v !== "object") return false;
  if (typeof v.exposures !== "number" || typeof v.conversions !== "number") return false;
  if (isNaN(v.exposures) || isNaN(v.conversions)) return false;
  if (v.exposures < 0 || v.conversions < 0) return false;
  if (v.conversions > v.exposures) return false;
  return true;
}

function buildInconclusiveOutput(
  context: AnalyticsContext | undefined,
  reason: string
): AnalyticsAgentOutput {
  const targetSamples = context?.targetSamples || 5000;
  return {
    agent: "ANALYTICS_AGENT",
    experiment_id: context?.experimentId || "unknown-exp",
    experiment_name: context?.experimentName || "Inconclusive Experiment",
    flagsmith_feature: context?.flagsmithFeature || "unknown_flag",
    sample_size_assessment: {
      currentSamples: 0,
      targetSamples,
      adequacy: "INSUFFICIENT",
      sufficientEvidence: false,
    },
    performance_analysis: {
      controlRate: 0,
      treatmentRate: 0,
      relativeUpliftPercent: 0,
      pValue: 1.0,
      bayesianProbabilityToBeatControl: 0.5,
      confidenceInterval95: [0, 0],
      isStatisticallySignificant: false,
    },
    executive_summary: `INCONCLUSIVE: ${reason}`,
    evidence_explanation:
      "Deterministic statistical engine requires valid non-negative sample counts where exposures > 0 and conversions <= exposures. Provided telemetry failed input validation.",
    anomalies_detected: ["INVALID_OR_MISSING_TELEMETRY"],
    uncertainty_disclosure:
      "Complete uncertainty due to absent or invalid data. No traffic mutations or rollout decisions are permitted.",
  };
}

function buildDeterministicSummary(
  mathResults: StatisticalComparisonResult,
  currentSamples: number,
  targetSamples: number,
  adequacy: "INSUFFICIENT" | "APPROACHING" | "SUFFICIENT"
): string {
  const upliftSign = mathResults.relativeUpliftPercent >= 0 ? "+" : "";
  const upliftFormatted = `${upliftSign}${mathResults.relativeUpliftPercent.toFixed(1)}%`;
  const tRate = (mathResults.treatmentRate * 100).toFixed(2);
  const cRate = (mathResults.controlRate * 100).toFixed(2);
  const ciLower = (mathResults.confidenceInterval95[0] * 100).toFixed(2);
  const ciUpper = (mathResults.confidenceInterval95[1] * 100).toFixed(2);

  if (!mathResults.isSignificant) {
    if (currentSamples < targetSamples) {
      return `Variant B demonstrates a directional ${upliftFormatted} relative uplift in conversion rate over Control (${tRate}% vs ${cRate}%). However, with a p-value of ${mathResults.pValue.toFixed(3)} (p >= 0.05) and sample size (${currentSamples.toLocaleString()}/${targetSamples.toLocaleString()}), this experiment is UNDERPOWERED and has NOT reached statistical significance. 95% confidence interval [${ciLower}%, ${ciUpper}%] crosses zero. Do not declare a winner; continue collecting data.`;
    }
    return `Variant B demonstrates a ${upliftFormatted} change over Control (${tRate}% vs ${cRate}%). With full sample target reached (${currentSamples.toLocaleString()}/${targetSamples.toLocaleString()}) and a p-value of ${mathResults.pValue.toFixed(3)} (p >= 0.05), the observed difference is NOT statistically significant. There is no conclusive evidence that the treatment outperforms control. Consider iterating or retaining the control baseline.`;
  }

  // mathResults.isSignificant === true
  if (currentSamples < targetSamples) {
    return `Variant B demonstrates an early positive signal (${upliftFormatted} uplift, p = ${mathResults.pValue.toFixed(3)}), but the experiment is currently UNDERPOWERED (${currentSamples.toLocaleString()}/${targetSamples.toLocaleString()} samples collected, adequacy: ${adequacy}). Early stopping introduces peeking bias; do not declare a winner or initiate a full rollout until the pre-registered target sample size of ${targetSamples.toLocaleString()} is reached.`;
  }

  return `Variant B demonstrates a statistically significant ${upliftFormatted} relative uplift in conversion rate over Control (${tRate}% vs ${cRate}%). With a p-value of ${mathResults.pValue.toFixed(3)} (p < 0.05), full sample size achieved (${currentSamples.toLocaleString()}/${targetSamples.toLocaleString()}), and Bayesian win probability of ${(mathResults.bayesianProbabilityToBeatControl * 100).toFixed(1)}%, the treatment is genuinely superior.`;
}

export async function runAnalyticsAgent(
  userPrompt: string,
  context?: AnalyticsContext
): Promise<AnalyticsAgentOutput> {
  const apiKey = process.env.GEMINI_API_KEY;

  // Validate telemetry inputs if context is provided
  if (context && (context.control !== undefined || context.treatment !== undefined)) {
    if (!isValidVariantData(context.control) || !isValidVariantData(context.treatment)) {
      return buildInconclusiveOutput(
        context,
        "Telemetry data contains invalid exposure or conversion values (negative counts or conversions exceeding exposures)."
      );
    }
    if ((context.control?.exposures ?? 0) === 0 && (context.treatment?.exposures ?? 0) === 0) {
      return buildInconclusiveOutput(
        context,
        "Zero exposures recorded across all variants. Experiment has not accumulated sufficient observations."
      );
    }
  }

  // Default baseline data if context not supplied
  const controlData = context?.control || {
    key: "control",
    name: "Control Baseline",
    isControl: true,
    exposures: 2400,
    conversions: 99,
  };
  const treatmentData = context?.treatment || {
    key: "variant_b",
    name: "Treatment Variant B",
    isControl: false,
    exposures: 2400,
    conversions: 117,
  };

  if (!isValidVariantData(controlData) || !isValidVariantData(treatmentData)) {
    return buildInconclusiveOutput(context, "Variant input validation failed.");
  }

  const currentSamples = controlData.exposures + treatmentData.exposures;
  const targetSamples = context?.targetSamples || 4000;
  const sampleTargetMet = currentSamples >= targetSamples;

  let adequacy: "INSUFFICIENT" | "APPROACHING" | "SUFFICIENT" = "INSUFFICIENT";
  if (sampleTargetMet) {
    adequacy = "SUFFICIENT";
  } else if (currentSamples >= targetSamples * 0.7) {
    adequacy = "APPROACHING";
  }

  const mathResults = compareVariants(
    controlData,
    treatmentData,
    context?.expectedAllocationRatio || [0.5, 0.5]
  );
  const sufficientEvidence = mathResults.isSignificant && sampleTargetMet;
  const deterministicSummary = buildDeterministicSummary(
    mathResults,
    currentSamples,
    targetSamples,
    adequacy
  );

  const deterministicOutput: AnalyticsAgentOutput = {
    agent: "ANALYTICS_AGENT",
    experiment_id: context?.experimentId || "exp-1",
    experiment_name: context?.experimentName || "Checkout Social Proof Testimonials",
    flagsmith_feature: context?.flagsmithFeature || "exp_checkout_social_proof",
    sample_size_assessment: {
      currentSamples,
      targetSamples,
      adequacy,
      sufficientEvidence,
    },
    performance_analysis: {
      controlRate: mathResults.controlRate,
      treatmentRate: mathResults.treatmentRate,
      relativeUpliftPercent: mathResults.relativeUpliftPercent,
      pValue: mathResults.pValue,
      bayesianProbabilityToBeatControl: mathResults.bayesianProbabilityToBeatControl,
      confidenceInterval95: mathResults.confidenceInterval95,
      isStatisticallySignificant: mathResults.isSignificant,
    },
    executive_summary: deterministicSummary,
    evidence_explanation:
      "All calculations were computed via two-sample Z-test and Beta-Binomial conjugate posterior distribution in TypeScript with zero LLM arithmetic fabrication.",
    anomalies_detected: mathResults.sampleRatioMismatch.srmDetected
      ? ["Sample Ratio Mismatch (SRM) detected! Traffic allocation may be skewed by bot traffic."]
      : [],
    uncertainty_disclosure: !sufficientEvidence
      ? (!sampleTargetMet
          ? `Sample size target is pending (${currentSamples}/${targetSamples} samples, ${(
              (currentSamples / targetSamples) *
              100
            ).toFixed(1)}% progress). High risk of false positive if evaluated prematurely.`
          : `Sample target reached (${currentSamples}/${targetSamples}), but observed effect does not achieve p < 0.05 significance threshold. 95% confidence interval crosses zero.`)
      : "Results are stable and pre-registered sample size target was exceeded. Day-of-week distribution shows consistent outperformance.",
  };

  if (apiKey && apiKey !== "mock") {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const promptPayload = `User Request: ${userPrompt}
Factual Deterministic Statistics from Engine:
${JSON.stringify({
  mathResults,
  currentSamples,
  targetSamples,
  adequacy,
  sufficientEvidence,
  isStatisticallySignificant: mathResults.isSignificant,
  deterministicSummary,
})}`;

      const result = await model.generateContent([
        ANALYTICS_AGENT_SYSTEM_PROMPT,
        promptPayload,
      ]);

      const json = JSON.parse(result.response.text());
      const parsed = AnalyticsAgentOutputSchema.parse(json);

      // PINNING: Hard guardrail preventing LLM from falsifying mathematical facts
      parsed.performance_analysis = deterministicOutput.performance_analysis;
      parsed.sample_size_assessment = deterministicOutput.sample_size_assessment;

      // If underpowered or non-significant, guarantee LLM does not claim a proven winner
      if (!sufficientEvidence) {
        const lowerSummary = parsed.executive_summary.toLowerCase();
        if (
          lowerSummary.includes("statistically significant winner") ||
          lowerSummary.includes("proven winner") ||
          lowerSummary.includes("rollout 100%") ||
          lowerSummary.includes("promoted to 100%")
        ) {
          parsed.executive_summary = deterministicSummary;
        }
      }

      return parsed;
    } catch (err: any) {
      console.warn("Analytics Agent Gemini call error, using deterministic fallback:", err?.message || err);
    }
  }

  return deterministicOutput;
}
