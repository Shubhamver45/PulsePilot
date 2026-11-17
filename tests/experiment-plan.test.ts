import assert from "node:assert/strict";
import { validateExperimentStrategy } from "../src/lib/ai/schemas.ts";
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

async function main() {
  // Force the no-key test path regardless of the developer's local .env.
  // The generation metadata must openly identify its deterministic fallback.
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const { formulateExperimentStrategyWithMetadata } = await import("../src/lib/ai/gemini-client.ts");
  const generated = await formulateExperimentStrategyWithMetadata(
    "Reduce abandonment",
    "Test a single-page checkout against the current multi-step checkout. Use a 50/50 split and monitor payment failures."
  );

  check(generated.provider === "deterministic", "Missing Gemini key is explicitly labelled deterministic");
  check(generated.fallbackUsed === true, "Fallback provenance is not represented as a Gemini response");
  const plan = validateExperimentStrategy(generated.strategy);
  check(plan.valid, `Deterministic checkout strategy passes validation (${plan.errors.join("; ")})`);
  check(plan.allocation.totalPercent === 100, "Strategy allocation totals exactly 100%");

  const invalidAllocation = structuredClone(generated.strategy);
  invalidAllocation.treatment_variants[0].trafficAllocation = 45;
  const invalidAllocationResult = validateExperimentStrategy(invalidAllocation);
  check(!invalidAllocationResult.valid && invalidAllocationResult.errors.some((e) => e.includes("100%")),
    "Invalid allocation is rejected before provisioning");

  const duplicateKey = structuredClone(generated.strategy);
  duplicateKey.treatment_variants[0].key = duplicateKey.control_variant.key;
  const duplicateKeyResult = validateExperimentStrategy(duplicateKey);
  check(!duplicateKeyResult.valid && duplicateKeyResult.errors.some((e) => e.includes("unique")),
    "Duplicate control/treatment keys are rejected");

  const duplicateValue = structuredClone(generated.strategy);
  duplicateValue.treatment_variants[0].featureValue = structuredClone(duplicateValue.control_variant.featureValue);
  const duplicateValueResult = validateExperimentStrategy(duplicateValue);
  check(!duplicateValueResult.valid && duplicateValueResult.errors.some((e) => e.includes("distinct")),
    "Identical remote-config values are rejected");

  const controlValue = JSON.stringify(generated.strategy.control_variant.featureValue);
  const treatment = generated.strategy.treatment_variants[0];
  const input: CreateFlagInput = {
    name: generated.strategy.flagsmith_feature_name,
    description: generated.strategy.experiment_name,
    initialValue: controlValue,
    variants: [{
      key: treatment.key,
      trafficAllocation: treatment.trafficAllocation,
      value: JSON.stringify(treatment.featureValue),
    }],
  };

  const liveState = {
    enabled: true,
    feature_state_value: controlValue,
    multivariate_feature_state_values: [{
      id: 101,
      multivariate_feature_option: {
        id: 201,
        key: treatment.key,
        string_value: input.variants[0].value,
      },
      percentage_allocation: 50,
    }],
  };

  const verified = verifyFlagsmithAllocationState(liveState, input);
  check(verified.verified, "Remote Flagsmith read-back accepts matching control and treatment allocations");
  check(verified.controlPercent === 50 && verified.treatmentPercent === 50 && verified.totalPercent === 100,
    "Remote allocation proof reports exact 50/50 distribution");

  const driftedState = structuredClone(liveState);
  driftedState.multivariate_feature_state_values[0].percentage_allocation = 40;
  const drifted = verifyFlagsmithAllocationState(driftedState, input);
  check(!drifted.verified && drifted.errors.some((e) => e.includes("mismatch")),
    "Remote allocation drift blocks provisioning success");

  const extraOptionState = structuredClone(liveState);
  extraOptionState.multivariate_feature_state_values.push({
    id: 102,
    multivariate_feature_option: { id: 202, key: "legacy_variant", string_value: "legacy" },
    percentage_allocation: 10,
  });
  const extraOption = verifyFlagsmithAllocationState(extraOptionState, input);
  check(!extraOption.verified && extraOption.errors.some((e) => e.includes("Unconfigured Flagsmith option")),
    "Unconfigured options consuming live traffic block verification");

  const wrongDefault = structuredClone(liveState);
  wrongDefault.feature_state_value = JSON.stringify({ layout: "unexpected_control" });
  const defaultMismatch = verifyFlagsmithAllocationState(wrongDefault, input);
  check(!defaultMismatch.verified && defaultMismatch.errors.some((e) => e.includes("default/control value")),
    "Mismatched remote control/default value blocks verification");

  if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
  console.log(`\nExperiment plan & Flagsmith allocation tests: ${passed}/11 passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
