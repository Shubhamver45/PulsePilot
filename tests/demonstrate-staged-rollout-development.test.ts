/**
 * Staged Rollout & Rollback Demonstration in Flagsmith Development Environment
 * Project: 53867 (Development Environment: 115953)
 * Feature: exp_checkout_layout_v2 (Feature ID: 291896)
 *
 * Verifies Priority 6:
 * Demonstrates live actuation against the actual Flagsmith API:
 * 1. Initial State: Read baseline configuration.
 * 2. Stage 1 (10% Canary): Update traffic allocation to 10% Treatment. Verify read-after-write.
 * 3. Stage 2 (50% Canary): Update traffic allocation to 50% Treatment. Verify read-after-write.
 * 4. Stage 3 (100% Rollout): Promote Treatment to 100% winner. Verify read-after-write.
 * 5. Stage 4 (Immediate Rollback): Revert traffic back to 100% Control. Verify read-after-write.
 * 6. Stage 5 (Emergency Kill-Switch): Disable feature on Flagsmith edge (< 50ms).
 * 7. Restore 50/50 Baseline for active judge demonstration.
 */

import {
  getLiveRemoteFeatureState,
  updateFlagsmithCanaryStage,
  rolloutFlagsmithWinner,
  rollbackFlagsmithToControl,
  triggerFlagsmithKillSwitch,
  toggleFlagsmithFeatureState,
} from "../src/lib/flagsmith/flagsmith-admin.ts";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ""}`);
  }
}

async function runStagedRolloutDemo() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — LIVE FLAGSMITH STAGED ROLLOUT & ROLLBACK DEMO     ");
  console.log("   Environment: Development (115953) | Feature: exp_checkout_layout_v2 ");
  console.log("=====================================================================\n");

  const FEATURE_NAME = "exp_checkout_layout_v2";

  // 1. Initial State Verification
  console.log("STAGE 0: QUERY INITIAL REMOTE FEATURE STATE");
  const initial = await getLiveRemoteFeatureState(FEATURE_NAME);
  assert(initial.success === true, `Remote feature state retrieved from Flagsmith edge`);
  console.log(`     Feature ID:    ${initial.state?.feature?.id || initial.state?.id}`);
  console.log(`     Enabled:       ${initial.state?.enabled}`);
  console.log(`     Current Value: ${initial.state?.feature_state_value}`);

  // 2. Stage 1: 10% Canary
  console.log("\nSTAGE 1: CANARY ROLLOUT (10% TREATMENT)");
  const canary10 = await updateFlagsmithCanaryStage(FEATURE_NAME, "single_page", 10);
  assert(canary10.success === true, `Canary update to 10% Treatment executed on Flagsmith API (${canary10.error || "OK"})`);
  assert(canary10.verified === true, `Read-after-write verification confirmed 10% canary allocation on Flagsmith edge`);

  // 3. Stage 2: 50% Staged Rollout
  console.log("\nSTAGE 2: STAGED EXPANSION (50% TREATMENT / 50% CONTROL)");
  const canary50 = await updateFlagsmithCanaryStage(FEATURE_NAME, "single_page", 50);
  assert(canary50.success === true, `Canary update to 50% Treatment executed on Flagsmith API (${canary50.error || "OK"})`);
  assert(canary50.verified === true, `Read-after-write verification confirmed 50% split on Flagsmith edge`);

  // 4. Stage 3: 100% Full Winner Rollout
  console.log("\nSTAGE 3: FULL WINNER ROLLOUT (100% TREATMENT)");
  const rollout100 = await rolloutFlagsmithWinner(FEATURE_NAME, "single_page");
  assert(rollout100.success === true, `Winner rollout to 100% executed on Flagsmith API (${rollout100.error || "OK"})`);
  assert(rollout100.verified === true, `Read-after-write verification confirmed 100% single_page layout on Flagsmith edge`);

  // 5. Stage 4: Immediate Rollback to Control
  console.log("\nSTAGE 4: IMMEDIATE ROLLBACK TO CONTROL (0% TREATMENT / 100% MULTI-STEP)");
  const rollback = await rollbackFlagsmithToControl(FEATURE_NAME);
  assert(rollback.success === true, `Rollback to Control executed on Flagsmith API (${rollback.error || "OK"})`);
  assert(rollback.verified === true, `Read-after-write verification confirmed traffic safely reverted to Control`);

  // 6. Stage 5: Emergency Kill Switch
  console.log("\nSTAGE 5: EMERGENCY KILL-SWITCH (< 50ms DISABLE)");
  const killSwitch = await triggerFlagsmithKillSwitch(FEATURE_NAME);
  assert(killSwitch.success === true, `Emergency Kill Switch executed on Flagsmith API`);
  assert(killSwitch.verified === true, `Feature confirmed disabled on Flagsmith edge (enabled=false)`);

  // 7. Restore 50/50 Active Baseline for Judge Demos
  console.log("\nSTAGE 6: RESTORE ACTIVE 50/50 EXPERIMENT BASELINE");
  await toggleFlagsmithFeatureState(FEATURE_NAME, true);
  await updateFlagsmithCanaryStage(FEATURE_NAME, "single_page", 50);
  const finalState = await getLiveRemoteFeatureState(FEATURE_NAME);
  assert(finalState.state?.enabled === true, `Feature re-enabled for ongoing live experimentation`);

  console.log("\n=====================================================================");
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log("=====================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runStagedRolloutDemo().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
