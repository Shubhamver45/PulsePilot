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

const RolloutRequestSchema = z.object({
  flagsmithFeatureName: z.string().min(1),
  action: z.enum(["ROLLOUT_WINNER", "GRADUAL_STAGE", "ROLLBACK_TO_CONTROL", "EMERGENCY_KILL_SWITCH"]),
  winningVariantKey: z.string().optional(),
  stagePercentage: z.number().min(0).max(100).optional(),
  authorizer: z.string().trim().min(2).max(120).optional(),
  rationale: z.string().trim().max(2000).optional(),
});

function hasFlagsmithRemoteCredentials(): boolean {
  return Boolean(getManagementAuthHeader().Authorization);
}

function optionValue(item: any): string {
  const option = item?.multivariate_feature_option || {};
  return String(option.string_value ?? option.value ?? "");
}

function allocationSnapshot(state: any) {
  const options = Array.isArray(state?.multivariate_feature_state_values)
    ? state.multivariate_feature_state_values
    : [];
  const variants = options.map((item: any) => ({
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
    (item: any) => optionValue(item) === variantKey
  );
  if (direct) return variantKey;

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
    (item: any) => optionValue(item) === configuredValue
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
  if (control) return serialiseFeatureValue(control.featureValue);
  return String(state?.feature_state_value ?? "control");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const featureName = searchParams.get("featureName") || "exp_checkout_layout_v2";

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
    const req = RolloutRequestSchema.parse(await request.json());
    const isRemoteConfigured = hasFlagsmithRemoteCredentials();
    const guard = checkProductionRolloutGuard(isRemoteConfigured);

    if (!guard.allowed) {
      return NextResponse.json({
        success: false,
        error: guard.error,
        code: guard.code,
        isConfigError: true,
      }, { status: guard.statusCode || 503 });
    }

    const actorName = req.authorizer || "Authenticated operator";
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

      const after = isRemoteConfigured
        ? allocationSnapshot(result.verifiedState)
        : (() => {
            const updated = flagsmithMockStore.getFlag(req.flagsmithFeatureName);
            return {
              variants: updated?.multivariateOptions.map((item) => ({
                value: item.key,
                percentageAllocation: item.trafficAllocation,
              })) || [],
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

      const action = req.action === "ROLLOUT_WINNER" ? "ROLLOUT_APPROVED_EXECUTED" : "GRADUAL_STAGE_UPDATED";
      await recordAuditLog({
        action,
        actor: { name: actorName, type: "human" },
        entityType: "FLAGSMITH_FLAG",
        entityId: req.flagsmithFeatureName,
        details: `${req.action} verified against Flagsmith. Previous: ${JSON.stringify(before)}; New: ${JSON.stringify(after)}.`,
        metadata: {
          authorizer: actorName,
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

      await recordAuditLog({
        action: "ROLLBACK_EXECUTED",
        actor: { name: actorName, type: "human" },
        entityType: "FLAGSMITH_FLAG",
        entityId: req.flagsmithFeatureName,
        details: `Rollback verified against Flagsmith. Previous: ${JSON.stringify(before)}; New: ${JSON.stringify(after)}.`,
        metadata: {
          authorizer: actorName,
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

      await recordAuditLog({
        action: "KILL_SWITCH_TRIGGERED",
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
