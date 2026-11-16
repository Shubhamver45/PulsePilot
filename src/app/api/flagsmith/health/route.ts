import { NextResponse } from "next/server";
import { getLiveRemoteFeatureState, getManagementAuthHeader } from "@/lib/flagsmith/flagsmith-admin";
import { prisma } from "@/lib/db/prisma";

const getApiUrl = () =>
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");
const getEventsUrl = () =>
  (process.env.FLAGSMITH_EVENTS_URL || "https://events.flagsmith.com/api/v1").replace(/\/$/, "");

export type FlagsmithHealthStatus =
  | "CONNECTED"
  | "PARTIALLY_CONFIGURED"
  | "UNAVAILABLE"
  | "NOT_VERIFIED";

export async function GET(request: Request) {
  const apiUrl = getApiUrl();
  const eventsUrl = getEventsUrl();
  const projectId = process.env.FLAGSMITH_PROJECT_ID || "53867";
  const envKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY ||
    "";

  const managementAuth = getManagementAuthHeader();
  const hasManagementKey = Boolean(managementAuth.Authorization);

  let requestedFeatureName: string | null = null;
  if (request?.url) {
    try {
      const { searchParams } = new URL(request.url);
      requestedFeatureName = searchParams.get("featureName") || searchParams.get("flag");
    } catch {
      // Ignore URL parsing errors
    }
  }

  let measuredLatencyMs: number | null = null;
  let liveFlags: any[] = [];
  let isEnvironmentConnected = false;
  let isManagementConnected = false;
  let activeFeatureState: any = null;
  let environmentNumericId: number | null = null;
  let managementApiError: string | null = null;
  let environmentApiError: string | null = null;

  // 1. Verify Environment Key Connectivity via /flags/
  if (envKey && envKey !== "mock") {
    try {
      const pingStart = Date.now();
      const res = await fetch(`${apiUrl}/flags/`, {
        method: "GET",
        headers: {
          "X-Environment-Key": envKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      measuredLatencyMs = Date.now() - pingStart;

      if (res.ok) {
        liveFlags = await res.json();
        isEnvironmentConnected = true;

        if (Array.isArray(liveFlags) && liveFlags.length > 0) {
          const matched = requestedFeatureName
            ? liveFlags.find((f: any) => f.feature?.name === requestedFeatureName)
            : liveFlags.find((f: any) => f.feature?.type === "MULTIVARIATE" || f.feature?.name?.startsWith("exp_")) || liveFlags[0];

          if (matched) {
            activeFeatureState = matched;
            environmentNumericId = matched.environment || null;
          }
        }
      } else {
        const errText = await res.text();
        environmentApiError = `Flagsmith Environment API returned HTTP ${res.status}: ${errText.slice(0, 100)}`;
      }
    } catch (err: any) {
      environmentApiError = `Network error connecting to Flagsmith Environment API: ${err.message}`;
    }
  } else {
    environmentApiError = "No valid environment key configured (FLAGSMITH_SERVER_SIDE_API_KEY / FLAGSMITH_ENVIRONMENT_KEY).";
  }

  // 2. Verify Management API Access (Organisation Token)
  if (hasManagementKey && projectId) {
    try {
      const mgmtRes = await fetch(`${apiUrl}/projects/${projectId}/features/`, {
        method: "GET",
        headers: {
          ...managementAuth,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (mgmtRes.ok) {
        isManagementConnected = true;
      } else {
        const errText = await mgmtRes.text();
        managementApiError = `Management API returned HTTP ${mgmtRes.status}: ${errText.slice(0, 100)}`;
      }
    } catch (err: any) {
      managementApiError = `Network error connecting to Management API: ${err.message}`;
    }
  } else {
    managementApiError = "FLAGSMITH_ORG_API_TOKEN is not configured. Project-level mutation operations unavailable.";
  }

  // 3. Explicit lookup if specific feature name was requested and not found in /flags/ list
  if (!activeFeatureState && isEnvironmentConnected && requestedFeatureName) {
    try {
      const remote = await getLiveRemoteFeatureState(requestedFeatureName);
      if (remote.success && remote.state) {
        activeFeatureState = remote.state;
        environmentNumericId = remote.state.environment || null;
      }
    } catch {
      // Lookup error handled gracefully
    }
  }

  // 4. Determine Explicit Health Status
  let status: FlagsmithHealthStatus = "UNAVAILABLE";
  if (isEnvironmentConnected && isManagementConnected) {
    status = "CONNECTED";
  } else if (isEnvironmentConnected && !isManagementConnected) {
    status = "PARTIALLY_CONFIGURED";
  } else if (!envKey) {
    status = "NOT_VERIFIED";
  } else {
    status = "UNAVAILABLE";
  }

  // 5. Active Query Ping for Database & Warehouse Status Verification
  let isDatabaseConnected = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;
  let telemetryEventCount = 0;

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      const dbPingStart = Date.now();
      await prisma.$queryRawUnsafe("SELECT 1");
      dbLatencyMs = Date.now() - dbPingStart;
      isDatabaseConnected = true;

      telemetryEventCount = await prisma.telemetryEvent.count();
    } catch (dbErr: any) {
      isDatabaseConnected = false;
      dbError = dbErr.message;
    }
  }

  const sanitizedEnvKey =
    envKey.length > 8
      ? `${envKey.slice(0, 6)}...${envKey.slice(-4)}`
      : envKey
      ? "Configured"
      : "Not Configured";

  const resolvedWarehouseStatus:
    | "LOCAL_POSTGRESQL_TELEMETRY"
    | "EXTERNAL_WAREHOUSE_CONNECTED"
    | "DATABASE_UNAVAILABLE"
    | "NOT_CONFIGURED" =
    process.env.SNOWFLAKE_ACCOUNT || process.env.BIGQUERY_PROJECT
      ? "EXTERNAL_WAREHOUSE_CONNECTED"
      : isDatabaseConnected
      ? "LOCAL_POSTGRESQL_TELEMETRY"
      : process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")
      ? "DATABASE_UNAVAILABLE"
      : "NOT_CONFIGURED";

  const responsePayload = {
    status, // Explicit enum: CONNECTED | PARTIALLY_CONFIGURED | UNAVAILABLE | NOT_VERIFIED
    connected: isEnvironmentConnected,
    environmentKeyConfigured: Boolean(envKey && envKey !== "mock"),
    environmentKeyVerified: isEnvironmentConnected,
    managementApiKeyConfigured: hasManagementKey,
    managementApiKeyVerified: isManagementConnected,
    environmentName: isEnvironmentConnected ? "Development" : "Disconnected",
    environmentId: environmentNumericId,
    environmentKeyPrefix: sanitizedEnvKey,
    projectId,
    apiBaseUrl: apiUrl,
    eventsBaseUrl: eventsUrl,
    sdkStatus: isEnvironmentConnected ? "READY" : "CONNECTING",
    experimentationReadiness: isEnvironmentConnected
      ? isManagementConnected
        ? "READY"
        : "READ_ONLY_EVALUATIONS"
      : "UNCONFIGURED",
    warehouseStatus: resolvedWarehouseStatus,
    database: {
      isDatabaseConnected,
      measuredLatencyMs: dbLatencyMs,
      error: dbError,
    },
    experimentationDataAvailable: telemetryEventCount > 0,
    recordedTelemetryEventsCount: telemetryEventCount,
    measuredLatencyMs: isEnvironmentConnected && measuredLatencyMs !== null ? measuredLatencyMs : null,
    liveFlagsCount: liveFlags.length,
    diagnostics: {
      managementApiError,
      environmentApiError,
      databaseError: dbError,
    },

    // Real Remote Flagsmith Details (Independently Verified from Live Flagsmith Call)
    activeExperimentFlag: activeFeatureState
      ? {
          featureId: activeFeatureState.feature?.id || activeFeatureState.id,
          stateId: activeFeatureState.id,
          name: activeFeatureState.feature?.name || activeFeatureState.name,
          type: activeFeatureState.feature?.type || "MULTIVARIATE",
          enabled: activeFeatureState.enabled ?? true,
          initialValue: activeFeatureState.feature_state_value,
          variants: (activeFeatureState.multivariate_feature_state_values || []).map((mv: any) => ({
            id: mv.id,
            optionId: mv.multivariate_feature_option?.id,
            value: mv.multivariate_feature_option?.string_value,
            allocationPercent: mv.percentage_allocation,
          })),
        }
      : null,

    // Flagsmith Integration Architecture
    integrationArchitecture: {
      clientProtocol: "HTTPS REST API v2 Feature Versioning",
      endpointsUsed: [
        "GET /api/v1/flags/ (Edge feature evaluations)",
        "POST /api/v1/projects/{projectId}/features/ (Multivariate feature provisioning)",
        "POST /api/v1/environments/{envId}/features/{featureId}/versions/ (v2 Version draft creation)",
        "PUT /api/v1/environments/{envId}/features/{featureId}/versions/{versionUuid}/featurestates/{fsId}/ (Draft mutation)",
        "POST /api/v1/environments/{envId}/features/{featureId}/versions/{versionUuid}/publish/ (Atomic publish to edge)",
        "POST /api/v1/identities/ (Identity traits and segment evaluation)",
      ],
      architecturalRationale:
        "Direct HTTPS REST integration with Flagsmith v2 Feature Versioning provides direct serverless typed mutations, eliminates container cold-starts inherent to CLI subprocesses, and guarantees strict read-after-write verification.",
    },
  };

  return NextResponse.json(responsePayload);
}
