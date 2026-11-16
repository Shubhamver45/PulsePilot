import { NextResponse } from "next/server";
import { ExperimentStrategySchema } from "@/lib/ai/schemas";
import { createFlagsmithMultivariateFeature } from "@/lib/flagsmith/flagsmith-admin";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";
import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import { getUserFromToken } from "@/lib/auth/auth-service";

export async function POST(request: Request) {
  try {
    // 1. Session Token Extraction
    const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieToken = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("pulsepilot_session="))
      ?.split("=")[1];

    const isCookieAuth = Boolean(!authHeader && cookieToken);
    const token = authHeader || cookieToken;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHORIZED",
          message:
            "Authentication required to create experiments. Please provide a valid session cookie or Bearer token.",
        },
        { status: 401 }
      );
    }

    // 2. CSRF Protection for Cookie-Authenticated Requests
    if (isCookieAuth) {
      const origin = request.headers.get("origin");
      const referer = request.headers.get("referer");
      const host = request.headers.get("host");

      if (!origin && !referer) {
        return NextResponse.json(
          {
            success: false,
            error: "CSRF_DETECTED",
            message: "Missing Origin or Referer header on cookie-authenticated request.",
          },
          { status: 403 }
        );
      }

      const source = origin || referer || "";
      if (source && host) {
        try {
          const sourceUrl = new URL(source.startsWith("http") ? source : `https://${source}`);
          const sourceHost = sourceUrl.host;
          const isLocal = (h: string) => h.startsWith("localhost") || h.startsWith("127.0.0.1");

          if (sourceHost !== host && !(isLocal(sourceHost) && isLocal(host))) {
            return NextResponse.json(
              {
                success: false,
                error: "CSRF_DETECTED",
                message: "Cross-site request forgery protection triggered: origin mismatch.",
              },
              { status: 403 }
            );
          }
        } catch {
          return NextResponse.json(
            {
              success: false,
              error: "CSRF_DETECTED",
              message: "Invalid Origin or Referer header format.",
            },
            { status: 403 }
          );
        }
      }
    }

    // 3. Authenticate User & Validate Revocation (Fail-Closed)
    let user;
    try {
      user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
    } catch (err: any) {
      if (err.message?.includes("PERSISTENT_REVOCATION_UNAVAILABLE")) {
        return NextResponse.json(
          {
            success: false,
            error: "AUTH_PERSISTENCE_ERROR",
            message:
              "Experiment creation blocked: session revocation status cannot be verified against persistent storage.",
          },
          { status: 500 }
        );
      }
      throw err;
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_SESSION",
          message: "Session is invalid, expired, or has been revoked. Please sign in again.",
        },
        { status: 401 }
      );
    }

    // 4. Enforce Strict RBAC (Only ADMIN and EDITOR roles can create experiments)
    if (user.role !== "ADMIN" && user.role !== "EDITOR") {
      return NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN",
          message: `Role '${user.role}' is not authorized to create experiments or provision feature flags. Only ADMIN and EDITOR roles have write access.`,
        },
        { status: 403 }
      );
    }

    // Strictly derive authorizer from validated session (never trust client body)
    const verifiedAuthorizer = user.fullName || user.email || "Authenticated Human";

    const body = await request.json();
    const strategy = ExperimentStrategySchema.parse(body.strategy);

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

    // 5. Provision Feature Flag remotely in Flagsmith Management API
    const fsResult = await createFlagsmithMultivariateFeature(flagsmithPayload);

    // CRITICAL: Reject false success if remote Flagsmith operation failed
    if (!fsResult.success) {
      await recordAuditLog({
        action: "OPERATION_FAILED",
        actor: { name: verifiedAuthorizer, type: "human" },
        entityType: "EXPERIMENT",
        entityId: strategy.flagsmith_feature_name,
        details: `Flagsmith remote provisioning failed: ${fsResult.error}`,
        metadata: {
          error: fsResult.error,
          featureName: strategy.flagsmith_feature_name,
          status: "FAILED_REMOTE_ACTUATION",
          authorizer: verifiedAuthorizer,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: fsResult.error || "Failed to provision feature flag in Flagsmith.",
          flagsmithFeatureName: strategy.flagsmith_feature_name,
          isConfigError: fsResult.error?.includes("FLAGSMITH_ORG_API_TOKEN"),
        },
        { status: 502 }
      );
    }

    const featureId = fsResult.featureId!;

    // 6. Durable Database Persistence via Prisma (Fail-Safe & Reconcilable)
    let experimentDbId = `exp_${Date.now()}`;

    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
      try {
        // Ensure Organization exists
        let org = await prisma.organization.findFirst();
        if (!org) {
          org = await prisma.organization.create({
            data: {
              name: "Acme Growth Inc.",
              slug: `acme-growth-${Date.now().toString(36).slice(-4)}`,
            },
          });
        }

        // Ensure Project exists
        let project = await prisma.project.findFirst({
          where: { organizationId: org.id },
        });
        if (!project) {
          project = await prisma.project.create({
            data: {
              name: "PulsePilot Main Project",
              organizationId: org.id,
              flagsmithProjectId: process.env.FLAGSMITH_PROJECT_ID || "53867",
              flagsmithEnvironmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY || "4Y72D2n57QaWFq7TU4sNsz",
            },
          });
        }

        // Upsert Experiment record
        const experiment = await prisma.experiment.upsert({
          where: { flagsmithFeatureName: strategy.flagsmith_feature_name },
          update: {
            title: strategy.experiment_name,
            hypothesis: strategy.hypothesis,
            flagsmithFeatureId: featureId,
            status: "ACTIVE",
            primaryMetric: strategy.primary_metric.key,
            guardrailMetrics: strategy.guardrail_metrics?.map((m) => m.key) || [],
            sampleSizeTarget: 5000,
          },
          create: {
            projectId: project.id,
            title: strategy.experiment_name,
            hypothesis: strategy.hypothesis,
            flagsmithFeatureId: featureId,
            flagsmithFeatureName: strategy.flagsmith_feature_name,
            status: "ACTIVE",
            primaryMetric: strategy.primary_metric.key,
            guardrailMetrics: strategy.guardrail_metrics?.map((m) => m.key) || [],
            targetAudience: strategy.target_audience?.segmentName || "All Visitors",
            sampleSizeTarget: 5000,
          },
        });

        experimentDbId = experiment.id;

        // Upsert Variants
        await prisma.experimentVariant.deleteMany({
          where: { experimentId: experiment.id },
        });

        await prisma.experimentVariant.createMany({
          data: [
            {
              experimentId: experiment.id,
              key: strategy.control_variant.key,
              name: strategy.control_variant.name,
              isControl: true,
              trafficAllocation: strategy.control_variant.trafficAllocation,
              featureValue: strategy.control_variant.featureValue as any,
            },
            ...strategy.treatment_variants.map((v) => ({
              experimentId: experiment.id,
              key: v.key,
              name: v.name,
              isControl: false,
              trafficAllocation: v.trafficAllocation,
              featureValue: v.featureValue as any,
            })),
          ],
        });
      } catch (dbErr: any) {
        // Log critical persistence failure and record reconciliation audit log
        console.error("[Prisma Persistence Error]:", dbErr.message);

        await recordAuditLog({
          action: "OPERATION_FAILED",
          actor: { name: verifiedAuthorizer, type: "human" },
          entityType: "EXPERIMENT",
          entityId: strategy.flagsmith_feature_name,
          details: `Flagsmith remote feature provisioned (Feature ID: ${featureId}), but PostgreSQL database persistence failed: ${dbErr.message}`,
          metadata: {
            status: "RECONCILIATION_REQUIRED",
            featureId,
            flagsmithFeatureName: strategy.flagsmith_feature_name,
            dbError: dbErr.message,
            authorizer: verifiedAuthorizer,
          },
        });

        return NextResponse.json(
          {
            success: false,
            error: "PERSISTENCE_FAILED_RECONCILIATION_PENDING",
            flagsmithFeatureId: featureId,
            flagsmithFeatureName: strategy.flagsmith_feature_name,
            message:
              "Feature flag provisioned in Flagsmith, but PostgreSQL database persistence failed. Experiment state requires reconciliation.",
            details: dbErr.message,
          },
          { status: 500 }
        );
      }
    }

    // 7. Mirror to local fallback store for offline tests
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

    // 8. Record Governance Audit Trail
    await recordAuditLog({
      action: "EXPERIMENT_CREATED",
      actor: { name: verifiedAuthorizer, type: "human" },
      entityType: "EXPERIMENT",
      entityId: strategy.flagsmith_feature_name,
      details: `Experiment '${strategy.experiment_name}' successfully provisioned in Flagsmith (Feature ID: ${featureId}) with ${allVariants.length} variants by ${verifiedAuthorizer}.`,
      metadata: {
        featureId,
        flagsmithFeatureName: strategy.flagsmith_feature_name,
        remoteCreated: fsResult.remoteCreated,
        isExisting: fsResult.isExisting,
        approvedBy: verifiedAuthorizer,
        status: "SUCCESS_VERIFIED",
      },
    });

    return NextResponse.json({
      success: true,
      experimentId: experimentDbId,
      flagsmithFeatureId: featureId,
      flagsmithFeatureName: strategy.flagsmith_feature_name,
      status: "ACTIVE",
      remoteCreated: fsResult.remoteCreated,
      isExisting: fsResult.isExisting,
      approvedBy: verifiedAuthorizer,
      timestamp: new Date().toISOString(),
      message: `Feature flag '${strategy.flagsmith_feature_name}' successfully provisioned in Flagsmith (Feature ID: ${featureId}). Verified in remote environment.`,
      state: fsResult.state,
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
