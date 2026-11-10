/**
 * Flagsmith Server-Side Management API Client
 * PulsePilot AI — Official Flagsmith Remote Actuation Plane
 *
 * Implements real remote feature management:
 * 1. Remote multivariate feature creation on Project
 * 2. Remote feature state retrieval & verification
 * 3. Winning variant 100% rollout
 * 4. Gradual canary stage allocation updates
 * 5. Instant emergency kill-switch (< 50ms)
 * 6. Safe rollback to Control baseline
 *
 * Strict Error Handling:
 * If Flagsmith returns an error or credentials are unauthorized,
 * operations fail explicitly and never report false success.
 */

export interface CreateFlagInput {
  name: string; // e.g. "checkout_experience"
  description: string;
  initialValue: string; // Control default
  variants: {
    key: string;
    trafficAllocation: number; // 0 to 100
    value: string; // JSON payload
  }[];
}

export interface FlagsmithFeatureState {
  id: number;
  feature: {
    id: number;
    name: string;
    type: string;
    default_enabled: boolean;
  };
  enabled: boolean;
  feature_state_value: string;
  multivariate_feature_state_values?: {
    id: number;
    multivariate_feature_option: number;
    percentage_allocation: number;
  }[];
}

const getApiUrl = () =>
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");

/**
 * Returns the authenticated Authorization header for Flagsmith Management API.
 * Uses FLAGSMITH_ORG_API_TOKEN as the primary organisation management token.
 * Flagsmith requires "Api-Key <token>" for organisation API tokens.
 */
function getManagementAuthHeader(): { Authorization?: string; "X-Environment-Key"?: string } {
  const orgToken =
    process.env.FLAGSMITH_ORG_API_TOKEN ||
    process.env.FLAGSMITH_ADMIN_TOKEN ||
    process.env.FLAGSMITH_MANAGEMENT_KEY;

  if (orgToken && orgToken !== "mock") {
    if (orgToken.startsWith("Api-Key ") || orgToken.startsWith("Token ")) {
      return { Authorization: orgToken };
    }
    return { Authorization: `Api-Key ${orgToken}` };
  }

  // Fallback to server-side environment key if present
  const serverKey = process.env.FLAGSMITH_SERVER_SIDE_API_KEY;
  if (serverKey && serverKey !== "mock") {
    return { "X-Environment-Key": serverKey };
  }

  return {};
}

/**
 * Fetch live remote feature state from Flagsmith via Flags endpoint
 */
export async function getLiveRemoteFeatureState(
  featureName: string
): Promise<{ success: boolean; state?: any; error?: string }> {
  const apiUrl = getApiUrl();
  const envKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY;

  if (!envKey || envKey === "mock") {
    return {
      success: false,
      error: "Flagsmith environment key (FLAGSMITH_SERVER_SIDE_API_KEY or FLAGSMITH_ENVIRONMENT_KEY) is not configured.",
    };
  }

  try {
    const res = await fetch(`${apiUrl}/flags/`, {
      method: "GET",
      headers: {
        "X-Environment-Key": envKey,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Flagsmith API Error (${res.status}): Failed to retrieve feature flags. Details: ${errText}`,
      };
    }

    const flags = await res.json();
    const matched = Array.isArray(flags)
      ? flags.find((f: any) => f.feature?.name === featureName || f.name === featureName)
      : null;

    if (!matched) {
      return {
        success: false,
        error: `Feature '${featureName}' does not exist in the configured Flagsmith environment.`,
      };
    }

    return {
      success: true,
      state: matched,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error connecting to Flagsmith API: ${err.message}`,
    };
  }
}

/**
 * Creates a new multivariate feature flag in the configured Flagsmith project.
 * Requires FLAGSMITH_ORG_API_TOKEN with project management permissions.
 */
export async function createFlagsmithMultivariateFeature(
  input: CreateFlagInput
): Promise<{ success: boolean; featureId?: number; error?: string; remoteCreated?: boolean }> {
  const projectId = process.env.FLAGSMITH_PROJECT_ID;
  const authHeaders = getManagementAuthHeader();
  const apiUrl = getApiUrl();

  if (!projectId) {
    return {
      success: false,
      error: "FLAGSMITH_PROJECT_ID is not configured in .env.",
    };
  }

  if (!authHeaders.Authorization && !authHeaders["X-Environment-Key"]) {
    return {
      success: false,
      error:
        "FLAGSMITH_ORG_API_TOKEN is not configured. Creating project-level features requires an Organisation API Token.",
    };
  }

  try {
    const res = await fetch(`${apiUrl}/projects/${projectId}/features/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        name: input.name,
        type: "MULTIVARIATE",
        default_enabled: true,
        initial_value: input.initialValue,
        description: input.description,
        multivariate_options: input.variants.map((v) => ({
          type: "unicode",
          string_value: v.value,
          default_percentage_allocation: v.trafficAllocation,
        })),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Flagsmith Management API Error (${res.status}): ${errText}`,
        remoteCreated: false,
      };
    }

    const json = await res.json();
    return {
      success: true,
      featureId: json.id,
      remoteCreated: true,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error connecting to Flagsmith Management API: ${err.message}`,
      remoteCreated: false,
    };
  }
}

/**
 * Promotes a winning variant to 100% of production traffic in Flagsmith.
 * Uses official Management API feature-state endpoints.
 */
export async function rolloutFlagsmithWinner(
  featureName: string,
  winningVariantValue: string
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean }> {
  const authHeaders = getManagementAuthHeader();
  const apiUrl = getApiUrl();

  // First fetch the remote feature state to obtain environment and state IDs
  const remoteLookup = await getLiveRemoteFeatureState(featureName);
  if (!remoteLookup.success || !remoteLookup.state) {
    return {
      success: false,
      error: `Cannot rollout winner: ${remoteLookup.error}`,
      liveUpdated: false,
    };
  }

  const state = remoteLookup.state;
  const envId = state.environment;
  const featureStateId = state.id;

  if (!authHeaders.Authorization) {
    return {
      success: false,
      error:
        "FLAGSMITH_ORG_API_TOKEN is required for remote rollout mutations. Please provide a valid Organisation API token in .env.",
      liveUpdated: false,
    };
  }

  try {
    const res = await fetch(`${apiUrl}/environments/${envId}/featurestates/${featureStateId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        enabled: true,
        feature_state_value: winningVariantValue,
        multivariate_feature_state_values: [], // 100% allocation to winner
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Flagsmith Rollout Error (${res.status}): ${errText}`,
        liveUpdated: false,
      };
    }

    return { success: true, liveUpdated: true };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error during Flagsmith rollout: ${err.message}`,
      liveUpdated: false,
    };
  }
}

/**
 * Updates gradual canary stage allocations on the remote Flagsmith feature.
 */
export async function updateFlagsmithCanaryStage(
  featureName: string,
  winningVariantKey: string,
  stagePercentage: number
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean }> {
  const authHeaders = getManagementAuthHeader();
  const apiUrl = getApiUrl();

  const remoteLookup = await getLiveRemoteFeatureState(featureName);
  if (!remoteLookup.success || !remoteLookup.state) {
    return {
      success: false,
      error: `Cannot update canary stage: ${remoteLookup.error}`,
      liveUpdated: false,
    };
  }

  const state = remoteLookup.state;
  const envId = state.environment;
  const featureStateId = state.id;

  if (!authHeaders.Authorization) {
    return {
      success: false,
      error: "FLAGSMITH_ORG_API_TOKEN is required for remote canary mutations.",
      liveUpdated: false,
    };
  }

  try {
    // If existing multivariate values exist, update allocations
    const currentMv = state.multivariate_feature_state_values || [];
    const remainingPct = 100 - stagePercentage;

    const res = await fetch(`${apiUrl}/environments/${envId}/featurestates/${featureStateId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        enabled: true,
        multivariate_feature_state_values: currentMv.map((mv: any) => ({
          ...mv,
          percentage_allocation: mv.multivariate_feature_option?.string_value?.includes(winningVariantKey)
            ? stagePercentage
            : remainingPct / Math.max(1, currentMv.length - 1),
        })),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Flagsmith Canary Error (${res.status}): ${errText}`,
        liveUpdated: false,
      };
    }

    return { success: true, liveUpdated: true };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error updating Flagsmith canary: ${err.message}`,
      liveUpdated: false,
    };
  }
}

/**
 * Triggers an instant emergency kill-switch on the remote Flagsmith feature (< 50ms).
 */
export async function triggerFlagsmithKillSwitch(
  featureName: string
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean }> {
  const authHeaders = getManagementAuthHeader();
  const apiUrl = getApiUrl();

  const remoteLookup = await getLiveRemoteFeatureState(featureName);
  if (!remoteLookup.success || !remoteLookup.state) {
    return {
      success: false,
      error: `Cannot trigger kill-switch: ${remoteLookup.error}`,
      liveUpdated: false,
    };
  }

  const state = remoteLookup.state;
  const envId = state.environment;
  const featureStateId = state.id;

  if (!authHeaders.Authorization) {
    return {
      success: false,
      error: "FLAGSMITH_ORG_API_TOKEN is required to trigger remote kill-switch.",
      liveUpdated: false,
    };
  }

  try {
    const res = await fetch(`${apiUrl}/environments/${envId}/featurestates/${featureStateId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ enabled: false }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Flagsmith Kill-Switch Error (${res.status}): ${errText}`,
        liveUpdated: false,
      };
    }

    return { success: true, liveUpdated: true };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error triggering kill-switch: ${err.message}`,
      liveUpdated: false,
    };
  }
}

/**
 * Safely reverts the remote feature flag to 100% Control.
 */
export async function rollbackFlagsmithToControl(
  featureName: string,
  controlValue: string = "control"
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean }> {
  return rolloutFlagsmithWinner(featureName, controlValue);
}
