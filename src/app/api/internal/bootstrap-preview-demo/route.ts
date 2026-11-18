import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createFlagsmithMultivariateFeature } from "@/lib/flagsmith/flagsmith-admin";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FEATURE_NAME = "exp_pulsepilot_judge_checkout_v1";
const ORGANIZATION_ID = "org_pulsepilot_demo";
const PROJECT_ID = "proj_pulsepilot_demo";
const EXPERIMENT_ID = "exp_pulsepilot_checkout_demo";

function isAuthorized(request: Request): boolean {
  const expected = process.env.PULSE_PREVIEW_BOOTSTRAP_TOKEN_TEMP || process.env.PULSE_PREVIEW_BOOTSTRAP_TOKEN || "";
  const provided = new URL(request.url).searchParams.get("token") || "";
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const feature = await createFlagsmithMultivariateFeature({
    name: FEATURE_NAME,
    description: "PulsePilot Preview judge demo: live Flagsmith multivariate checkout with persisted exposure/conversion telemetry and evidence-gated release controls.",
    initialValue: JSON.stringify({
      layout: "multi_step",
      title: "Multi-Step Checkout",
      badge: "Standard Multi-Step",
    }),
    variants: [
      {
        key: "single_page",
        trafficAllocation: 50,
        value: JSON.stringify({
          layout: "single_page",
          title: "Single-Page Checkout",
          badge: "Streamlined 1-Page",
        }),
      },
      {
        key: "express",
        trafficAllocation: 25,
        value: JSON.stringify({
          layout: "express",
          title: "Express Checkout",
          badge: "1-Click Express",
          expressPayment: true,
        }),
      },
    ],
  });

  if (!feature.success || !feature.featureId || !feature.allocationVerification?.verified) {
    return NextResponse.json({
      success: false,
      featureProvisioned: Boolean(feature.featureId),
      featureId: feature.featureId ?? null,
      allocationVerification: feature.allocationVerification ?? null,
      error: feature.error || "Flagsmith allocation verification did not pass.",
    }, { status: 502 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.organization.upsert({
        where: { id: ORGANIZATION_ID },
        update: { name: "PulsePilot Demo Studio", slug: "pulsepilot-demo" },
        create: {
          id: ORGANIZATION_ID,
          name: "PulsePilot Demo Studio",
          slug: "pulsepilot-demo",
        },
      });

      await tx.project.upsert({
        where: { id: PROJECT_ID },
        update: {
          name: "Live Checkout Experiment",
          description: "Isolated Preview workspace used for the public PulsePilot judge walkthrough.",
          organizationId: ORGANIZATION_ID,
          flagsmithProjectId: process.env.FLAGSMITH_PROJECT_ID || null,
        },
        create: {
          id: PROJECT_ID,
          name: "Live Checkout Experiment",
          description: "Isolated Preview workspace used for the public PulsePilot judge walkthrough.",
          organizationId: ORGANIZATION_ID,
          flagsmithProjectId: process.env.FLAGSMITH_PROJECT_ID || null,
        },
      });

      const experiment = await tx.experiment.upsert({
        where: { flagsmithFeatureName: FEATURE_NAME },
        update: {
          title: "Checkout experience: multi-step vs streamlined",
          hypothesis: "Reducing checkout steps will improve completed checkouts without increasing checkout abandonment.",
          description: "A live Flagsmith multivariate demo. All checkout identities and events are explicitly demo traffic.",
          targetAudience: "Public demo personas",
          flagsmithFeatureId: feature.featureId,
          status: "RUNNING",
          primaryMetric: "checkout_completed",
          guardrailMetrics: ["checkout_abandoned"],
          sampleSizeTarget: 500,
        },
        create: {
          id: EXPERIMENT_ID,
          projectId: PROJECT_ID,
          title: "Checkout experience: multi-step vs streamlined",
          hypothesis: "Reducing checkout steps will improve completed checkouts without increasing checkout abandonment.",
          description: "A live Flagsmith multivariate demo. All checkout identities and events are explicitly demo traffic.",
          targetAudience: "Public demo personas",
          flagsmithFeatureId: feature.featureId,
          flagsmithFeatureName: FEATURE_NAME,
          status: "RUNNING",
          primaryMetric: "checkout_completed",
          guardrailMetrics: ["checkout_abandoned"],
          sampleSizeTarget: 500,
          sampleSizeCurrent: 0,
        },
      });

      const variants = [
        {
          id: "pv_variant_control",
          key: "control",
          name: "Multi-Step Checkout",
          description: "Baseline multi-step checkout.",
          isControl: true,
          trafficAllocation: 25,
          featureValue: {
            layout: "multi_step",
            title: "Multi-Step Checkout",
            badge: "Standard Multi-Step",
          },
        },
        {
          id: "pv_variant_single_page",
          key: "single_page",
          name: "Single-Page Checkout",
          description: "Streamlined one-page checkout.",
          isControl: false,
          trafficAllocation: 50,
          featureValue: {
            layout: "single_page",
            title: "Single-Page Checkout",
            badge: "Streamlined 1-Page",
          },
        },
        {
          id: "pv_variant_express",
          key: "express",
          name: "Express Checkout",
          description: "Express payment-oriented checkout.",
          isControl: false,
          trafficAllocation: 25,
          featureValue: {
            layout: "express",
            title: "Express Checkout",
            badge: "1-Click Express",
            expressPayment: true,
          },
        },
      ];

      for (const variant of variants) {
        await tx.experimentVariant.upsert({
          where: { id: variant.id },
          update: {
            experimentId: experiment.id,
            key: variant.key,
            name: variant.name,
            description: variant.description,
            isControl: variant.isControl,
            trafficAllocation: variant.trafficAllocation,
            featureValue: variant.featureValue,
          },
          create: {
            ...variant,
            experimentId: experiment.id,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      featureName: FEATURE_NAME,
      featureId: feature.featureId,
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      experimentId: EXPERIMENT_ID,
      allocationVerification: feature.allocationVerification,
      databaseSeeded: true,
    });
  } catch (error: any) {
    console.error("[Preview bootstrap] Database seed failed:", error?.message || error);
    return NextResponse.json({
      success: false,
      featureName: FEATURE_NAME,
      featureId: feature.featureId,
      allocationVerification: feature.allocationVerification,
      databaseSeeded: false,
      error: "Flagsmith was provisioned and verified, but Preview PostgreSQL seeding failed.",
    }, { status: 503 });
  }
}
