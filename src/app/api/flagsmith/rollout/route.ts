import { NextResponse } from "next/server";
import { z } from "zod";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";
import {
  getLiveRemoteFeatureState,
  getManagementAuthHeader,
  rolloutFlagsmithWinner,
  updateFlagsmithCanaryStage,
  triggerFlagsmithKillSwitch,
  rollbackFlagsmithToControl,
} from "@/lib/flagsmith/flagsmith-admin";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import { checkProductionRolloutGuard } from "@/lib/flagsmith/production-guards";
import { prisma } from "@/lib/db/prisma";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";

const RolloutRequestSchema = z.object({
  flagsmithFeatureName: z.string().min(1),
  action: z.enum(["ROLLOUT_WINNER", "GRADUAL_STAGE", "ROLLBACK_TO_CONTROL", "EMERGENCY_KILL_SWITCH"]),
  winningVariantKey: z.string().optional(),
  stagePercentage: z.number().min(0).max(100).optional(),
  rationale: z.string().trim().max(2000).optional(),
});

function hasFlagsmithRemoteCredentials(): boolean {
  return Boolean(getManagementAuthHeader().Authorization);
}

function normaliseFeatureValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

async function syncExperimentAllocations(
  featureName: string,
  allocation: { variants: Array<{ value: string; percentageAllocation: number }>; defaultValue?: string | null },
  finalStatus?: "CONCLUDED_ROLLED_OUT" | "CONCLUDED_ROLLED_BACK"
) {
  const experiment = await prisma.experiment.findUnique({
    where: { flagsmithFeatureName: featureName },
    include: { variants: true },
  });
  if (!experiment) return;

  const defaultValue = allocation.defaultValue == null ? null : String(allocation.defaultValue);
  await prisma.$transaction(async (tx) => {
    for (const variant of experiment.variants) {
        const configuredValue = normaliseFeatureValue(variant.featureValue);
      const matchingOption = allocation.variants.find((item: any) =>
        item.key === variant.key || item.value === configuredValue
      );
      const isDefault = defaultValue !== null && (
        defaultValue === configuredValue ||
        defaultValue === variant.key ||
        (variant.isControl && (defaultValue === "control" || defaultValue === ""))
      );
      const percentage = matchingOption?.percentageAllocation ?? (isDefault ? 100 : 0);
      await tx.experimentVariant.update({
        where: { id: variant.id },
        data: { trafficAllocation: Math.max(0, Math.min(100, Math.round(percentage))) },
      });
    }
    if (finalStatus) {
      await tx.experiment.update({
        where: { id: experiment.id },
        data: { status: finalStatus },
      });
    }
  });
}

async function getWorkspaceExperiment(featureName: string, organizationId: string) {
  return prisma.experiment.findFirst({
    where: {
      flagsmithFeatureName: featureName,
      project: { organizationId },
    },
    include: { variants: true },
  });
}

async function getPersistedRolloutEvidence(experimentId: string, sampleSizeTarget: number) {
  const [exposureEvents, conversionEvents] = await Promise.all([
    prisma.telemetryEvent.findMany({
      where: { experimentId, eventType: "EXPOSURE" },
      select: { distinctUserId: true, variantId: true, properties: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    }),
    prisma.telemetryEvent.findMany({
      where: { experimentId, eventType: "CONVERSION" },
      select: { distinctUserId: true, metricKey: true, properties: true },
    }),
  ]);

  const realExposures = exposureEvents.filter((event: any) => event.properties?.isSynthetic !== true);
  const realConversions = conversionEvents.filter((event: any) => event.properties?.isSynthetic !== true);
  const assignment = new Map<string, string>();
  const exposureUsersByVariant = new Map<string, Set<string>>();
  for (const event of realExposures) {
    const previous = assignment.get(event.distinctUserId);
    if (!previous) assignment.set(event.distinctUserId, event.variantId);
    if (!exposureUsersByVariant.has(event.variantId)) exposureUsersByVariant.set(event.variantId, new Set());
    exposureUsersByVariant.get(event.variantId)!.add(event.distinctUserId);
  }

  const convertedUsersByVariant = new Map<string, Set<string>>();
  for (const event of realConversions) {
    const variantId = assignment.get(event.distinctUserId);
    if (!variantId) continue;
    if (!convertedUsersByVariant.has(variantId)) convertedUsersByVariant.set(variantId, new Set());
    convertedUsersByVariant.get(variantId)!.add(event.distinctUserId);
  }

  const totalExposures = [...exposureUsersByVariant.values()].reduce((sum, users) => sum + users.size, 0);
  return {
    totalExposures,
    sampleSizeTarget,
    exposureUsersByVariant,
    convertedUsersByVariant,
    guardrailMetricKeys: [...new Set(realConversions.map((event: any) => event.metricKey).filter(Boolean))] as string[],
  };
}

function getRolloutEvidenceBlockers(experiment: any, evidence: Awaited<ReturnType<typeof getPersistedRolloutEvidence>>, winningVariantKey: string) {
  const blockers: string[] = [];
  const variants = experiment.variants || [];
  const control = variants.find((variant: any) => variant.isControl);
  const treatment = variants.find((variant: any) => variant.key === winningVariantKey);

  if (!control) blockers.push("A configured control variant is required.");
  if (!treatment || treatment.isControl) blockers.push("The requested winner must be a configured treatment variant.");
  if (variants.length !== 2) blockers.push("The release gate currently requires a two-arm control/treatment experiment so its allocation and SRM checks are unambiguous.");

  if (evidence.totalExposures < evidence.sampleSizeTarget) {
    blockers.push(`Insufficient real exposure sample: ${evidence.totalExposures}/${evidence.sampleSizeTarget}.`);
  }

  if (control && treatment) {
    const controlExposureCount = evidence.exposureUsersByVariant.get(control.id)?.size || 0;
    const treatmentExposureCount = evidence.exposureUsersByVariant.get(treatment.id)?.size || 0;
    const controlConversions = evidence.convertedUsersByVariant.get(control.id)?.size || 0;
    const treatmentConversions = evidence.convertedUsersByVariant.get(treatment.id)?.size || 0;

    if (controlExposureCount === 0 || treatmentExposureCount === 0) {
      blockers.push("Both control and treatment require real exposure events.");
    } else {
      const result = compareVariants(
        { key: control.key, name: control.name, isControl: true, exposures: controlExposureCount, conversions: controlConversions },
        { key: treatment.key, name: treatment.name, isControl: false, exposures: treatmentExposureCount, conversions: treatmentConversions },
        [Number(control.trafficAllocation || 0), Number(treatment.trafficAllocation || 0)]
      );
      if (!result.isSignificant || result.pValue > 0.05) {
        blockers.push(`The primary metric is not statistically significant (p=${result.pValue.toFixed(4)}; required p<=0.05).`);
      }
      if (result.bayesianProbabilityToBeatControl < 0.95) {
        blockers.push(`Bayesian win probability is ${(result.bayesianProbabilityToBeatControl * 100).toFixed(1)}% (required >=95%).`);
      }
      if (result.sampleRatioMismatch.srmDetected) {
        blockers.push(`Sample-ratio mismatch detected (p=${result.sampleRatioMismatch.pValue.toFixed(4)}).`);
      }
      if (result.relativeUpliftPercent <= 0) {
        blockers.push("The treatment does not currently show positive conversion uplift.");
      }
    }
  }

  // Guardrail names alone are not measurable thresholds. Do not claim they
  // have passed until metric thresholds and corresponding persisted event data
  // are both configured for this experiment.
  if (!Array.isArray(experiment.guardrailMetrics) || experiment.guardrailMetrics.length === 0) {
    blockers.push("No operational guardrail metrics are configured for this experiment.");
  } else {
    const missing = experiment.guardrailMetrics.filter((metric: string) =>
      !evidence.guardrailMetricKeys.includes(metric)
    );
    if (missing.length > 0) {
      blockers.push(`Missing persisted operational guardrail telemetry: ${missing.join(", ")}.`);
    }
    blockers.push("Guardrail thresholds are not stored in the experiment configuration, so guardrail safety cannot be certified.");
  }

  return blockers;
}

function optionValue(item: any): string {
  const option = item?.multivariate_feature_option || {};
  return String(option.string_value ?? option.value ?? "");
}

function optionKey(item: any): string | null {
  const option = item?.multivariate_feature_option || {};
  const key = option.key;
  return typeof key === "string" && key.length > 0 ? key : null;
}

function allocationSnapshot(state: any) {
  const options = Array.isArray(state?.multivariate_feature_state_values)
    ? state.multivariate_feature_state_values
    : [];
  const variants = options.map((item: any) => ({
    key: optionKey(item),
    value: optionValue(item),
    percentageAllocation: Number(item.percentage_allocation ?? 0),
  }));
  const allocated = variants.reduce((sum: number, item: any) => sum + item.percentageAllocation, 0);

  return {
    variants,
    defaultValue: state?.feature_state_value ?? null,
    defaultAllocationPercent: Math.max(0, 100 - allocated),
    totalAllocationPercent: allocated + Math.max(0, 100 - allocated),
  };
}

function serialiseFeatureValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

async function resolveVariantValue(featureName: string, variantKey: string, state: any): Promise<string> {
  const direct = (state?.multivariate_feature_state_values || []).find(
    (item: any) => optionKey(item) === variantKey || optionValue(item) === variantKey
  );
  if (direct) return optionValue(direct) || variantKey;

  // The UI speaks in experiment variant keys; Flagsmith stores the variant's
  // configured value. Resolve the key through the experiment record.
  const experiment = await prisma.experiment.findUnique({
    where: { flagsmithFeatureName: featureName },
    include: { variants: true },
  });
  const variant = experiment?.variants.find((item) => item.key === variantKey);
  if (!variant) {
    throw new Error(`Variant '${variantKey}' is not configured for feature '${featureName}'.`);
  }

  const configuredValue = serialiseFeatureValue(variant.featureValue);
  const exists = (state?.multivariate_feature_state_values || []).some(
    (item: any) => optionKey(item) === variantKey || optionValue(item) === configuredValue
  );
  if (!exists) {
    throw new Error(`Variant '${variantKey}' has no matching option in the live Flagsmith feature.`);
  }
  return configuredValue;
}

async function resolveControlValue(featureName: string, state: any): Promise<string> {
  const experiment = await prisma.experiment.findUnique({
    where: { flagsmithFeatureName: featureName },
    include: { variants: true },
  });
  const control = experiment?.variants.find((item) => item.isControl);
  // The live default value in Flagsmith is the control baseline. Prefer it to
  // the application JSON because the option's value may be a compact string key.
  if (state?.feature_state_value !== undefined && state?.feature_state_value !== null) {
    return typeof state.feature_state_value === "string"
      ? state.feature_state_value
      : serialiseFeatureValue(state.feature_state_value);
  }
  if (control) return serialiseFeatureValue(control.featureValue);
  return "control";
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedApplicationUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const featureName = searchParams.get("featureName") || "exp_checkout_layout_v2";
    const workspaceExperiment = await getWorkspaceExperiment(featureName, user.organizationId);
    if (!workspaceExperiment) {
      return NextResponse.json({ success: false, error: "EXPERIMENT_NOT_FOUND_IN_WORKSPACE" }, { status: 404 });
    }

    if (hasFlagsmithRemoteCredentials()) {
      const remote = await getLiveRemoteFeatureState(featureName);
      if (remote.success && remote.state) {
        return NextResponse.json({
          success: true,
          source: "flagsmith_remote_api",
          flag: {
            id: remote.state.id,
            featureId: remote.state.feature?.id ?? null,
            name: remote.state.feature?.name || featureName,
            enabled: remote.state.enabled,
            value: remote.state.feature_state_value,
            ...allocationSnapshot(remote.state),
          },
        });
      }

      return NextResponse.json({
        success: false,
        source: "flagsmith_remote_api",
        error: remote.error || "Unable to retrieve live Flagsmith feature state.",
      }, { status: 502 });
    }

    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      return NextResponse.json({
        success: false,
        source: "flagsmith_management_api",
        error: "Remote Flagsmith Management API credentials are not configured for this deployment. Local mock data is not accepted as live state.",
      }, { status: 503 });
    }

    const flag = flagsmithMockStore.getFlag(featureName);
    if (!flag) {
      return NextResponse.json({ success: false, error: "Feature flag not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      source: "local_mock",
      flag: {
        name: flag.name,
        enabled: flag.enabled,
        value: flag.value,
        type: flag.type,
        variants: flag.multivariateOptions.map((item) => ({
          value: item.value,
          percentageAllocation: item.trafficAllocation,
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Flag lookup failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedApplicationUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Only workspace administrators can authorize remote flag mutations." }, { status: 403 });
    }

    const req = RolloutRequestSchema.parse(await request.json());
    const workspaceExperiment = await getWorkspaceExperiment(req.flagsmithFeatureName, user.organizationId);
    if (!workspaceExperiment) {
      return NextResponse.json({ success: false, error: "EXPERIMENT_NOT_FOUND_IN_WORKSPACE" }, { status: 404 });
    }

    const isRemoteConfigured = hasFlagsmithRemoteCredentials();
    if (!isRemoteConfigured) {
      return NextResponse.json({
        success: false,
        error: "Flagsmith Management API credentials are not configured. No local mock mutation will be reported as a remote release.",
        code: "FLAGSMITH_MANAGEMENT_NOT_CONFIGURED",
      }, { status: 503 });
    }
    const guard = checkProductionRolloutGuard(isRemoteConfigured);

    if (!guard.allowed) {
      return NextResponse.json({
        success: false,
        error: guard.error,
        code: guard.code,
        isConfigError: true,
      }, { status: guard.statusCode || 503 });
    }

    const actorName = user.fullName || user.email;
    const current = isRemoteConfigured
      ? await getLiveRemoteFeatureState(req.flagsmithFeatureName)
      : { success: false as const, error: "Remote Flagsmith is not configured." };

    if (isRemoteConfigured && (!current.success || !current.state)) {
      return NextResponse.json({
        success: false,
        error: current.error || "Unable to read the current remote feature state.",
      }, { status: 502 });
    }

    const before = isRemoteConfigured
      ? allocationSnapshot(current.state)
      : null;

    if (req.action === "GRADUAL_STAGE" || req.action === "ROLLOUT_WINNER") {
      if (!req.winningVariantKey) {
        return NextResponse.json({ success: false, error: "winningVariantKey is required." }, { status: 400 });
      }

      const evidence = await getPersistedRolloutEvidence(workspaceExperiment.id, workspaceExperiment.sampleSizeTarget);
      const blockers = getRolloutEvidenceBlockers(workspaceExperiment, evidence, req.winningVariantKey);
      if (blockers.length > 0) {
        return NextResponse.json({
          success: false,
          error: "ROLLOUT_EVIDENCE_GATE_BLOCKED",
          message: "The server-side release gate rejected this mutation. Client-side demo scenarios cannot override persisted evidence.",
          blockers,
          evidence: {
            realExposures: evidence.totalExposures,
            sampleSizeTarget: evidence.sampleSizeTarget,
          },
        }, { status: 409 });
      }

      const pct = req.action === "ROLLOUT_WINNER" ? 100 : (req.stagePercentage ?? 25);
      let result: any;

      if (isRemoteConfigured) {
        const variantValue = await resolveVariantValue(
          req.flagsmithFeatureName,
          req.winningVariantKey,
          current.state
        );
        result = req.action === "ROLLOUT_WINNER"
          ? await rolloutFlagsmithWinner(req.flagsmithFeatureName, variantValue)
          : await updateFlagsmithCanaryStage(req.flagsmithFeatureName, variantValue, pct);

        if (!result.success || !result.verifiedState) {
          await recordAuditLog({
            action: req.action === "ROLLOUT_WINNER" ? "ROLLOUT_FAILED" : "GRADUAL_STAGE_FAILED",
            organizationId: user.organizationId,
        actor: { name: actorName, type: "human" },
            entityType: "FLAGSMITH_FLAG",
            entityId: req.flagsmithFeatureName,
            details: result.error || "Flagsmith did not return a verifiable post-mutation state.",
            metadata: { status: "FAILED_REMOTE_VERIFICATION", winningVariantKey: req.winningVariantKey },
          });
          return NextResponse.json({ success: false, error: result.error || "Remote verification failed." }, { status: 502 });
        }
      } else {
        if (req.action === "ROLLOUT_WINNER") {
          flagsmithMockStore.rolloutWinner(req.flagsmithFeatureName, req.winningVariantKey);
        } else {
          flagsmithMockStore.updateGradualRollout(req.flagsmithFeatureName, req.winningVariantKey, pct);
        }
      }

      const after: {
        variants: Array<{ value: string; percentageAllocation: number }>;
        defaultValue?: string | null;
        defaultAllocationPercent: number;
        totalAllocationPercent: number;
      } = isRemoteConfigured
        ? allocationSnapshot(result.verifiedState)
        : (() => {
            const updated = flagsmithMockStore.getFlag(req.flagsmithFeatureName);
            const variants = updated?.multivariateOptions.map((item) => ({
              value: item.key,
              percentageAllocation: item.trafficAllocation,
            })) || [];
            const allocationTotal = variants.reduce((sum, item) => sum + item.percentageAllocation, 0);
            return {
              variants,
              defaultValue: updated?.value ?? null,
              defaultAllocationPercent: Math.max(0, 100 - allocationTotal),
              totalAllocationPercent: allocationTotal + Math.max(0, 100 - allocationTotal),
            };
          })();

      const validTotal = after.variants.reduce((sum: number, item: any) => sum + item.percentageAllocation, 0)
        + (isRemoteConfigured ? after.defaultAllocationPercent : 0);
      if (isRemoteConfigured && Math.abs(validTotal - 100) > 0.01) {
        return NextResponse.json({
          success: false,
          error: `Allocation invariant failed after mutation: expected 100%, received ${validTotal}%.`,
          actualAllocation: after,
        }, { status: 502 });
      }

      try {
        await syncExperimentAllocations(
          req.flagsmithFeatureName,
          after,
          req.action === "ROLLOUT_WINNER" ? "CONCLUDED_ROLLED_OUT" : undefined
        );
      } catch (syncError: any) {
        console.error("[Flagsmith] Remote rollout succeeded but PostgreSQL allocation sync failed:", syncError?.message || syncError);
        return NextResponse.json({
          success: false,
          remoteActuation: true,
          remoteVerified: true,
          error: "Flagsmith accepted and verified the remote rollout, but the experiment allocation record could not be synchronized. Do not retry blindly; inspect the live flag first.",
          details: syncError?.message,
          trafficAllocation: after,
        }, { status: 503 });
      }

      const action = req.action === "ROLLOUT_WINNER" ? "ROLLOUT_APPROVED_EXECUTED" : "GRADUAL_STAGE_UPDATED";
      await recordAuditLog({
        action,
        organizationId: user.organizationId,
        actor: { name: actorName, type: "human" },
        entityType: "FLAGSMITH_FLAG",
        entityId: req.flagsmithFeatureName,
        details: `${req.action} verified against Flagsmith. Previous: ${JSON.stringify(before)}; New: ${JSON.stringify(after)}.`,
        metadata: {
          authorizer: actorName,
          authenticatedUserId: user.id,
          authenticatedUserEmail: user.email,
          authenticatedRole: user.role,
          winningVariantKey: req.winningVariantKey,
          requestedPercentage: pct,
          previousAllocation: before,
          verifiedAllocation: after,
          status: "SUCCESS_VERIFIED",
          remoteActuation: isRemoteConfigured,
          rationale: req.rationale || null,
        },
      });

      return NextResponse.json({
        success: true,
        action: req.action,
        source: isRemoteConfigured ? "flagsmith_remote_api" : "local_mock",
        flagsmithFeatureName: req.flagsmithFeatureName,
        winningVariantKey: req.winningVariantKey,
        trafficAllocation: after,
        remoteActuation: isRemoteConfigured,
        message: `Verified ${req.action === "ROLLOUT_WINNER" ? "100% winner rollout" : `canary allocation to ${pct}%`} for '${req.winningVariantKey}'.`,
      });
    }

    if (req.action === "ROLLBACK_TO_CONTROL") {
      let result: any;
      if (isRemoteConfigured) {
        const controlValue = await resolveControlValue(req.flagsmithFeatureName, current.state);
        result = await rollbackFlagsmithToControl(req.flagsmithFeatureName, controlValue);
        if (!result.success || !result.verifiedState) {
          await recordAuditLog({
            action: "ROLLBACK_FAILED",
            organizationId: user.organizationId,
        actor: { name: actorName, type: "human" },
            entityType: "FLAGSMITH_FLAG",
            entityId: req.flagsmithFeatureName,
            details: result.error || "Flagsmith did not return a verifiable rollback state.",
            metadata: { status: "FAILED_REMOTE_VERIFICATION" },
          });
          return NextResponse.json({ success: false, error: result.error || "Remote rollback verification failed." }, { status: 502 });
        }
      } else {
        flagsmithMockStore.rollbackToControl(req.flagsmithFeatureName);
      }

      const after = isRemoteConfigured
        ? allocationSnapshot(result.verifiedState)
        : { variants: [{ value: "control", percentageAllocation: 100 }] };

      try {
        await syncExperimentAllocations(req.flagsmithFeatureName, after, "CONCLUDED_ROLLED_BACK");
      } catch (syncError: any) {
        console.error("[Flagsmith] Remote rollback succeeded but PostgreSQL allocation sync failed:", syncError?.message || syncError);
        return NextResponse.json({
          success: false,
          remoteActuation: true,
          remoteVerified: true,
          error: "Flagsmith rollback was verified, but the experiment allocation record could not be synchronized. Inspect the remote flag before retrying.",
          details: syncError?.message,
          trafficAllocation: after,
        }, { status: 503 });
      }

      await recordAuditLog({
        action: "ROLLBACK_EXECUTED",
        organizationId: user.organizationId,
        actor: { name: actorName, type: "human" },
        entityType: "FLAGSMITH_FLAG",
        entityId: req.flagsmithFeatureName,
        details: `Rollback verified against Flagsmith. Previous: ${JSON.stringify(before)}; New: ${JSON.stringify(after)}.`,
        metadata: {
          authorizer: actorName,
          authenticatedUserId: user.id,
          authenticatedUserEmail: user.email,
          authenticatedRole: user.role,
          previousAllocation: before,
          verifiedAllocation: after,
          status: "SUCCESS_VERIFIED",
          remoteActuation: isRemoteConfigured,
          rationale: req.rationale || null,
        },
      });

      return NextResponse.json({
        success: true,
        action: req.action,
        source: isRemoteConfigured ? "flagsmith_remote_api" : "local_mock",
        flagsmithFeatureName: req.flagsmithFeatureName,
        trafficAllocation: after,
        remoteActuation: isRemoteConfigured,
        message: "Control rollback completed and verified.",
      });
    }

    if (req.action === "EMERGENCY_KILL_SWITCH") {
      let result: any;
      if (isRemoteConfigured) {
        result = await triggerFlagsmithKillSwitch(req.flagsmithFeatureName);
        if (!result.success || result.verifiedState?.enabled !== false) {
          await recordAuditLog({
            action: "KILL_SWITCH_FAILED",
            organizationId: user.organizationId,
        actor: { name: actorName, type: "human" },
            entityType: "FLAGSMITH_FLAG",
            entityId: req.flagsmithFeatureName,
            details: result.error || "Flagsmith did not verify the disabled state.",
            metadata: { status: "FAILED_REMOTE_VERIFICATION" },
          });
          return NextResponse.json({ success: false, error: result.error || "Kill-switch verification failed." }, { status: 502 });
        }
      } else {
        flagsmithMockStore.toggleKillSwitch(req.flagsmithFeatureName, false);
      }

      // The kill switch disables the flag but does not mark the experiment complete:
      // the operator may re-enable it after the incident has been resolved.
      await recordAuditLog({
        action: "KILL_SWITCH_TRIGGERED",
        organizationId: user.organizationId,
        actor: { name: actorName, type: "human" },
        entityType: "FLAGSMITH_FLAG",
        entityId: req.flagsmithFeatureName,
        details: "Emergency kill-switch verified.",
        metadata: {
          authorizer: actorName,
          previousAllocation: before,
          enabled: false,
          status: "SUCCESS_VERIFIED",
          remoteActuation: isRemoteConfigured,
          rationale: req.rationale || null,
        },
      });

      return NextResponse.json({
        success: true,
        action: req.action,
        source: isRemoteConfigured ? "flagsmith_remote_api" : "local_mock",
        flagsmithFeatureName: req.flagsmithFeatureName,
        enabled: false,
        remoteActuation: isRemoteConfigured,
        message: "Emergency kill-switch completed and verified.",
      });
    }

    return NextResponse.json({ success: false, error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Rollout execution failed.",
    }, { status: 400 });
  }
}
