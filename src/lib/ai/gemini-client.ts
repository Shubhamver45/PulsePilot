import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ExperimentStrategy,
  ExperimentStrategySchema,
  ReadinessReview,
  ReadinessReviewSchema,
} from "./schemas";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export interface StrategyGenerationResult {
  strategy: ExperimentStrategy;
  provider: "gemini" | "deterministic";
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export async function formulateExperimentStrategyWithMetadata(
  objective: string,
  userPrompt: string
): Promise<StrategyGenerationResult> {
  const isMock = !GEMINI_API_KEY || GEMINI_API_KEY === "mock";
  const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!isMock) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const systemPrompt = `You are the Principal Experimentation Architect for PulsePilot AI.
Your role is to formulate a scientifically rigorous, technically feasible A/B or multivariate experiment for Flagsmith.
Given the user's business objective and product intent, produce a complete structured JSON response adhering strictly to the schema.
Ensure:
1. "flagsmith_feature_name" starts with "exp_" and uses only lowercase alphanumeric and underscores.
2. Total traffic allocation between control and treatments equals exactly 100%.
3. The control variant key is exactly "control" and isControl is true.
4. Treatment keys are unique lowercase alphanumeric/underscore identifiers and isControl is false.
5. Every variant has a distinct JSON remote-config value.
6. Explain why each variant is worth testing ("whyWorthTesting").
7. The primary metric key is included in required_events.
8. Include at least one measurable operational guardrail.
9. Add a required_events entry for the primary metric and for every guardrail metric, using each exact metric key.`;

      const userContent = `Objective Category: ${objective}\nUser Natural Language Description: ${userPrompt}`;
      const result = await model.generateContent([systemPrompt, userContent]);
      const parsedJson = JSON.parse(result.response.text());

      return {
        strategy: ExperimentStrategySchema.parse(parsedJson),
        provider: "gemini",
        model: modelName,
        fallbackUsed: false,
      };
    } catch (err) {
      console.warn("Gemini strategy generation failed; deterministic fallback will be clearly labelled.", err);
      return {
        strategy: ExperimentStrategySchema.parse(generateDeterministicStrategy(objective, userPrompt)),
        provider: "deterministic",
        model: "PulsePilot deterministic planner",
        fallbackUsed: true,
        fallbackReason: "Gemini was unavailable or returned a response that failed schema validation.",
      };
    }
  }

  return {
    strategy: ExperimentStrategySchema.parse(generateDeterministicStrategy(objective, userPrompt)),
    provider: "deterministic",
    model: "PulsePilot deterministic planner",
    fallbackUsed: true,
    fallbackReason: "GEMINI_API_KEY is not configured for this deployment.",
  };
}

export async function formulateExperimentStrategy(
  objective: string,
  userPrompt: string
): Promise<ExperimentStrategy> {
  const result = await formulateExperimentStrategyWithMetadata(objective, userPrompt);
  return result.strategy;
}

export interface ReadinessGenerationResult {
  review: ReadinessReview;
  provider: "gemini" | "deterministic";
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export async function reviewExperimentReadinessWithMetadata(
  strategy: ExperimentStrategy
): Promise<ReadinessGenerationResult> {
  const isMock = !GEMINI_API_KEY || GEMINI_API_KEY === "mock";
  const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!isMock) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const systemPrompt = `You are the Quality & Safety Reviewer Agent for PulsePilot AI.
Audit this experiment configuration for scientific validity, telemetry measurability, traffic allocation, and operational safety.
Check the actual specification provided. Do not claim an event is implemented merely because it is listed as required.
Return JSON matching the ReadinessReview schema. Set isReadyForLaunch to true only when every required planning check passes.`;

      const result = await model.generateContent([
        systemPrompt,
        `Experiment Configuration: ${JSON.stringify(strategy)}`,
      ]);
      const parsed = ReadinessReviewSchema.parse(JSON.parse(result.response.text()));
      const deterministic = generateDeterministicReadiness(strategy);
      const checks = {
        ...parsed.checks,
        // The LLM may explain the plan, but platform-critical checks are
        // always enforced by deterministic code.
        isPrimaryMetricMeasurable: deterministic.checks.isPrimaryMetricMeasurable,
        areEventsImplemented: deterministic.checks.areEventsImplemented,
        areVariantsMeaningfullyDifferent: deterministic.checks.areVariantsMeaningfullyDifferent,
        areGuardrailsAppropriate: deterministic.checks.areGuardrailsAppropriate,
        isTrafficAllocationValid: deterministic.checks.isTrafficAllocationValid,
        isTechnicallyFeasible: deterministic.checks.isTechnicallyFeasible,
      };
      const checkValues = Object.values(checks);
      const allDeterministicChecksPass = checkValues.every((check) => check.pass);
      const qualityScore = Math.round(
        checkValues.filter((check) => check.pass).length / checkValues.length * 100
      );

      return {
        review: {
          ...parsed,
          checks,
          qualityScore,
          isReadyForLaunch: parsed.isReadyForLaunch && allDeterministicChecksPass,
        },
        provider: "gemini",
        model: modelName,
        fallbackUsed: false,
      };
    } catch (err) {
      console.warn("Gemini readiness review failed; deterministic review will be clearly labelled.", err);
      return {
        review: generateDeterministicReadiness(strategy),
        provider: "deterministic",
        model: "PulsePilot deterministic reviewer",
        fallbackUsed: true,
        fallbackReason: "Gemini was unavailable or returned a response that failed readiness schema validation.",
      };
    }
  }

  return {
    review: generateDeterministicReadiness(strategy),
    provider: "deterministic",
    model: "PulsePilot deterministic reviewer",
    fallbackUsed: true,
    fallbackReason: "GEMINI_API_KEY is not configured for this deployment.",
  };
}

export async function reviewExperimentReadiness(
  strategy: ExperimentStrategy
): Promise<ReadinessReview> {
  const result = await reviewExperimentReadinessWithMetadata(strategy);
  return result.review;
}
/**
 * Deterministic Strategy Generator for offline/mock resilience
 */
function generateDeterministicStrategy(
  objective: string,
  userPrompt: string
): ExperimentStrategy {
  const isCheckout =
    userPrompt.toLowerCase().includes("checkout") ||
    userPrompt.toLowerCase().includes("cart") ||
    userPrompt.toLowerCase().includes("single-page");
  const isOnboarding =
    userPrompt.toLowerCase().includes("onboarding") ||
    userPrompt.toLowerCase().includes("registration") ||
    userPrompt.toLowerCase().includes("signup");
  const isPricing =
    userPrompt.toLowerCase().includes("pricing") ||
    userPrompt.toLowerCase().includes("annual") ||
    userPrompt.toLowerCase().includes("discount");

  if (isCheckout) {
    return {
      experiment_name: "Checkout Funnel: Single-Page vs Multi-Step",
      business_problem:
        "High friction during multi-step checkout causes 34% drop-off between cart review and final payment confirmation.",
      hypothesis:
        "Collapsing the 3-step checkout into a streamlined single-page layout will eliminate navigation friction and increase checkout completion by at least +12%.",
      objective: objective || "Reduce abandonment",
      flagsmith_feature_name: "exp_checkout_layout_v2",
      control_variant: {
        key: "control",
        name: "Current Multi-Step Checkout",
        description: "Existing 3-step wizard (Shipping -> Billing -> Review)",
        isControl: true,
        trafficAllocation: 50,
        featureValue: {
          layout: "multi_step",
          showOrderSummaryInline: false,
          expressCheckoutEnabled: false,
        },
        whyWorthTesting: "Provides the established control baseline for existing checkout completion and abandonment rates.",
      },
      treatment_variants: [
        {
          key: "variant_single_page",
          name: "Single-Page Streamlined Checkout",
          description: "All customer, shipping, and payment fields visible on a single responsive view with accordion validation.",
          isControl: false,
          trafficAllocation: 50,
          featureValue: {
            layout: "single_page",
            showOrderSummaryInline: true,
            expressCheckoutEnabled: true,
            stickySubmitButton: true,
          },
          whyWorthTesting: "Reduces cognitive load and perceived effort by showing the finish line immediately to the buyer.",
        },
      ],
      primary_metric: {
        key: "checkout_completed",
        name: "Checkout Completed",
        type: "CONVERSION_RATE",
        direction: "INCREASE",
        description: "Fires when user successfully completes purchase transaction.",
      },
      secondary_metrics: [
        {
          key: "session_duration_seconds",
          name: "Checkout Time to Complete",
          type: "DURATION",
          direction: "DECREASE",
          description: "Seconds elapsed from checkout start to confirmation.",
        },
        {
          key: "revenue_usd",
          name: "Average Order Value",
          type: "REVENUE",
          direction: "INCREASE",
          description: "Total net transaction amount in USD.",
        },
      ],
      guardrail_metrics: [
        {
          key: "payment_failure",
          name: "Payment Failure Rate",
          type: "CONVERSION_RATE",
          direction: "DECREASE",
          description: "Card declines or gateway error responses.",
        },
        {
          key: "page_bounce",
          name: "Checkout Abandonment / Bounce",
          type: "CONVERSION_RATE",
          direction: "DECREASE",
          description: "Users leaving page without clicking complete.",
        },
      ],
      target_audience: {
        segmentName: "All Production Visitors",
        description: "All web and mobile users entering checkout flow.",
        flagsmithRule: "platform in ['web', 'mobile_web']",
      },
      traffic_allocation: {
        controlPercent: 50,
        treatmentPercents: { variant_single_page: 50 },
        totalPercent: 100,
      },
      required_events: [
        { eventName: "checkout_initiated", triggerPoint: "User lands on checkout route" },
        { eventName: "checkout_completed", triggerPoint: "Gateway returns 200 success receipt" },
        { eventName: "payment_failure", triggerPoint: "Gateway returns 402 or error payload" },
        { eventName: "page_bounce", triggerPoint: "Checkout session ends without a completion event." },
      ],
      implementation_plan: [
        "Wrap CheckoutContainer with Flagsmith feature flag 'exp_checkout_layout_v2'",
        "Inject variant layout configuration dynamically into CheckoutForm component",
        "Instrument telemetry events 'checkout_initiated' and 'checkout_completed'",
        "Verify 50/50 allocation in Flagsmith staging environment before rollout",
      ],
      potential_risks: [
        "Single-page form may appear overwhelming on very small mobile screens (< 360px)",
        "Address validation must fire inline without blocking user inputs",
      ],
      success_criteria: [
        "Primary metric 'checkout_completed' achieves >= +8% relative lift",
        "Two-tailed p-value < 0.05 (95% statistical confidence)",
        "Zero statistically significant increase in 'payment_failure' guardrail",
      ],
    };
  }

  // Default General Growth Strategy
  return {
    experiment_name: "Onboarding Flow: 1-Step Modal vs Multi-Step Wizard",
    business_problem:
      "High drop-off during user onboarding. Over 40% of signups never complete workspace setup.",
    hypothesis:
      "Replacing the multi-step tour with a single modal will remove onboarding friction and increase user activation by +18%.",
    objective: objective || "Improve onboarding",
    flagsmith_feature_name: "exp_onboarding_simplification",
    control_variant: {
      key: "control",
      name: "Existing 4-Step Tour",
      description: "Step-by-step walkthrough modal sequence",
      isControl: true,
      trafficAllocation: 50,
      featureValue: { steps: 4, modalType: "wizard" },
      whyWorthTesting: "Serves as the benchmark for time-to-first-value and completion rates.",
    },
    treatment_variants: [
      {
        key: "variant_fast_modal",
        name: "1-Step Quick Activation",
        description: "Single unified card with sensible defaults pre-selected",
        isControl: false,
        trafficAllocation: 50,
        featureValue: { steps: 1, modalType: "quick_card", prefillDefaults: true },
        whyWorthTesting: "Maximizes momentum by letting the user jump into the core product in under 10 seconds.",
      },
    ],
    primary_metric: {
      key: "registration_completed",
      name: "Registration & Workspace Setup",
      type: "CONVERSION_RATE",
      direction: "INCREASE",
      description: "User completes initial project creation.",
    },
    secondary_metrics: [
      {
        key: "session_duration_seconds",
        name: "Time to First Action",
        type: "DURATION",
        direction: "DECREASE",
        description: "Time elapsed from signup to first interaction.",
      },
    ],
    guardrail_metrics: [
      {
        key: "api_error_rate",
        name: "Client Error Rate",
        type: "CONVERSION_RATE",
        direction: "DECREASE",
        description: "Validation errors during submission.",
      },
    ],
    target_audience: {
      segmentName: "New Signups",
      description: "Users who authenticated in the last 24 hours.",
      flagsmithRule: "user_is_new == true",
    },
    traffic_allocation: {
      controlPercent: 50,
      treatmentPercents: { variant_fast_modal: 50 },
      totalPercent: 100,
    },
    required_events: [
      { eventName: "onboarding_started", triggerPoint: "First login session" },
      { eventName: "registration_completed", triggerPoint: "Workspace record created in DB" },
      { eventName: "api_error_rate", triggerPoint: "An API request fails validation or returns a server error." },
    ],
    implementation_plan: [
      "Integrate flagsmith.hasFeature('exp_onboarding_simplification') in OnboardingModal",
      "Render variant_fast_modal when flag evaluates to true",
      "Track conversion on workspace creation API handler",
    ],
    potential_risks: [
      "Users might skip setting a custom workspace name if defaults are prefilled",
    ],
    success_criteria: [
      "Activation rate lifts by >= +10% with p < 0.05",
      "Day 7 user retention does not regress",
    ],
  };
}

function generateDeterministicReadiness(strategy: ExperimentStrategy): ReadinessReview {
  const variants = [strategy.control_variant, ...strategy.treatment_variants];
  const totalAllocation = variants.reduce((sum, variant) => sum + variant.trafficAllocation, 0);
  const trafficValid = Math.abs(totalAllocation - 100) <= 0.01;
  const hypothesisValid = strategy.hypothesis.trim().length >= 20;
  const primaryMetricValid = Boolean(
    strategy.primary_metric.key.trim() &&
    strategy.required_events.some((event) => event.eventName === strategy.primary_metric.key)
  );
  const guardrailsValid = strategy.guardrail_metrics.length > 0 &&
    strategy.guardrail_metrics.every((guardrail) =>
      strategy.required_events.some((event) => event.eventName === guardrail.key)
    );
  const eventsSpecified = strategy.required_events.length > 0 &&
    strategy.required_events.every((event) => event.eventName.trim() && event.triggerPoint.trim());
  const variantValues = variants.map((variant) => JSON.stringify(variant.featureValue));
  const variantsMeaningfullyDifferent =
    new Set(variantValues).size === variants.length &&
    variants.every((variant) =>
      Boolean(variant.key.trim() && variant.name.trim() && variant.description.trim() && variant.whyWorthTesting.trim())
    );
  const technicallyFeasible =
    /^exp_[a-z0-9_]+$/.test(strategy.flagsmith_feature_name) &&
    strategy.control_variant.key === "control" &&
    strategy.control_variant.isControl &&
    strategy.treatment_variants.every((variant) =>
      !variant.isControl && /^[a-z0-9_]+$/.test(variant.key)
    );

  const checks = {
    isHypothesisTestable: {
      pass: hypothesisValid,
      feedback: hypothesisValid
        ? "The hypothesis has enough detail to be reviewed as a measurable cause/effect statement."
        : "The hypothesis is too short or incomplete. State the proposed change and measurable outcome.",
    },
    isPrimaryMetricMeasurable: {
      pass: primaryMetricValid,
      feedback: primaryMetricValid
        ? `Primary metric '${strategy.primary_metric.key}' is present in the required event plan.`
        : "The primary metric needs a matching required event and trigger point.",
    },
    areEventsImplemented: {
      pass: eventsSpecified,
      feedback: eventsSpecified
        ? "Required event names and trigger points are specified. Actual application-code instrumentation still needs to be verified before rollout."
        : "One or more required events are missing a name or trigger point.",
    },
    areVariantsMeaningfullyDifferent: {
      pass: variantsMeaningfullyDifferent,
      feedback: variantsMeaningfullyDifferent
        ? "Control and treatment variants have distinct remote values and explanatory descriptions."
        : "Variants need distinct feature values, names, descriptions, and test rationale.",
    },
    areGuardrailsAppropriate: {
      pass: guardrailsValid,
      feedback: guardrailsValid
        ? "Each configured safety guardrail has a corresponding required telemetry event."
        : "Add at least one guardrail and a required event for every guardrail metric.",
    },
    isTrafficAllocationValid: {
      pass: trafficValid,
      feedback: trafficValid
        ? `Configured variant weights total ${totalAllocation}%.`
        : `Traffic allocations total ${totalAllocation}%; they must total 100%.`,
    },
    isTechnicallyFeasible: {
      pass: technicallyFeasible,
      feedback: technicallyFeasible
        ? "The feature key, control key, treatment keys and value shapes satisfy the Flagsmith provisioning contract."
        : "The feature key or variant keys do not satisfy the Flagsmith provisioning contract.",
    },
  };

  const passedChecks = Object.values(checks).filter((check) => check.pass).length;
  const isReadyForLaunch = Object.values(checks).every((check) => check.pass);
  const recommendations: string[] = [];
  if (!hypothesisValid) recommendations.push("Rewrite the hypothesis with a clear intervention and measurable outcome.");
  if (!primaryMetricValid) recommendations.push("Add a primary-metric event and trigger point.");
  if (!eventsSpecified) recommendations.push("Specify exact event names and trigger points for the instrumentation plan.");
  if (!variantsMeaningfullyDifferent) recommendations.push("Give each variant a distinct remote configuration and rationale.");
  if (!guardrailsValid) recommendations.push("Add measurable safety guardrails and include their event keys in required_events.");
  if (!trafficValid) recommendations.push("Adjust the variant percentages so the configured total equals 100%.");
  if (!technicallyFeasible) recommendations.push("Correct the Flagsmith feature key, control key and treatment variant keys.");
  recommendations.push("Before release, verify that the listed events are implemented in the application and that operational guardrail values are persisted.");

  return {
    qualityScore: Math.round((passedChecks / Object.keys(checks).length) * 100),
    isReadyForLaunch,
    checks,
    strengths: [
      ...(hypothesisValid ? ["A testable hypothesis is specified."] : []),
      ...(trafficValid ? ["Traffic allocation satisfies the 100% invariant."] : []),
      ...(guardrailsValid ? ["Safety guardrails are paired with telemetry events."] : []),
      ...(variantsMeaningfullyDifferent ? ["Variant remote values are distinct."] : []),
    ],
    recommendations,
  };
}
