import assert from "node:assert/strict";
import {
  validateExperimentStrategy,
  type ExperimentStrategy,
} from "../src/lib/ai/schemas.ts";
import {
  verifyFlagsmithAllocationState,
  type CreateFlagInput,
} from "../src/lib/flagsmith/flagsmith-admin.ts";

let passed = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
}

const strategy: ExperimentStrategy = {
  experiment_name: "Checkout Layout Optimization",
  business_problem: "Customers abandon the existing checkout before completing payment.",
  hypothesis: "A single-page checkout will reduce friction and increase checkout completion.",
  objective: "Reduce abandonment",
  flagsmith_feature_name: "exp_checkout_layout_qa",
  control_variant: {
    key: "control",
    name: "Multi-step checkout",
    description: "Existing multi-step checkout flow",
    isControl: true,
    trafficAllocation: 50,
    featureValue: { layout: "multi_step" },
    whyWorthTesting: "Baseline experience for a controlled comparison.",
  },
  treatment_variants: [{
    key: "treatment",
    name: "Single-page checkout",
    description: "Simplified single-page checkout flow",
    isControl: false,
    trafficAllocation: 50,
    featureValue: { layout: "single_page" },
    whyWorthTesting: "Reduces navigation steps and form friction.",
  }],
  primary_metric: {
    key: "checkout_completed",
    name: "Checkout completed",
    type: "CONVERSION_RATE",
    direction: "INCREASE",
    description: "Unique users completing a checkout after exposure.",
  },
  secondary_metrics: [],
  guardrail_metrics: [{
    key: "payment_failure",
    name: "Payment failures",
    type: "CONVERSION_RATE",
    direction: "DECREASE",
    description: "Payment failures must not increase.",
  }],
  target_audience: {
    segmentName: "All Visitors",
    description: "All eligible checkout visitors.",
  },
  traffic_allocation: {
    controlPercent: 50,
    treatmentPercents: { treatment: 50 },
    totalPercent: 100,
  },
  required_events: [
    { eventName: "checkout_completed", triggerPoint: "After successful payment completion." },
    { eventName: "payment_failure", triggerPoint: "When the payment provider returns a failed payment result." },
  ],
  implementation_plan: [
    "Evaluate the Flagsmith checkout feature for a stable user identity.",
    "Persist first-touch exposure and conversion telemetry.",
  ],
  potential_risks: ["Payment failures could increase."],
  success_criteria: ["Treatment produces positive conversion uplift without breaching payment guardrails."],
};

async function main() {
  const valid = validateExperimentStrategy(strategy);
  check(valid.valid, `Valid prompt-derived strategy passes deterministic validation: ${valid.errors.join("; ")}`);
  check(valid.allocation.totalPercent === 100, "Validated strategy allocation totals exactly 100%");

  const invalidAllocation = structuredClone(strategy);
  invalidAllocation.treatment_variants[0].trafficAllocation = 45;
  check(
    !validateExperimentStrategy(invalidAllocation).valid &&
      validateExperimentStrategy(invalidAllocation).errors.some((error) => error.includes("100%")),
    "Invalid allocation is rejected before provisioning"
  );

  const duplicateKey = structuredClone(strategy);
  duplicateKey.treatment_variants[0].key = duplicateKey.control_variant.key;
  check(
    !validateExperimentStrategy(duplicateKey).valid &&
      validateExperimentStrategy(duplicateKey).errors.some((error) => error.includes("unique")),
    "Duplicate control/treatment keys are rejected"
  );

  const duplicateValue = structuredClone(strategy);
  duplicateValue.treatment_variants[0].featureValue = structuredClone(duplicateValue.control_variant.featureValue);
  check(
    !validateExperimentStrategy(duplicateValue).valid &&
      validateExperimentStrategy(duplicateValue).errors.some((error) => error.includes("distinct")),
    "Identical remote-config values are rejected"
  );

  const controlValue = JSON.stringify(strategy.control_variant.featureValue);
  const treatmentValue = JSON.stringify(strategy.treatment_variants[0].featureValue);
  const input: CreateFlagInput = {
    name: strategy.flagsmith_feature_name,
    description: strategy.experiment_name,
    initialValue: controlValue,
    variants: [{ key: "treatment", trafficAllocation: 50, value: treatmentValue }],
  };

  const liveState = {
    enabled: true,
    feature_state_value: controlValue,
    multivariate_feature_state_values: [{
      id: 101,
      multivariate_feature_option: { id: 201, key: "treatment", string_value: treatmentValue },
      percentage_allocation: 50,
    }],
  };

  const verified = verifyFlagsmithAllocationState(liveState, input);
  check(verified.verified, "Remote Flagsmith read-back accepts matching control and treatment allocations");
  check(
    verified.controlPercent === 50 && verified.treatmentPercent === 50 && verified.totalPercent === 100,
    "Remote allocation proof reports exact 50/50 distribution"
  );

  const driftedState = structuredClone(liveState);
  driftedState.multivariate_feature_state_values[0].percentage_allocation = 40;
  const drifted = verifyFlagsmithAllocationState(driftedState, input);
  check(
    !drifted.verified && drifted.errors.some((error) => error.includes("mismatch")),
    "Remote allocation drift blocks provisioning success"
  );

  const extraOptionState = structuredClone(liveState);
  extraOptionState.multivariate_feature_state_values.push({
    id: 102,
    multivariate_feature_option: { id: 202, key: "legacy_variant", string_value: "legacy" },
    percentage_allocation: 10,
  });
  const extraOption = verifyFlagsmithAllocationState(extraOptionState, input);
  check(
    !extraOption.verified && extraOption.errors.some((error) => error.includes("Unconfigured Flagsmith option")),
    "Unconfigured options consuming live traffic block verification"
  );

  const wrongDefault = structuredClone(liveState);
  wrongDefault.feature_state_value = JSON.stringify({ layout: "unexpected_control" });
  const defaultMismatch = verifyFlagsmithAllocationState(wrongDefault, input);
  check(
    !defaultMismatch.verified && defaultMismatch.errors.some((error) => error.includes("default/control value")),
    "Mismatched remote control/default value blocks verification"
  );

  const missingOption = structuredClone(liveState);
  missingOption.multivariate_feature_state_values = [];
  const missing = verifyFlagsmithAllocationState(missingOption, input);
  check(
    !missing.verified && missing.variants[0].actualPercent === null,
    "Missing remote treatment allocation cannot be marked verified"
  );

  console.log(`\nExperiment plan & Flagsmith allocation tests: ${passed} passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
