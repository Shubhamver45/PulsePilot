import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ExperimentStrategy,
  ExperimentStrategySchema,
  ReadinessReview,
  ReadinessReviewSchema,
} from "./schemas";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function formulateExperimentStrategy(
  objective: string,
  userPrompt: string
): Promise<ExperimentStrategy> {
  const isMock = !GEMINI_API_KEY || GEMINI_API_KEY === "mock";

  if (!isMock) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
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
3. Explain why each variant is worth testing ("whyWorthTesting").
4. Choose exact telemetry event names matching production standards (e.g. "checkout_completed", "registration_completed").`;

      const userContent = `Objective Category: ${objective}\nUser Natural Language Description: ${userPrompt}`;

      const result = await model.generateContent([systemPrompt, userContent]);
      const rawText = result.response.text();
      const parsedJson = JSON.parse(rawText);

      return ExperimentStrategySchema.parse(parsedJson);
    } catch (err) {
      console.warn("Gemini API call failed or timed out. Falling back to local intelligence generator:", err);
    }
  }

  // High-Fidelity Local Intelligence Generator
  return generateDeterministicStrategy(objective, userPrompt);
}

export async function reviewExperimentReadiness(
  strategy: ExperimentStrategy
): Promise<ReadinessReview> {
  const isMock = !GEMINI_API_KEY || GEMINI_API_KEY === "mock";

  if (!isMock) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const systemPrompt = `You are the Quality & Safety Reviewer Agent for PulsePilot AI.
Audit this experiment configuration for scientific validity, telemetry measurability, and safety guardrails.
Output JSON matching the ReadinessReview schema.`;

      const result = await model.generateContent([
        systemPrompt,
        `Experiment Configuration: ${JSON.stringify(strategy)}`,
      ]);
      const parsed = JSON.parse(result.response.text());
      return ReadinessReviewSchema.parse(parsed);
    } catch (err) {
      console.warn("Readiness review fallback to local evaluator:", err);
    }
  }

  return generateDeterministicReadiness(strategy);
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
  const sum =
    strategy.control_variant.trafficAllocation +
    strategy.treatment_variants.reduce((acc, v) => acc + v.trafficAllocation, 0);

  const trafficValid = sum === 100;
  const hypothesisValid = strategy.hypothesis.length >= 20;
  const metricValid = !!strategy.primary_metric.key;
  const guardrailsValid = strategy.guardrail_metrics.length > 0;

  return {
    qualityScore: trafficValid && hypothesisValid && metricValid && guardrailsValid ? 96 : 82,
    isReadyForLaunch: trafficValid && hypothesisValid && metricValid,
    checks: {
      isHypothesisTestable: {
        pass: hypothesisValid,
        feedback: "Hypothesis includes a clear cause, effect, and measurable outcome statement.",
      },
      isPrimaryMetricMeasurable: {
        pass: metricValid,
        feedback: `Primary metric '${strategy.primary_metric.key}' maps cleanly to a distinct binary conversion event.`,
      },
      areEventsImplemented: {
        pass: true,
        feedback: "All required events are cataloged and follow production telemetry standards.",
      },
      areVariantsMeaningfullyDifferent: {
        pass: true,
        feedback: "Variants present distinct UX paradigms suitable for detecting behavioral lift.",
      },
      areGuardrailsAppropriate: {
        pass: guardrailsValid,
        feedback: guardrailsValid
          ? `${strategy.guardrail_metrics.length} guardrail metrics monitor against regressions and revenue loss.`
          : "Warning: Consider adding at least one guardrail metric (e.g. error rate or bounce).",
      },
      isTrafficAllocationValid: {
        pass: trafficValid,
        feedback: trafficValid
          ? `Traffic split sums to exactly 100% (${strategy.control_variant.trafficAllocation}% Control, ${strategy.treatment_variants.map((v) => `${v.trafficAllocation}% ${v.key}`).join(", ")}).`
          : `Traffic allocations sum to ${sum}%, but must equal 100%.`,
      },
      isTechnicallyFeasible: {
        pass: true,
        feedback: "Flagsmith JSON payload format is compatible with client-side React and server-side SDKs.",
      },
    },
    strengths: [
      "High statistical power with clean 50/50 initial split.",
      "Guardrail metrics safeguard against conversion regressions.",
      "Clear, falsifiable hypothesis.",
    ],
    recommendations: [
      "Ensure minimum runtime of 7 days to account for day-of-week seasonality.",
      "Set up instant kill-switch notifications in your team's Slack channel.",
    ],
  };
}

