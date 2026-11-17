import { NextResponse } from "next/server";
import { ExperimentStrategySchema, validateExperimentStrategy } from "@/lib/ai/schemas";
import { createFlagsmithMultivariateFeature } from "@/lib/flagsmith/flagsmith-admin";
import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";

export async function POST(request: Request) {
  const user = await getAuthenticatedApplicationUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "EDITOR") {
    return NextResponse.json({ success: false, error: "INSUFFICIENT_PERMISSIONS" }, { status: 403 });
  }
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock")) {
    return NextResponse.json({ success: false, error: "PERSISTENT_DATABASE_REQUIRED" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const strategy = ExperimentStrategySchema.parse(body.strategy);
    const validation = validateExperimentStrategy(strategy);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: "EXPERIMENT_PLAN_INVALID",
        message: "The strategy must pass deterministic validation before provisioning.",
        validation,
      }, { status: 422 });
    }

    // Reject cross-organization attempts to reuse another workspace's flag name.
    const existing = await prisma.experiment.findUnique({
      where: { flagsmithFeatureName: strategy.flagsmith_feature_name },
      include: { project: true },
    });
    if (existing && existing.project.organizationId !== user.organizationId) {
      return NextResponse.json({
        success: false,
        error: "FEATURE_NAME_ALREADY_OWNED",
        message: "This Flagsmith feature name is already associated with another workspace.",
      }, { status: 409 });
    }

    const project = await prisma.project.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "asc" },
    });
    if (!project) {
      return NextResponse.json({
        success: false,
        error: "WORKSPACE_PROJECT_NOT_FOUND",
        message: "Create a workspace project before provisioning an experiment.",
      }, { status: 409 });
    }

    const allVariants = [strategy.control_variant, ...strategy.treatment_variants];
    const flagsmithPayload = {
      name: strategy.flagsmith_feature_name,
      description: `${strategy.experiment_name} | Hypothesis: ${strategy.hypothesis.slice(0, 100)}...`,
      initialValue: JSON.stringify(strategy.control_variant.featureValue),
      variants: strategy.treatment_variants.map((variant) => ({
        key: variant.key,
        trafficAllocation: variant.trafficAllocation,
        value: JSON.stringify(variant.featureValue),
      })),
    };

    // Flagsmith is the actuation plane. Never mirror a local success when the
    // real Management API did not create or verify the remote feature.
    const flagsmithResult = await createFlagsmithMultivariateFeature(flagsmithPayload);
    if (!flagsmithResult.success || !flagsmithResult.featureId) {
      await recordAuditLog({
        organizationId: user.organizationId,
        action: "OPERATION_FAILED",
        actor: { name: user.fullName, type: "human" },
        entityType: "EXPERIMENT",
        entityId: strategy.flagsmith_feature_name,
        details: `Flagsmith feature provisioning failed: ${flagsmithResult.error || "No feature ID was returned"}`,
        metadata: {
          featureName: strategy.flagsmith_feature_name,
          status: "FAILED_REMOTE_ACTUATION",
          error: flagsmithResult.error || null,
        },
      });

      return NextResponse.json({
        success: false,
        error: flagsmithResult.error || "Flagsmith did not verify feature provisioning.",
        flagsmithFeatureName: strategy.flagsmith_feature_name,
      }, { status: 502 });
    }

    let experiment;
    try {
      experiment = await prisma.$transaction(async (tx) => {
        const savedExperiment = await tx.experiment.upsert({
          where: { flagsmithFeatureName: strategy.flagsmith_feature_name },
          update: {
            title: strategy.experiment_name,
            hypothesis: strategy.hypothesis,
            flagsmithFeatureId: flagsmithResult.featureId,
            status: "ACTIVE",
            primaryMetric: strategy.primary_metric.key,
            guardrailMetrics: strategy.guardrail_metrics?.map((metric) => metric.key) || [],
            sampleSizeTarget: 5000,
          },
          create: {
            projectId: project.id,
            title: strategy.experiment_name,
            hypothesis: strategy.hypothesis,
            flagsmithFeatureId: flagsmithResult.featureId,
            flagsmithFeatureName: strategy.flagsmith_feature_name,
            status: "ACTIVE",
            primaryMetric: strategy.primary_metric.key,
            guardrailMetrics: strategy.guardrail_metrics?.map((metric) => metric.key) || [],
            targetAudience: strategy.target_audience?.segmentName || "All Visitors",
            sampleSizeTarget: 5000,
          },
        });

        const desiredKeys = allVariants.map((variant) => variant.key);
        const obsoleteVariants = await tx.experimentVariant.findMany({
          where: { experimentId: savedExperiment.id, key: { notIn: desiredKeys } },
          select: { id: true },
        });
        for (const obsolete of obsoleteVariants) {
          const eventCount = await tx.telemetryEvent.count({ where: { variantId: obsolete.id } });
          if (eventCount === 0) {
            await tx.experimentVariant.delete({ where: { id: obsolete.id } });
          } else {
            // Retain historical variants so existing telemetry foreign keys remain valid.
            await tx.experimentVariant.update({
              where: { id: obsolete.id },
              data: { trafficAllocation: 0 },
            });
          }
        }

        for (const variant of allVariants) {
          await tx.experimentVariant.upsert({
            where: {
              experimentId_key: {
                experimentId: savedExperiment.id,
                key: variant.key,
              },
            },
            update: {
              name: variant.name,
              isControl: variant.key === strategy.control_variant.key,
              trafficAllocation: variant.trafficAllocation,
              featureValue: variant.featureValue as any,
            },
            create: {
              experimentId: savedExperiment.id,
              key: variant.key,
              name: variant.name,
              isControl: variant.key === strategy.control_variant.key,
              trafficAllocation: variant.trafficAllocation,
              featureValue: variant.featureValue as any,
            },
          });
        }

        return savedExperiment;
      });
    } catch (dbError: any) {
      console.error("[Experiment Provisioning] PostgreSQL persistence failed after Flagsmith creation:", dbError?.message || dbError);
      await recordAuditLog({
        organizationId: user.organizationId,
        action: "OPERATION_FAILED",
        actor: { name: user.fullName, type: "human" },
        entityType: "EXPERIMENT",
        entityId: strategy.flagsmith_feature_name,
        details: "Flagsmith feature creation succeeded, but PostgreSQL experiment persistence failed.",
        metadata: {
          status: "REMOTE_CREATED_DATABASE_FAILED",
          flagsmithFeatureId: flagsmithResult.featureId,
          error: dbError?.message || "Unknown database error",
        },
      });
      return NextResponse.json({
        success: false,
        remoteCreated: true,
        flagsmithFeatureId: flagsmithResult.featureId,
        error: "Flagsmith created the feature, but PostgreSQL could not persist the experiment. Inspect the remote feature before retrying.",
      }, { status: 503 });
    }

    await recordAuditLog({
      organizationId: user.organizationId,
      action: "EXPERIMENT_CREATED",
      actor: { name: user.fullName, type: "human" },
      entityType: "EXPERIMENT",
      entityId: strategy.flagsmith_feature_name,
      details: `Experiment '${strategy.experiment_name}' was provisioned in Flagsmith and persisted for the authenticated workspace.`,
      metadata: {
        featureId: flagsmithResult.featureId,
        flagsmithFeatureName: strategy.flagsmith_feature_name,
        remoteCreated: flagsmithResult.remoteCreated,
        isExisting: flagsmithResult.isExisting,
        status: "SUCCESS_VERIFIED",
        organizationId: user.organizationId,
      },
    });

    return NextResponse.json({
      success: true,
      experimentId: experiment.id,
      flagsmithFeatureId: flagsmithResult.featureId,
      flagsmithFeatureName: strategy.flagsmith_feature_name,
      status: experiment.status,
      remoteCreated: flagsmithResult.remoteCreated,
      isExisting: flagsmithResult.isExisting,
      approvedBy: user.fullName,
      timestamp: new Date().toISOString(),
      message: `Feature flag '${strategy.flagsmith_feature_name}' was provisioned in Flagsmith and saved to PostgreSQL.`,
      state: flagsmithResult.state,
      allocationVerification: flagsmithResult.allocationVerification ?? null,
    }, { status: 201 });
  } catch (error: any) {
    console.error("Experiment creation failed:", error);
    return NextResponse.json({
      success: false,
      error: error?.issues?.[0]?.message || error?.message || "Failed to create experiment.",
    }, { status: 400 });
  }
}
