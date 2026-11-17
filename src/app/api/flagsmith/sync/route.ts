import { NextResponse } from "next/server";
import {
  listFlagsmithFeatures,
  toggleFlagsmithFeatureState,
  triggerFlagsmithKillSwitch,
  rolloutFlagsmithWinner,
  updateFlagsmithCanaryStage,
} from "@/lib/flagsmith/flagsmith-admin";
import { getUserFromToken } from "@/lib/auth/auth-service";
import { recordAuditLog } from "@/lib/audit/audit-logger";

export async function GET() {
  const result = await listFlagsmithFeatures();
  const flags = result.flags;

  return NextResponse.json({
    status: result.success ? "healthy" : "partially_degraded",
    engine:
      result.source === "flagsmith_remote_api"
        ? "Flagsmith Cloud Edge (Live)"
        : "Flagsmith Mock Adapter (Offline Sandbox)",
    environment: "Development",
    projectId: process.env.FLAGSMITH_PROJECT_ID || "53867",
    activeFlagsCount: flags.filter((f) => f.enabled).length,
    totalFlagsCount: flags.length,
    flags,
    error: result.error,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    // 1. Session Token Extraction & RBAC Verification
    const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieToken = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("pulsepilot_session="))
      ?.split("=")[1];

    const token = authHeader || cookieToken;
    const isCookieAuth = Boolean(!authHeader && cookieToken);
    if (isCookieAuth) {
      const origin = request.headers.get("origin") || request.headers.get("referer");
      const host = request.headers.get("host");
      if (!origin || !host) return NextResponse.json({ success: false, error: "CSRF_DETECTED" }, { status: 403 });
      try {
        if (new URL(origin).host !== host) return NextResponse.json({ success: false, error: "CSRF_DETECTED" }, { status: 403 });
      } catch {
        return NextResponse.json({ success: false, error: "CSRF_DETECTED" }, { status: 403 });
      }
    }
    let user = null;
    if (token) {
      try {
        user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
      } catch {
        // Continue to evaluate
      }
    }

    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction && (!user || (user.role !== "ADMIN" && user.role !== "EDITOR"))) {
      return NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN",
          message: "Feature flag mutations in production require an authenticated ADMIN or EDITOR role.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { flagName, action, enabled, winningVariant, variantKey, percentage } = body;

    if (!flagName) {
      return NextResponse.json(
        { success: false, error: "Feature flag name is required." },
        { status: 400 }
      );
    }

    let mutationResult: any = { success: false };

    switch (action) {
      case "TOGGLE": {
        const targetEnabled = typeof enabled === "boolean" ? enabled : true;
        mutationResult = await toggleFlagsmithFeatureState(flagName, targetEnabled);
        break;
      }

      case "KILL_SWITCH": {
        mutationResult = await triggerFlagsmithKillSwitch(flagName);
        break;
      }

      case "ROLLOUT": {
        if (!winningVariant) {
          return NextResponse.json(
            { success: false, error: "winningVariant is required for 100% rollout." },
            { status: 400 }
          );
        }
        mutationResult = await rolloutFlagsmithWinner(flagName, winningVariant);
        break;
      }

      case "UPDATE_CANARY": {
        if (!variantKey || typeof percentage !== "number") {
          return NextResponse.json(
            { success: false, error: "variantKey and percentage are required for canary stage update." },
            { status: 400 }
          );
        }
        mutationResult = await updateFlagsmithCanaryStage(flagName, variantKey, percentage);
        break;
      }

      default: {
        return NextResponse.json(
          {
            success: false,
            error: `Unsupported action '${action}'. Supported: TOGGLE, KILL_SWITCH, ROLLOUT, UPDATE_CANARY.`,
          },
          { status: 400 }
        );
      }
    }

    // 2. Audit Trail Logging
    const actorName = user?.fullName || "PulsePilot Operator (Studio)";
    const auditAction =
      action === "KILL_SWITCH"
        ? "KILL_SWITCH_TRIGGERED"
        : action === "ROLLOUT"
        ? "ROLLOUT_APPROVED_EXECUTED"
        : action === "UPDATE_CANARY"
        ? "GRADUAL_STAGE_UPDATED"
        : "TRAFFIC_SPLIT_UPDATED";

    await recordAuditLog({
      organizationId: user?.organizationId,
      action: auditAction,
      actor: { name: actorName, type: user ? "human" : "system" },
      entityType: "FLAGSMITH_FLAG",
      entityId: flagName,
      details: `${actorName} performed ${action} on feature flag '${flagName}'. Verified on Flagsmith: ${Boolean(mutationResult.verified)}.`,
      metadata: {
        flagName,
        action,
        mutationResult,
        status: mutationResult.success ? "SUCCESS" : "FAILED",
      },
    }).catch(() => {});

    return NextResponse.json({
      success: mutationResult.success,
      flagName,
      action,
      mutationResult,
      message: `Successfully executed ${action} for '${flagName}' on Flagsmith.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Failed to mutate feature flag.", details: err.message },
      { status: 500 }
    );
  }
}
