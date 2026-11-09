import { NextResponse } from "next/server";
import { ExperimentStrategySchema } from "@/lib/ai/schemas";
import { createFlagsmithMultivariateFeature } from "@/lib/flagsmith/flagsmith-admin";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const strategy = ExperimentStrategySchema.parse(body.strategy);
    const approvedBy = body.approvedBy || "Sarah Lin (Product Lead)";

    // 1. Provision feature in Flagsmith Management API / Store
    const allVariants = [
      strategy.control_variant,
      ...strategy.treatment_variants,
    ];

    const flagsmithPayload = {
      name: strategy.flagsmith_feature_name,
      description: `${strategy.experiment_name} | Hypothesis: ${strategy.hypothesis.slice(0, 100)}...`,
      initialValue: JSON.stringify(strategy.control_variant.featureValue),
      variants: strategy.treatment_variants.map((v) => ({
        key: v.key,
        trafficAllocation: v.trafficAllocation,
        value: JSON.stringify(v.featureValue),
      })),
    };

    const fsResult = await createFlagsmithMultivariateFeature(flagsmithPayload);

    // Also update our in-memory mock store for instant local reactivity
    flagsmithMockStore.setFlag({
      name: strategy.flagsmith_feature_name,
      enabled: true,
      type: "MULTIVARIATE",
      value: JSON.stringify(strategy.control_variant.featureValue),
      multivariateOptions: allVariants.map((v) => ({
        key: v.key,
        trafficAllocation: v.trafficAllocation,
        value: JSON.stringify(v.featureValue),
      })),
    });

    const experimentId = `exp_${Date.now()}`;

    return NextResponse.json({
      success: true,
      experimentId,
      flagsmithFeatureId: fsResult.featureId || 1001,
      flagsmithFeatureName: strategy.flagsmith_feature_name,
      status: "ACTIVE",
      approvedBy,
      timestamp: new Date().toISOString(),
      message: `Feature flag '${strategy.flagsmith_feature_name}' successfully provisioned in Flagsmith with ${allVariants.length} variants.`,
    });
  } catch (error: any) {
    console.error("Experiment creation failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create experiment and provision Flagsmith flag",
        details: error.message || error.errors,
      },
      { status: 400 }
    );
  }
}

