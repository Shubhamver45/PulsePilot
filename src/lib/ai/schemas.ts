import { z } from "zod";

/**
 * Zod Schema for Structured Experiment Specification
 * Strictly enforced across Gemini AI output and API endpoints.
 */

export const VariantSchema = z.object({
  key: z.string().min(1).describe("Alphanumeric key, e.g. control, variant_single_page"),
  name: z.string().min(1).describe("Human-readable variant name"),
  description: z.string().describe("Description of what this variant does"),
  isControl: z.boolean().default(false),
  trafficAllocation: z.number().min(0).max(100).describe("Percentage of traffic, sum must equal 100"),
  featureValue: z.record(z.any()).describe("JSON payload delivered via Flagsmith feature state"),
  whyWorthTesting: z.string().describe("Behavioral psychology or product reasoning for this variant"),
});

export const MetricItemSchema = z.object({
  key: z.string().min(1).describe("Exact telemetry event name in the codebase"),
  name: z.string().min(1).describe("Human-readable metric name"),
  type: z.enum(["CONVERSION_RATE", "COUNT", "REVENUE", "DURATION", "RATIO"]),
  direction: z.enum(["INCREASE", "DECREASE"]),
  description: z.string(),
});

export const ExperimentStrategySchema = z.object({
  experiment_name: z.string().min(3).max(120),
  business_problem: z.string().min(10),
  hypothesis: z.string().min(15),
  objective: z.string().min(3),
  flagsmith_feature_name: z.string().regex(/^[a-z0-9_]+$/, "Must be lowercase alphanumeric with underscores"),
  control_variant: VariantSchema,
  treatment_variants: z.array(VariantSchema).min(1).max(4),
  primary_metric: MetricItemSchema,
  secondary_metrics: z.array(MetricItemSchema).default([]),
  guardrail_metrics: z.array(MetricItemSchema).default([]),
  target_audience: z.object({
    segmentName: z.string(),
    description: z.string(),
    flagsmithRule: z.string().optional(),
  }),
  traffic_allocation: z.object({
    controlPercent: z.number(),
    treatmentPercents: z.record(z.number()),
    totalPercent: z.number(),
  }),
  required_events: z.array(
    z.object({
      eventName: z.string(),
      triggerPoint: z.string(),
      payloadSchema: z.record(z.string()).optional(),
    })
  ),
  implementation_plan: z.array(z.string()).min(2),
  potential_risks: z.array(z.string()).min(1),
  success_criteria: z.array(z.string()).min(1),
});

export type ExperimentStrategy = z.infer<typeof ExperimentStrategySchema>;
export type VariantSpec = z.infer<typeof VariantSchema>;
export type MetricSpec = z.infer<typeof MetricItemSchema>;

/**
 * Zod Schema for AI Experiment Readiness Review
 */
export const ReadinessReviewSchema = z.object({
  qualityScore: z.number().min(0).max(100),
  isReadyForLaunch: z.boolean(),
  checks: z.object({
    isHypothesisTestable: z.object({ pass: z.boolean(), feedback: z.string() }),
    isPrimaryMetricMeasurable: z.object({ pass: z.boolean(), feedback: z.string() }),
    areEventsImplemented: z.object({ pass: z.boolean(), feedback: z.string() }),
    areVariantsMeaningfullyDifferent: z.object({ pass: z.boolean(), feedback: z.string() }),
    areGuardrailsAppropriate: z.object({ pass: z.boolean(), feedback: z.string() }),
    isTrafficAllocationValid: z.object({ pass: z.boolean(), feedback: z.string() }),
    isTechnicallyFeasible: z.object({ pass: z.boolean(), feedback: z.string() }),
  }),
  strengths: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type ReadinessReview = z.infer<typeof ReadinessReviewSchema>;

