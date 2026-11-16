import assert from "node:assert";
import { PrismaClient } from "@prisma/client";
import { getFlagsmithExperimentResults } from "../src/lib/flagsmith/experimentation-service.ts";

const prisma = new PrismaClient();

async function runTelemetryAggregationTest() {
  console.log("=====================================================================");
  console.log("STARTING TEST: KNOWN-VALUE TELEMETRY AGGREGATION & DEDUPLICATION");
  console.log("=====================================================================\n");

  const project = await prisma.project.findFirst();
  if (!project) {
    throw new Error("No project found in database to attach test experiment.");
  }

  const testFeatureName = "exp_test_known_val_" + Date.now();

  console.log(`STEP 1: Creating test experiment [${testFeatureName}] in PostgreSQL...`);
  const experiment = await prisma.experiment.create({
    data: {
      projectId: project.id,
      title: "Known-Value Telemetry Validation",
      hypothesis: "Validating that unique visitor conversions are not inflated by repeat purchases.",
      status: "RUNNING",
      flagsmithFeatureName: testFeatureName,
      primaryMetric: "conversion_rate",
      variants: {
        create: [
          {
            key: "control",
            name: "Control (Standard Checkout)",
            isControl: true,
            trafficAllocation: 50,
            featureValue: { layout: "standard" },
          },
          {
            key: "variant_b",
            name: "Treatment B (One-Click Checkout)",
            isControl: false,
            trafficAllocation: 50,
            featureValue: { layout: "one_click" },
          },
        ],
      },
    },
    include: { variants: true },
  });

  const controlVar = experiment.variants.find((v) => v.isControl)!;
  const treatmentVar = experiment.variants.find((v) => !v.isControl)!;

  console.log(`- Created Experiment ID: ${experiment.id}`);
  console.log(`- Control Variant ID: ${controlVar.id}`);
  console.log(`- Treatment Variant ID: ${treatmentVar.id}\n`);

  console.log("STEP 2: Populating known-value telemetry events...");

  // Control: 10 exposed users: user_ctrl_1 to user_ctrl_10
  const controlExposures = Array.from({ length: 10 }, (_, i) => ({
    experimentId: experiment.id,
    variantId: controlVar.id,
    eventType: "EXPOSURE" as const,
    distinctUserId: `user_ctrl_${i + 1}`,
    properties: { source: "test_suite" },
    dedupKey: `${experiment.id}:user_ctrl_${i + 1}:EXPOSURE`,
  }));

  // Treatment: 10 exposed users: user_treat_1 to user_treat_10
  const treatmentExposures = Array.from({ length: 10 }, (_, i) => ({
    experimentId: experiment.id,
    variantId: treatmentVar.id,
    eventType: "EXPOSURE" as const,
    distinctUserId: `user_treat_${i + 1}`,
    properties: { source: "test_suite" },
    dedupKey: `${experiment.id}:user_treat_${i + 1}:EXPOSURE`,
  }));

  await prisma.telemetryEvent.createMany({
    data: [...controlExposures, ...treatmentExposures],
  });
  console.log("  ✅ Persisted 20 unique exposure events (10 Control, 10 Treatment).");

  // Control conversions: 3 unique users (user_ctrl_1, user_ctrl_2, user_ctrl_3)
  // user_ctrl_1 converts 3 times, user_ctrl_2 converts 3 times, user_ctrl_3 converts 1 time (7 total conversion rows)
  const controlConversions = [
    { distinctUserId: "user_ctrl_1", orderId: "ord_c1_1", amount: 100 },
    { distinctUserId: "user_ctrl_1", orderId: "ord_c1_2", amount: 150 },
    { distinctUserId: "user_ctrl_1", orderId: "ord_c1_3", amount: 200 },
    { distinctUserId: "user_ctrl_2", orderId: "ord_c2_1", amount: 50 },
    { distinctUserId: "user_ctrl_2", orderId: "ord_c2_2", amount: 75 },
    { distinctUserId: "user_ctrl_2", orderId: "ord_c2_3", amount: 125 },
    { distinctUserId: "user_ctrl_3", orderId: "ord_c3_1", amount: 300 },
  ].map((c) => ({
    experimentId: experiment.id,
    variantId: controlVar.id,
    eventType: "CONVERSION" as const,
    distinctUserId: c.distinctUserId,
    properties: { orderId: c.orderId, orderValue: c.amount },
    dedupKey: `${experiment.id}:${c.distinctUserId}:CONVERSION:${c.orderId}`,
  }));

  // Treatment conversions: 5 unique users (user_treat_1 .. user_treat_5)
  // user_treat_1 converts 3 times, user_treat_2 converts 2 times, user_treat_3,4,5 convert 1 time each (8 total conversion rows)
  const treatmentConversions = [
    { distinctUserId: "user_treat_1", orderId: "ord_t1_1", amount: 120 },
    { distinctUserId: "user_treat_1", orderId: "ord_t1_2", amount: 180 },
    { distinctUserId: "user_treat_1", orderId: "ord_t1_3", amount: 90 },
    { distinctUserId: "user_treat_2", orderId: "ord_t2_1", amount: 220 },
    { distinctUserId: "user_treat_2", orderId: "ord_t2_2", amount: 110 },
    { distinctUserId: "user_treat_3", orderId: "ord_t3_1", amount: 400 },
    { distinctUserId: "user_treat_4", orderId: "ord_t4_1", amount: 150 },
    { distinctUserId: "user_treat_5", orderId: "ord_t5_1", amount: 80 },
  ].map((c) => ({
    experimentId: experiment.id,
    variantId: treatmentVar.id,
    eventType: "CONVERSION" as const,
    distinctUserId: c.distinctUserId,
    properties: { orderId: c.orderId, orderValue: c.amount },
    dedupKey: `${experiment.id}:${c.distinctUserId}:CONVERSION:${c.orderId}`,
  }));

  await prisma.telemetryEvent.createMany({
    data: [...controlConversions, ...treatmentConversions],
  });
  console.log("  ✅ Persisted 15 conversion events (7 Control rows for 3 users, 8 Treatment rows for 5 users).\n");

  console.log("STEP 3: Aggregating experiment results via experimentation-service...");
  const results = await getFlagsmithExperimentResults(testFeatureName);
  assert(results !== null, "Experiment results returned non-null");

  const ctrlRes = results.variations.find((v) => v.isControl)!;
  const treatRes = results.variations.find((v) => !v.isControl)!;

  console.log("- Control Variation Results:", {
    exposures: ctrlRes.exposures,
    conversions: ctrlRes.conversions,
    conversionRate: ctrlRes.conversionRate,
  });

  console.log("- Treatment Variation Results:", {
    exposures: treatRes.exposures,
    conversions: treatRes.conversions,
    conversionRate: treatRes.conversionRate,
    expectedLiftPercent: treatRes.expectedLiftPercent,
    chanceToWin: treatRes.chanceToWin,
  });

  console.log("\nSTEP 4: Verifying mathematical invariants against ground truth...");

  // Control checks:
  assert.strictEqual(ctrlRes.exposures, 10, "Control exposures must be exactly 10 unique users");
  assert.strictEqual(ctrlRes.conversions, 3, "Control conversions must be exactly 3 unique converted users (NOT 7 rows)");
  assert.strictEqual(ctrlRes.conversionRate, 0.3, "Control conversion rate must be exactly 0.3000 (30%)");

  // Treatment checks:
  assert.strictEqual(treatRes.exposures, 10, "Treatment exposures must be exactly 10 unique users");
  assert.strictEqual(treatRes.conversions, 5, "Treatment conversions must be exactly 5 unique converted users (NOT 8 rows)");
  assert.strictEqual(treatRes.conversionRate, 0.5, "Treatment conversion rate must be exactly 0.5000 (50%)");

  // Invariant checks:
  assert(ctrlRes.conversionRate >= 0 && ctrlRes.conversionRate <= 1, "Control rate is bounded in [0, 1]");
  assert(treatRes.conversionRate >= 0 && treatRes.conversionRate <= 1, "Treatment rate is bounded in [0, 1]");

  // Relative Uplift: (0.50 - 0.30) / 0.30 = 66.7%
  assert(treatRes.expectedLiftPercent! > 60 && treatRes.expectedLiftPercent! < 70, `Relative uplift ~66.7% (got ${treatRes.expectedLiftPercent}%)`);

  // Summary checks:
  assert.strictEqual(results.summary.totalExposures, 20, "Total exposures = 20");
  assert.strictEqual(results.summary.totalConversions, 8, "Total conversions = 8 unique users (3 + 5)");

  console.log("  ✅ All mathematical invariants validated against statistical ground truth.\n");

  console.log("STEP 5: Cleaning up test fixtures from database...");
  await prisma.telemetryEvent.deleteMany({ where: { experimentId: experiment.id } });
  await prisma.experimentVariant.deleteMany({ where: { experimentId: experiment.id } });
  await prisma.experiment.delete({ where: { id: experiment.id } });
  console.log("  ✅ Cleaned up test experiment and telemetry events.\n");

  console.log("=====================================================================");
  console.log("TELEMETRY AGGREGATION SUITE: ALL CHECKS PASSED (0 FAILS)");
  console.log("=====================================================================\n");

  await prisma.$disconnect();
}

runTelemetryAggregationTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
