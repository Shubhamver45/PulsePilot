import { z } from "zod";

/**
 * PulsePilot AI Multi-Agent Schemas
 * Type-safe contracts for all 5 independent AI agents and Orchestrator.
 */

export type AgentRole =
  | "STRATEGY_AGENT"
  | "EXPERIMENT_BUILDER_AGENT"
  | "ANALYTICS_AGENT"
  | "RELEASE_GUARDIAN_AGENT"
  | "GROWTH_ADVISOR_AGENT";

// =============================================================================
// AGENT 1: STRATEGY AGENT SCHEMAS
// =============================================================================
export const StrategyAgentOutputSchema = z.object({
  agent: z.literal("STRATEGY_AGENT"),
  experiment_name: z.string().min(3),
  business_problem: z.string().min(10),
  hypothesis: z.string().min(15),
  objective: z.string().min(3),
  flagsmith_feature_name: z.string().regex(/^[a-z0-9_]+$/),
  target_audience: z.object({
    segmentName: z.string(),
    description: z.string(),
  }),
  variants: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      description: z.string(),
      isControl: z.boolean(),
      trafficAllocation: z.number().min(0).max(100),
      featureValue: z.record(z.any()),
      whyWorthTesting: z.string(),
    })
  ).min(2),
  primary_metric: z.object({
    key: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string(),
  }),
  secondary_metrics: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      type: z.string(),
    })
  ),
  guardrail_metrics: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      type: z.string(),
    })
  ),
  estimated_duration_days: z.number().positive().default(14),
});

export type StrategyAgentOutput = z.infer<typeof StrategyAgentOutputSchema>;

// =============================================================================
// AGENT 2: EXPERIMENT BUILDER AGENT SCHEMAS
// =============================================================================
export const BuilderAgentOutputSchema = z.object({
  agent: z.literal("EXPERIMENT_BUILDER_AGENT"),
  validation: z.object({
    isValid: z.boolean(),
    totalTrafficAllocation: z.number(),
    trafficErrors: z.array(z.string()),
    eventsExistCheck: z.object({
      allEventsVerified: z.boolean(),
      missingEvents: z.array(z.string()),
    }),
  }),
  flagsmith_configuration: z.object({
    feature_name: z.string(),
    feature_type: z.literal("MULTIVARIATE"),
    default_state: z.boolean(),
    variations_payload: z.array(
      z.object({
        variant_key: z.string(),
        percentage_split: z.number(),
        string_value: z.string(),
      })
    ),
  }),
  integration_patch: z.object({
    targetFiles: z.array(z.string()),
    requiredSdk: z.string(),
    initializationSnippet: z.string(),
    flagEvaluationSnippet: z.string(),
    telemetryTrackingSnippet: z.string(),
  }),
  approval_status: z.enum(["PENDING_HUMAN_APPROVAL", "APPROVED", "REJECTED"]),
  human_in_the_loop_warning: z.string(),
});

export type BuilderAgentOutput = z.infer<typeof BuilderAgentOutputSchema>;

// =============================================================================
// AGENT 3: ANALYTICS AGENT SCHEMAS
// =============================================================================
export const AnalyticsAgentOutputSchema = z.object({
  agent: z.literal("ANALYTICS_AGENT"),
  experiment_id: z.string(),
  experiment_name: z.string(),
  flagsmith_feature: z.string(),
  sample_size_assessment: z.object({
    currentSamples: z.number(),
    targetSamples: z.number(),
    adequacy: z.enum(["INSUFFICIENT", "APPROACHING", "SUFFICIENT"]),
    sufficientEvidence: z.boolean(),
  }),
  performance_analysis: z.object({
    controlRate: z.number(),
    treatmentRate: z.number(),
    relativeUpliftPercent: z.number(),
    pValue: z.number(),
    bayesianProbabilityToBeatControl: z.number(),
    confidenceInterval95: z.tuple([z.number(), z.number()]),
    isStatisticallySignificant: z.boolean(),
  }),
  executive_summary: z.string(),
  evidence_explanation: z.string(),
  anomalies_detected: z.array(z.string()),
  uncertainty_disclosure: z.string(),
});

export type AnalyticsAgentOutput = z.infer<typeof AnalyticsAgentOutputSchema>;

// =============================================================================
// AGENT 4: RELEASE GUARDIAN AGENT SCHEMAS
// =============================================================================
export const ReleaseGuardianOutputSchema = z.object({
  agent: z.literal("RELEASE_GUARDIAN_AGENT"),
  experiment_id: z.string(),
  guardrail_status: z.object({
    allGuardrailsHealthy: z.boolean(),
    guardrailDetails: z.array(
      z.object({
        metricKey: z.string(),
        metricName: z.string(),
        baselineRate: z.number(),
        currentRate: z.number(),
        deltaPercent: z.number(),
        status: z.enum(["HEALTHY", "WARNING", "CRITICAL_BREACH"]),
      })
    ),
  }),
  recommendation: z.object({
    action: z.enum([
      "CONTINUE_EXPERIMENT",
      "PAUSE_INVESTIGATE",
      "CANARY_RAMP_UP",
      "ROLLOUT_WINNER_100",
      "EMERGENCY_ROLLBACK_KILL_SWITCH",
    ]),
    urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    targetVariantKey: z.string().nullable(),
    rationale: z.string(),
    flagsmithActionPayload: z.object({
      featureName: z.string(),
      enabledState: z.boolean(),
      proposedAllocation: z.record(z.number()),
    }),
  }),
  safety_handshake: z.object({
    humanApprovalRequired: z.literal(true),
    approverRoleRequired: z.string(),
    warningNotice: z.string(),
  }),
});

export type ReleaseGuardianOutput = z.infer<typeof ReleaseGuardianOutputSchema>;

// =============================================================================
// AGENT 5: GROWTH ADVISOR AGENT SCHEMAS
// =============================================================================
export const GrowthAdvisorOutputSchema = z.object({
  agent: z.literal("GROWTH_ADVISOR_AGENT"),
  context_analyzed: z.string(),
  key_findings: z.array(
    z.object({
      observation: z.string(),
      psychologicalInsight: z.string(),
      commercialImpact: z.string(),
    })
  ),
  business_recommendations: z.array(z.string()),
  follow_up_experiments: z.array(
    z.object({
      title: z.string(),
      hypothesis: z.string(),
      estimatedLift: z.string(),
      implementationDifficulty: z.enum(["LOW", "MEDIUM", "HIGH"]),
    })
  ),
  learning_brief: z.string(),
});

export type GrowthAdvisorOutput = z.infer<typeof GrowthAdvisorOutputSchema>;

// =============================================================================
// ORCHESTRATOR SCHEMAS
// =============================================================================
export const OrchestratorRoutingSchema = z.object({
  selectedAgent: z.enum([
    "STRATEGY_AGENT",
    "EXPERIMENT_BUILDER_AGENT",
    "ANALYTICS_AGENT",
    "RELEASE_GUARDIAN_AGENT",
    "GROWTH_ADVISOR_AGENT",
  ]),
  userIntent: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  extractedEntities: z.object({
    experimentNameOrFlag: z.string().optional(),
    variantKey: z.string().optional(),
    metricGoal: z.string().optional(),
  }),
});

export type OrchestratorRouting = z.infer<typeof OrchestratorRoutingSchema>;

export const OrchestratorResponseSchema = z.object({
  orchestrationId: z.string(),
  timestamp: z.string(),
  inputPrompt: z.string(),
  routedAgent: z.string(),
  agentName: z.string(),
  executionTimeMs: z.number(),
  status: z.enum(["SUCCESS", "ERROR", "CONFIGURATION_REQUIRED"]),
  error: z.string().optional(),
  data: z.union([
    StrategyAgentOutputSchema,
    BuilderAgentOutputSchema,
    AnalyticsAgentOutputSchema,
    ReleaseGuardianOutputSchema,
    GrowthAdvisorOutputSchema,
    z.record(z.any()),
  ]),
});

export type OrchestratorResponse = z.infer<typeof OrchestratorResponseSchema>;

