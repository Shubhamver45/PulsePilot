import { NextResponse } from "next/server";
import { getLiveRemoteFeatureState } from "@/lib/flagsmith/flagsmith-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getApiUrl = () =>
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");

export async function GET() {
  const apiUrl = getApiUrl();
  const projectId = process.env.FLAGSMITH_PROJECT_ID || "53867";
  const environmentKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY ||
    process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID ||
    "";

  let edgeConnected = false;
  let edgeLatencyMs: number | null = null;
  let liveFlagsCount = 0;

  if (environmentKey && environmentKey !== "mock") {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${apiUrl}/flags/`, {
        headers: {
          "X-Environment-Key": environmentKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      edgeLatencyMs = Date.now() - startedAt;
      if (response.ok) {
        const flags = await response.json();
        edgeConnected = true;
        liveFlagsCount = Array.isArray(flags) ? flags.length : 0;
      }
    } catch {
      edgeConnected = false;
    }
  }

  // Management state is separate from edge evaluation: it is the only safe
  // source for editable multivariate allocation records.
  const management = projectId
    ? await getLiveRemoteFeatureState("exp_checkout_layout_v2")
    : { success: false as const, error: "FLAGSMITH_PROJECT_ID is not configured." };

  const state = management.success ? management.state : null;
  const optionStates = Array.isArray(state?.multivariate_feature_state_values)
    ? state.multivariate_feature_state_values
    : [];

  const variants = optionStates.map((item: any) => {
    const option = item.multivariate_feature_option || {};
    return {
      optionId: option.id ?? null,
      value: option.string_value ?? null,
      allocationPercent: Number.isFinite(Number(item.percentage_allocation))
        ? Number(item.percentage_allocation)
        : null,
    };
  });

  return NextResponse.json({
    connected: edgeConnected,
    edgeConnected,
    managementApiConnected: management.success,
    apiKeyConfigured: Boolean(process.env.FLAGSMITH_ORG_API_TOKEN || process.env.FLAGSMITH_ADMIN_TOKEN),
    environmentKeyConfigured: Boolean(environmentKey && environmentKey !== "mock"),
    environmentName: "Configured Flagsmith environment",
    environmentId: state?.environment ?? null,
    projectId: projectId || null,
    apiBaseUrl: apiUrl,
    sdkStatus: edgeConnected ? "READY" : "UNAVAILABLE",
    experimentationReadiness: management.success && variants.length > 0 ? "READY" : "NEEDS_CONFIGURATION",
    measuredLatencyMs: edgeLatencyMs,
    liveFlagsCount,
    activeExperimentFlag: state ? {
      featureId: state.feature?.id ?? null,
      stateId: state.id ?? null,
      name: state.feature?.name ?? "exp_checkout_layout_v2",
      type: state.feature?.type ?? null,
      enabled: state.enabled ?? null,
      defaultValue: state.feature_state_value ?? null,
      variants,
      allocationTotalPercent: variants.every((variant: any) => variant.allocationPercent !== null)
        ? variants.reduce((sum: number, variant: any) => sum + variant.allocationPercent, 0)
        : null,
    } : null,
    managementError: management.success ? null : management.error,
    lastSynchronizedAt: new Date().toISOString(),
  });
}
