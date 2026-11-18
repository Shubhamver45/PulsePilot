import { NextResponse } from "next/server";
import { getLiveRemoteFeatureState } from "@/lib/flagsmith/flagsmith-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEMO_EXPERIMENT_FLAG = "exp_pulsepilot_judge_checkout_v1";

const getApiUrl = () =>
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");

export async function GET() {
  const apiUrl = getApiUrl();
  const projectId = process.env.FLAGSMITH_PROJECT_ID || "";
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
    ? await getLiveRemoteFeatureState(DEMO_EXPERIMENT_FLAG)
    : { success: false as const, error: "FLAGSMITH_PROJECT_ID is not configured." };

  const state = management.success ? management.state : null;
  const optionStates = Array.isArray(state?.multivariate_feature_state_values)
    ? state.multivariate_feature_state_values
    : [];

  const variants = optionStates.map((item: any) => {
    const option = item.multivariate_feature_option || {};
    return {
      key: option.key ?? null,
      optionId: option.id ?? null,
      value: option.string_value ?? null,
      allocationPercent: Number.isFinite(Number(item.percentage_allocation))
        ? Number(item.percentage_allocation)
        : null,
    };
  });
  const treatmentTotalPercent = variants.every((variant: any) => variant.allocationPercent !== null)
    ? variants.reduce((sum: number, variant: any) => sum + variant.allocationPercent, 0)
    : null;
  const controlPercent = treatmentTotalPercent !== null && treatmentTotalPercent <= 100
    ? 100 - treatmentTotalPercent
    : null;
  const allocationVerified = Boolean(
    management.success &&
    state?.enabled === true &&
    state?.feature_state_value &&
    variants.length === 2 &&
    variants.every((variant: any) => variant.key && variant.allocationPercent !== null) &&
    controlPercent !== null &&
    controlPercent + treatmentTotalPercent! === 100
  );

  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock"
  );

  return NextResponse.json({
    aiCopilot: {
      configured: geminiConfigured,
      provider: "Google Gemini",
      model: "Configured server-side",
    },
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
    experimentationReadiness: allocationVerified ? "READY" : "NEEDS_CONFIGURATION",
    measuredLatencyMs: edgeLatencyMs,
    liveFlagsCount,
    activeExperimentFlag: state ? {
      featureId: state.feature?.id ?? null,
      stateId: state.id ?? null,
      name: state.feature?.name ?? DEMO_EXPERIMENT_FLAG,
      type: state.feature?.type ?? null,
      enabled: state.enabled ?? null,
      defaultValue: state.feature_state_value ?? null,
      variants,
      controlPercent,
      treatmentTotalPercent,
      allocationTotalPercent: controlPercent !== null ? controlPercent + treatmentTotalPercent! : null,
    } : null,
    managementError: management.success ? null : management.error,
    lastSynchronizedAt: new Date().toISOString(),
  });
}
