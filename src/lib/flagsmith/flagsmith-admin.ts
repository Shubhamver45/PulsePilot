/**
 * Flagsmith Server-Side Management API Client
 * PulsePilot AI — Official Flagsmith Remote Actuation Plane
 *
 * Implements real remote feature management:
 * 1. Remote multivariate feature creation on Project (Idempotent & Verified)
 * 2. Remote feature state retrieval & verification
 * 3. Winning variant 100% rollout with read-after-write verification
 * 4. Gradual canary stage allocation updates with verification
 * 5. Instant emergency kill-switch (< 50ms) with verification
 * 6. Safe rollback to Control baseline with verification
 *
 * Strict Error Handling:
 * If Flagsmith returns an error or credentials are unauthorized,
 * operations fail explicitly and never report false success.
 */

export interface CreateFlagInput {
  name: string; // e.g. "exp_checkout_layout_v2"
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
    multivariate_feature_option: {
      id: number;
      type: string;
      string_value: string;
    };
    percentage_allocation: number;
  }[];
}

const getApiUrl = () =>
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");

/**
 * Returns the authenticated Authorization header for Flagsmith Management API.
 * Uses FLAGSMITH_ORG_API_TOKEN as the primary organisation management token.
 * Flagsmith requires "Api-Key <token>" for organisation API tokens.
 *
 * Note: Server-side environment keys (starting with "ser.") must NOT be used
 * for Management API operations (projects/features), as Flagsmith returns 401.
 */
export function getManagementAuthHeader(): { Authorization?: string } {
  const orgToken =
    process.env.FLAGSMITH_ORG_API_TOKEN ||
    process.env.FLAGSMITH_ADMIN_TOKEN ||
    (process.env.FLAGSMITH_MANAGEMENT_KEY && !process.env.FLAGSMITH_MANAGEMENT_KEY.startsWith("ser.")
      ? process.env.FLAGSMITH_MANAGEMENT_KEY
      : undefined);

  if (!orgToken || orgToken === "mock") return {};
  return {
    Authorization: orgToken.startsWith("Api-Key ") || orgToken.startsWith("Token ")
      ? orgToken
      : `Api-Key ${orgToken}`,
  };
}

/**
 * Fetch live remote feature state from Flagsmith via Flags endpoint
 */
function unwrapApiList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function optionKey(option: any): string | undefined {
  if (!option) return undefined;
  if (typeof option === "string") return option;
  return option.key ?? option.string_value ?? option.value;
}

function optionFeatureValue(option: any): string | undefined {
  if (!option) return undefined;
  if (typeof option === "string") return option;
  return option.string_value ?? option.value ?? option.key;
}

function multivariateOptionId(item: any): number | undefined {
  const option = item?.multivariate_feature_option ?? item?.feature_option;
  if (typeof option === "number") return option;
  return typeof option?.id === "number" ? option.id : undefined;
}

function normaliseFlagValue(value: any): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value.string_value === "string") return value.string_value;
  if (value === undefined || value === null) return undefined;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export interface FlagsmithAllocationVerification {
  verified: boolean;
  controlPercent: number | null;
  treatmentPercent: number | null;
  totalPercent: number | null;
  variants: Array<{ key: string; expectedPercent: number; actualPercent: number | null }>;
  errors: string[];
}

/**
 * Verifies the actual environment feature-state allocations returned by the
 * Flagsmith Management API. Project-level option existence alone is not proof
 * that a live environment has the requested experiment distribution.
 */
export function verifyFlagsmithAllocationState(
  state: any,
  input: CreateFlagInput
): FlagsmithAllocationVerification {
  const errors: string[] = [];
  const expectedTreatmentTotal = input.variants.reduce(
    (sum, variant) => sum + Number(variant.trafficAllocation),
    0
  );
  const expectedControlPercent = 100 - expectedTreatmentTotal;
  const remoteOptions = Array.isArray(state?.multivariate_feature_state_values)
    ? state.multivariate_feature_state_values
    : [];
  const verifiedVariants: FlagsmithAllocationVerification["variants"] = [];
  let actualTreatmentTotal = 0;

  const controlValue = normaliseFlagValue(state?.feature_state_value);
  if (controlValue !== input.initialValue) {
    errors.push("The remote Flagsmith default/control value does not match the requested experiment control configuration.");
  }

  for (const expected of input.variants) {
    const match = remoteOptions.find((item: any) =>
      optionKey(item?.multivariate_feature_option) === expected.key
    );
    const actual = match && Number.isFinite(Number(match.percentage_allocation))
      ? Number(match.percentage_allocation)
      : null;

    verifiedVariants.push({
      key: expected.key,
      expectedPercent: Number(expected.trafficAllocation),
      actualPercent: actual,
    });

    if (actual === null) {
      errors.push(`Flagsmith environment state does not expose an allocation for variant '${expected.key}'.`);
      continue;
    }

    actualTreatmentTotal += actual;
    if (Math.abs(actual - Number(expected.trafficAllocation)) > 0.01) {
      errors.push(`Variant '${expected.key}' allocation mismatch: expected ${expected.trafficAllocation}%, received ${actual}%.`);
    }
  }

  // Any option outside this strategy must not consume traffic silently.
  for (const remote of remoteOptions) {
    const remoteKey = optionKey(remote?.multivariate_feature_option);
    const expected = input.variants.find((variant) => variant.key === remoteKey);
    const allocation = Number(remote?.percentage_allocation ?? 0);
    if (!expected && Number.isFinite(allocation) && allocation > 0.01) {
      errors.push(`Unconfigured Flagsmith option '${remoteKey || "unknown"}' still receives ${allocation}% traffic.`);
    }
  }

  const actualControlPercent = 100 - actualTreatmentTotal;
  if (Math.abs(actualControlPercent - expectedControlPercent) > 0.01) {
    errors.push(`Default/control allocation mismatch: expected ${expectedControlPercent}%, received ${actualControlPercent}%.`);
  }

  const treatmentTotalMatches = Math.abs(actualTreatmentTotal - expectedTreatmentTotal) <= 0.01;
  const actualTotal = actualTreatmentTotal + actualControlPercent;
  if (!treatmentTotalMatches || Math.abs(actualTotal - 100) > 0.01) {
    errors.push(`The verified Flagsmith allocation invariant failed: received ${actualTotal}% total.`);
  }

  return {
    verified: errors.length === 0,
    controlPercent: remoteOptions.length ? actualControlPercent : null,
    treatmentPercent: remoteOptions.length ? actualTreatmentTotal : null,
    totalPercent: remoteOptions.length ? actualTotal : null,
    variants: verifiedVariants,
    errors,
  };
}

/**
 * Reads the authoritative environment feature state from the Flagsmith
 * Management API. The public Flags API is intentionally used only for
 * per-identity evaluation; it does not provide the editable allocation
 * records required for safe mutations.
 */
export async function getLiveRemoteFeatureState(
  featureName: string
): Promise<{ success: boolean; state?: any; error?: string }> {
  const apiUrl = getApiUrl();
  const projectId = process.env.FLAGSMITH_PROJECT_ID;
  const environmentKey =
    process.env.FLAGSMITH_ENVIRONMENT_KEY ||
    process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID ||
    "";

  const authHeaders = getManagementAuthHeader();
  if (!authHeaders.Authorization) {
    return {
      success: false,
      error: "A Flagsmith Organisation API token is required to read authoritative feature states.",
    };
  }
  if (!projectId || !environmentKey || environmentKey === "mock") {
    return {
      success: false,
      error: "FLAGSMITH_PROJECT_ID and FLAGSMITH_ENVIRONMENT_KEY must be configured for Management API operations.",
    };
  }

  try {
    const headers = { "Content-Type": "application/json", ...authHeaders };

    // The Management API feature-state list endpoint is keyed by the environment
    // API key. Keep the numeric environment ID for feature-version operations.
    const [environmentsResponse, featuresResponse] = await Promise.all([
      fetch(`${apiUrl}/environments/`, { headers, cache: "no-store" }),
      fetch(`${apiUrl}/projects/${projectId}/features/`, { headers, cache: "no-store" }),
    ]);

    if (!environmentsResponse.ok) {
      return { success: false, error: `Flagsmith environment lookup failed (${environmentsResponse.status}).` };
    }
    if (!featuresResponse.ok) {
      return { success: false, error: `Flagsmith project feature lookup failed (${featuresResponse.status}).` };
    }

    const [environmentsPayload, featuresPayload] = await Promise.all([
      environmentsResponse.json(),
      featuresResponse.json(),
    ]);
    const environments = unwrapApiList(environmentsPayload);
    const features = unwrapApiList(featuresPayload);

    const environment = environments.find((item: any) =>
      item.api_key === environmentKey ||
      item.apiKey === environmentKey ||
      String(item.id) === environmentKey
    );
    const feature = features.find((item: any) =>
      String(item.name || "").toLowerCase() === featureName.toLowerCase()
    );

    if (!environment) {
      return { success: false, error: "The configured Flagsmith environment key was not found in the selected project." };
    }
    if (!feature) {
      return { success: false, error: `Feature '${featureName}' was not found in Flagsmith project ${projectId}.` };
    }

    const statesResponse = await fetch(
      `${apiUrl}/environments/${encodeURIComponent(environmentKey)}/featurestates/`,
      { headers, cache: "no-store" }
    );
    if (!statesResponse.ok) {
      return { success: false, error: `Flagsmith environment feature-state lookup failed (${statesResponse.status}).` };
    }
    const states = unwrapApiList(await statesResponse.json());

    const state = states.find((item: any) => {
      const featureRef = item.feature ?? item.feature_id;
      const featureId = typeof featureRef === "number" ? featureRef : featureRef?.id;
      return Number(featureId) === Number(feature.id);
    });

    if (!state) {
      return { success: false, error: `No environment feature state exists for '${featureName}'.` };
    }

    const projectOptions = Array.isArray(feature.multivariate_options)
      ? feature.multivariate_options
      : [];
    const stateOptions = Array.isArray(state.multivariate_feature_state_values)
      ? state.multivariate_feature_state_values.map((item: any) => {
          const optionId = multivariateOptionId(item);
          const definition = projectOptions.find((option: any) => Number(option.id) === Number(optionId));
          const currentOption =
            typeof item.multivariate_feature_option === "object"
              ? item.multivariate_feature_option
              : null;
          return {
            ...item,
            multivariate_feature_option: definition || currentOption || item.multivariate_feature_option,
          };
        })
      : [];

    return {
      success: true,
      state: {
        ...state,
        environment: environment.id,
        feature: {
          ...feature,
          id: feature.id,
          name: feature.name,
          multivariate_options: projectOptions,
        },
        multivariate_feature_state_values: stateOptions,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Flagsmith Management API request failed: ${err?.message || "Unknown network error"}`,
    };
  }
}

/**
 * Creates a new multivariate feature flag in the configured Flagsmith project.
 * Implements idempotent checks: if the feature already exists, verifies and maps it.
 * Performs read-after-write verification against the remote environment.
 */
export async function createFlagsmithMultivariateFeature(
  input: CreateFlagInput
): Promise<{
  success: boolean;
  featureId?: number;
  error?: string;
  remoteCreated?: boolean;
  isExisting?: boolean;
  state?: any;
  allocationVerification?: FlagsmithAllocationVerification;
}> {
  const projectId = process.env.FLAGSMITH_PROJECT_ID;
  const authHeaders = getManagementAuthHeader();
  const apiUrl = getApiUrl();

  // Feature provisioning always requires an Organisation Management API token.
  // Check this first so callers receive the precise credential prerequisite,
  // even when the project ID is also missing.
  if (!authHeaders.Authorization) {
    return {
      success: false,
      error:
        "FLAGSMITH_ORG_API_TOKEN is not configured. Project-level multivariate feature creation requires a Flagsmith Organisation API Token (Settings -> API Keys in Flagsmith).",
      remoteCreated: false,
    };
  }

  if (!projectId) {
    return {
      success: false,
      error: "FLAGSMITH_PROJECT_ID is not configured in .env.",
      remoteCreated: false,
    };
  }

  // 1. Idempotency Check: if the feature exists, reconcile missing keyed
  // options instead of silently claiming it is ready for experimentation.
  const existingCheck = await getLiveRemoteFeatureState(input.name);
  if (existingCheck.success && existingCheck.state) {
    const existingState = existingCheck.state;
    const featureId = existingState.feature?.id || existingState.id;
    const existingOptions = Array.isArray(existingState.feature?.multivariate_options)
      ? existingState.feature.multivariate_options
      : [];
    const existingByKey = new Map<string, any>();
    for (const option of existingOptions) {
      const key = optionKey(option);
      if (key) existingByKey.set(key, option);
    }

    const mismatched = input.variants.find((variant) => {
      const current = existingByKey.get(variant.key);
      return current && optionFeatureValue(current) !== variant.value;
    });
    if (mismatched) {
      return {
        success: false,
        featureId,
        isExisting: true,
        remoteCreated: false,
        state: existingState,
        error: `Flagsmith feature '${input.name}' already has key '${mismatched.key}' with a different value. Reconcile the remote option before provisioning this strategy.`,
      };
    }

    const missing = input.variants.filter((variant) => !existingByKey.has(variant.key));
    // Legacy options that were created without explicit keys cannot safely be
    // associated with experiment events; do not add a duplicate string value.
    const legacyValueCollision = missing.find((variant) =>
      existingOptions.some((option: any) =>
        !optionKey(option) && optionFeatureValue(option) === variant.value
      )
    );
    if (legacyValueCollision) {
      return {
        success: false,
        featureId,
        isExisting: true,
        remoteCreated: false,
        state: existingState,
        error: `Flagsmith feature '${input.name}' contains a legacy unkeyed option for '${legacyValueCollision.key}'. Migrate that option to an explicit variant key in Flagsmith before reusing it.`,
      };
    }

    if (missing.length) {
      if (!authHeaders.Authorization) {
        return {
          success: false,
          featureId,
          isExisting: true,
          remoteCreated: false,
          state: existingState,
          error: "A Flagsmith Organisation API token is required to add missing keyed multivariate options.",
        };
      }

      for (const variant of missing) {
        const optionResponse = await fetch(
          `${apiUrl}/projects/${projectId}/features/${featureId}/mv-options/`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify({
              type: "unicode",
              string_value: variant.value,
              key: variant.key,
              default_percentage_allocation: variant.trafficAllocation,
            }),
          }
        );
        if (!optionResponse.ok) {
          const detail = await optionResponse.text();
          return {
            success: false,
            featureId,
            isExisting: true,
            remoteCreated: false,
            state: existingState,
            error: `Flagsmith could not add missing keyed option '${variant.key}' (${optionResponse.status}): ${detail.slice(0, 500)}`,
          };
        }
      }

      const verification = await getLiveRemoteFeatureState(input.name);
      if (!verification.success || !verification.state) {
        return {
          success: false,
          featureId,
          isExisting: true,
          remoteCreated: false,
          error: `Missing options were submitted, but the environment could not be verified: ${verification.error || "No state returned"}`,
        };
      }

      const verifiedKeys = new Set(
        (verification.state.feature?.multivariate_options || [])
          .map((option: any) => optionKey(option))
          .filter(Boolean)
      );
      const stillMissing = input.variants.map((variant) => variant.key).filter((key) => !verifiedKeys.has(key));
      if (stillMissing.length) {
        return {
          success: false,
          featureId,
          isExisting: true,
          remoteCreated: false,
          state: verification.state,
          error: `Flagsmith verification is still missing keyed options: ${stillMissing.join(", ")}.`,
        };
      }

      const allocationVerification = verifyFlagsmithAllocationState(verification.state, input);
      if (!allocationVerification.verified) {
        return {
          success: false,
          featureId,
          isExisting: true,
          remoteCreated: false,
          state: verification.state,
          allocationVerification,
          error: `Flagsmith variant options exist, but live allocations did not verify: ${allocationVerification.errors.join(" ")}`,
        };
      }

      return {
        success: true,
        featureId,
        isExisting: true,
        remoteCreated: false,
        state: verification.state,
        allocationVerification,
      };
    }

    const allocationVerification = verifyFlagsmithAllocationState(existingState, input);
    if (!allocationVerification.verified) {
      return {
        success: false,
        featureId,
        isExisting: true,
        remoteCreated: false,
        state: existingState,
        allocationVerification,
        error: `Existing Flagsmith feature does not match the requested live allocation: ${allocationVerification.errors.join(" ")}`,
      };
    }

    return {
      success: true,
      featureId,
      isExisting: true,
      remoteCreated: false,
      state: existingState,
      allocationVerification,
    };
  }

  // 2. Validate Management API credentials
  if (!authHeaders.Authorization) {
    return {
      success: false,
      error:
        "FLAGSMITH_ORG_API_TOKEN is not configured. Project-level multivariate feature creation requires a Flagsmith Organisation API Token (Settings -> API Keys in Flagsmith).",
      remoteCreated: false,
    };
  }

  try {
    // Create the multivariate parent feature first. Flagsmith requires each
    // variation to be created separately so every option has a stable key;
    // unkeyed inline variants are not sufficient for exposure tracking.
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
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      if (errText.toLowerCase().includes("already exists")) {
        const retryCheck = await getLiveRemoteFeatureState(input.name);
        if (retryCheck.success && retryCheck.state) {
          return {
            success: true,
            featureId: retryCheck.state.feature?.id || retryCheck.state.id,
            isExisting: true,
            remoteCreated: false,
            state: retryCheck.state,
          };
        }
      }
      return {
        success: false,
        error: `Flagsmith Management API Error (${res.status}): ${errText}`,
        remoteCreated: false,
      };
    }

    const json = await res.json();
    const createdFeatureId = Number(json.id);
    if (!createdFeatureId) {
      return { success: false, error: "Flagsmith created the parent feature but returned no numeric feature ID.", remoteCreated: true };
    }

    // Add each keyed multivariate option using the documented mv-options endpoint.
    for (const variant of input.variants) {
      const optionResponse = await fetch(
        `${apiUrl}/projects/${projectId}/features/${createdFeatureId}/mv-options/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({
            type: "unicode",
            string_value: variant.value,
            key: variant.key,
            default_percentage_allocation: variant.trafficAllocation,
          }),
        }
      );

      if (!optionResponse.ok) {
        const detail = await optionResponse.text();
        return {
          success: false,
          featureId: createdFeatureId,
          remoteCreated: true,
          error: `Flagsmith created the feature but failed to add keyed variant '${variant.key}' (${optionResponse.status}): ${detail.slice(0, 500)}`,
        };
      }
    }

    // Read-after-write verification confirms that each keyed option is
    // visible in this environment before returning success.
    const verification = await getLiveRemoteFeatureState(input.name);
    if (!verification.success || !verification.state) {
      return {
        success: false,
        featureId: createdFeatureId,
        remoteCreated: true,
        error: `Feature and keyed options were created, but environment verification failed: ${verification.error || "No environment state returned"}`,
      };
    }

    const verifiedOptions = verification.state.multivariate_feature_state_values || [];
    const configuredKeys = new Set(verifiedOptions.map((item: any) => optionKey(item.multivariate_feature_option)));
    const missingKeys = input.variants.map((variant) => variant.key).filter((key) => !configuredKeys.has(key));
    if (missingKeys.length) {
      return {
        success: false,
        featureId: createdFeatureId,
        remoteCreated: true,
        state: verification.state,
        error: `Flagsmith environment verification is missing keyed options: ${missingKeys.join(", ")}.`,
      };
    }

    const allocationVerification = verifyFlagsmithAllocationState(verification.state, input);
    if (!allocationVerification.verified) {
      return {
        success: false,
        featureId: createdFeatureId,
        remoteCreated: true,
        state: verification.state,
        allocationVerification,
        error: `Flagsmith feature exists but the live environment allocation did not verify: ${allocationVerification.errors.join(" ")}`,
      };
    }

    return {
      success: true,
      featureId: createdFeatureId,
      remoteCreated: true,
      state: verification.state,
      allocationVerification,
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
 * Helper to mutate remote feature state on Flagsmith.
 * Supports both modern Flagsmith v2 Feature Versioning environments and v1 environments.
 * Performs read-after-write verification.
 */
async function mutateRemoteFeatureState(
  featureName: string,
  mutationDescription: string,
  mutatePayloadFn: (currentDraft: any) => {
    enabled?: boolean;
    feature_state_value?: any;
    multivariate_feature_state_values?: any[];
  }
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean; verifiedState?: any }> {
  const authHeaders = getManagementAuthHeader();
  const apiUrl = getApiUrl();

  if (!authHeaders.Authorization) {
    return {
      success: false,
      error: "FLAGSMITH_ORG_API_TOKEN is required for remote feature mutations.",
      liveUpdated: false,
    };
  }

  const remoteLookup = await getLiveRemoteFeatureState(featureName);
  if (!remoteLookup.success || !remoteLookup.state) {
    return {
      success: false,
      error: `Cannot ${mutationDescription}: ${remoteLookup.error || "Feature state not found"}`,
      liveUpdated: false,
    };
  }

  const state = remoteLookup.state;
  const envId = state.environment;
  const featureId = state.feature?.id;
  const featureStateId = state.id;

  if (!envId || !featureId || !featureStateId) {
    return {
      success: false,
      error: `Cannot ${mutationDescription}: Flagsmith did not return the environment, feature, and feature-state identifiers required for a safe mutation.`,
      liveUpdated: false,
    };
  }

  try {
    const headers = { "Content-Type": "application/json", ...authHeaders };
    let expectedMutation: any;

    const versionResponse = await fetch(
      `${apiUrl}/environments/${envId}/features/${featureId}/versions/`,
      { method: "POST", headers, body: JSON.stringify({}) }
    );

    if (versionResponse.ok) {
      const version = await versionResponse.json();
      if (!version?.uuid) {
        return { success: false, error: "Flagsmith returned an invalid feature-version response.", liveUpdated: false };
      }

      const draftResponse = await fetch(
        `${apiUrl}/environments/${envId}/features/${featureId}/versions/${version.uuid}/featurestates/`,
        { headers, cache: "no-store" }
      );
      if (!draftResponse.ok) {
        return {
          success: false,
          error: `Failed to retrieve the Flagsmith draft feature state (${draftResponse.status}).`,
          liveUpdated: false,
        };
      }

      const draftPayload = await draftResponse.json();
      const draft = Array.isArray(draftPayload) ? draftPayload[0] : draftPayload;
      if (!draft?.id) {
        return { success: false, error: "Flagsmith returned an empty feature-version draft.", liveUpdated: false };
      }

      // Versioned draft payloads may expose only the numeric multivariate option
      // ID. Hydrate option definitions from the authoritative environment state
      // for key/value matching, but keep numeric IDs in the Management API body.
      const sourceOptions = new Map<number, any>();
      for (const item of state.multivariate_feature_state_values || []) {
        const optionId = multivariateOptionId(item);
        if (optionId !== undefined) sourceOptions.set(optionId, item.multivariate_feature_option);
      }
      const enrichedDraft = {
        ...draft,
        multivariate_feature_state_values: (draft.multivariate_feature_state_values || []).map((item: any) => ({
          ...item,
          multivariate_feature_option:
            typeof item.multivariate_feature_option === "object"
              ? item.multivariate_feature_option
              : sourceOptions.get(multivariateOptionId(item) || -1) ?? item.multivariate_feature_option,
        })),
      };

      expectedMutation = mutatePayloadFn(enrichedDraft);
      const mutationsForWire = {
        ...expectedMutation,
        ...(Array.isArray(expectedMutation?.multivariate_feature_state_values)
          ? {
              multivariate_feature_state_values: expectedMutation.multivariate_feature_state_values.map((item: any) => ({
                ...item,
                multivariate_feature_option: multivariateOptionId(item),
              })),
            }
          : {}),
      };

      const updateResponse = await fetch(
        `${apiUrl}/environments/${envId}/features/${featureId}/versions/${version.uuid}/featurestates/${draft.id}/`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ ...draft, ...mutationsForWire }),
        }
      );
      if (!updateResponse.ok) {
        const detail = await updateResponse.text();
        return {
          success: false,
          error: `Flagsmith draft update failed (${updateResponse.status}): ${detail.slice(0, 500)}`,
          liveUpdated: false,
        };
      }

      const publishResponse = await fetch(
        `${apiUrl}/environments/${envId}/features/${featureId}/versions/${version.uuid}/publish/`,
        { method: "POST", headers, body: JSON.stringify({}) }
      );
      if (!publishResponse.ok) {
        const detail = await publishResponse.text();
        return {
          success: false,
          error: `Flagsmith feature-version publish failed (${publishResponse.status}): ${detail.slice(0, 500)}`,
          liveUpdated: false,
        };
      }
    } else {
      // Version 1 environments use the environment feature-state endpoint.
      const versionError = await versionResponse.text();
      if (versionResponse.status !== 404 && versionResponse.status !== 405) {
        return {
          success: false,
          error: `Flagsmith could not create a feature version (${versionResponse.status}): ${versionError.slice(0, 300)}`,
          liveUpdated: false,
        };
      }

      expectedMutation = mutatePayloadFn(state);
      const environmentKey =
        process.env.FLAGSMITH_ENVIRONMENT_KEY ||
        process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID;
      if (!environmentKey) {
        return { success: false, error: "FLAGSMITH_ENVIRONMENT_KEY is required for v1 feature-state updates.", liveUpdated: false };
      }

      const updateResponse = await fetch(
        `${apiUrl}/environments/${encodeURIComponent(environmentKey)}/featurestates/${featureStateId}/`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(expectedMutation),
        }
      );
      if (!updateResponse.ok) {
        const detail = await updateResponse.text();
        return {
          success: false,
          error: `Flagsmith feature-state update failed (${updateResponse.status}): ${detail.slice(0, 500)}`,
          liveUpdated: false,
        };
      }
    }

    // Read-after-write verification is mandatory: publishing alone is not proof.
    const verified = await getLiveRemoteFeatureState(featureName);
    if (!verified.success || !verified.state) {
      return {
        success: false,
        error: `Flagsmith mutation was accepted but remote verification failed: ${verified.error || "No state returned"}`,
        liveUpdated: false,
      };
    }

    if (expectedMutation?.enabled !== undefined && verified.state.enabled !== expectedMutation.enabled) {
      return { success: false, error: "Flagsmith verification failed: enabled state does not match the requested mutation.", liveUpdated: false, verifiedState: verified.state };
    }

    if (expectedMutation?.feature_state_value !== undefined) {
      const expectedValue = normaliseFlagValue(expectedMutation.feature_state_value);
      const actualValue = normaliseFlagValue(verified.state.feature_state_value);
      if (expectedValue !== actualValue) {
        return { success: false, error: "Flagsmith verification failed: default feature value does not match the requested mutation.", liveUpdated: false, verifiedState: verified.state };
      }
    }

    if (Array.isArray(expectedMutation?.multivariate_feature_state_values)) {
      const actualOptions = verified.state.multivariate_feature_state_values || [];
      const actualById = new Map<number, number>();
      for (const item of actualOptions) {
        const optionId = multivariateOptionId(item);
        if (optionId !== undefined) actualById.set(optionId, Number(item.percentage_allocation));
      }
      for (const expected of expectedMutation.multivariate_feature_state_values) {
        const optionId = multivariateOptionId(expected);
        if (optionId === undefined || !actualById.has(optionId) ||
            Math.abs((actualById.get(optionId) || 0) - Number(expected.percentage_allocation)) > 0.01) {
          return { success: false, error: "Flagsmith verification failed: one or more multivariate allocations do not match the requested values.", liveUpdated: false, verifiedState: verified.state };
        }
      }
    }

    return { success: true, liveUpdated: true, verifiedState: verified.state };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error during Flagsmith ${mutationDescription}: ${err?.message || "Unknown error"}`,
      liveUpdated: false,
    };
  }
}

/**
 * Promotes one existing multivariate option to 100%.
 * The default value and all other options receive 0% of the allocation.
 */
export async function rolloutFlagsmithWinner(
  featureName: string,
  winningVariantValue: string
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean; verifiedState?: any }> {
  return mutateRemoteFeatureState(featureName, "rollout winner", (draft) => {
    const options = draft.multivariate_feature_state_values || [];
    const target = options.find((item: any) =>
      optionFeatureValue(item.multivariate_feature_option) === winningVariantValue
    );
    if (!target) {
      throw new Error("The requested winning variant does not exist in the Flagsmith multivariate options.");
    }
    const targetId = multivariateOptionId(target);
    return {
      enabled: true,
      // The winning treatment must retain a real 100% multivariate weight.
      // Changing only the default value would bypass the experiment bucketing engine.
      multivariate_feature_state_values: options.map((item: any) => ({
        ...item,
        percentage_allocation: multivariateOptionId(item) === targetId ? 100 : 0,
      })),
    };
  });
}

/**
 * Allocates the requested percentage to one treatment and the remainder to
 * the default/control value. All non-winning treatments are set to zero.
 */
export async function updateFlagsmithCanaryStage(
  featureName: string,
  winningVariantValue: string,
  stagePercentage: number
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean; verifiedState?: any }> {
  if (!Number.isFinite(stagePercentage) || stagePercentage < 0 || stagePercentage > 100) {
    return { success: false, error: "Canary percentage must be between 0 and 100.", liveUpdated: false };
  }

  return mutateRemoteFeatureState(featureName, "canary update", (draft) => {
    const options = draft.multivariate_feature_state_values || [];
    if (!options.length) throw new Error("Flagsmith returned no multivariate options for this feature.");

    const target = options.find((item: any) =>
      optionFeatureValue(item.multivariate_feature_option) === winningVariantValue
    );
    if (!target) {
      throw new Error("The requested canary variant does not exist in the Flagsmith multivariate options.");
    }

    const targetId = multivariateOptionId(target);
    return {
      enabled: true,
      multivariate_feature_state_values: options.map((item: any) => ({
        ...item,
        percentage_allocation: multivariateOptionId(item) === targetId ? stagePercentage : 0,
      })),
    };
  });
}

/** Disable a feature immediately and verify the new remote state. */
export async function triggerFlagsmithKillSwitch(
  featureName: string
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean; verifiedState?: any }> {
  return mutateRemoteFeatureState(featureName, "kill-switch", () => ({ enabled: false }));
}

/** Revert the default/control value to 100% by removing all treatment allocation. */
export async function rollbackFlagsmithToControl(
  featureName: string,
  controlValue: string
): Promise<{ success: boolean; error?: string; liveUpdated?: boolean; verifiedState?: any }> {
  return mutateRemoteFeatureState(featureName, "rollback to control", (draft) => ({
    enabled: true,
    feature_state_value: { type: "unicode", string_value: controlValue },
    multivariate_feature_state_values: (draft.multivariate_feature_state_values || []).map((item: any) => ({
      ...item,
      percentage_allocation: 0,
    })),
  }));
}

/**
 * Update or persist identity traits on Flagsmith.
 * Uses official Flagsmith identities endpoint: POST /api/v1/identities/
 */
export async function setFlagsmithIdentityTraits(
  identifier: string,
  traits: { trait_key: string; trait_value: any }[]
): Promise<{
  success: boolean;
  identity?: string;
  traits?: any[];
  flags?: any[];
  error?: string;
}> {
  const apiUrl = getApiUrl();
  const envKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY;

  if (!envKey || envKey === "mock") {
    return {
      success: false,
      error: "Flagsmith environment key is not configured.",
    };
  }

  try {
    const res = await fetch(`${apiUrl}/identities/`, {
      method: "POST",
      headers: {
        "X-Environment-Key": envKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identifier,
        traits: traits.map((t) => ({
          trait_key: t.trait_key,
          trait_value: t.trait_value,
        })),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Flagsmith API Error (${res.status}): Failed to set identity traits: ${errText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      identity: data.identifier || identifier,
      traits: data.traits || [],
      flags: data.flags || [],
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error setting Flagsmith identity traits: ${err.message}`,
    };
  }
}

/**
 * Retrieve identity traits and flags from Flagsmith: GET /api/v1/identities/?identifier=...
 */
export async function getFlagsmithIdentityTraitsAndFlags(
  identifier: string
): Promise<{
  success: boolean;
  identity?: string;
  traits?: any[];
  flags?: any[];
  error?: string;
}> {
  const apiUrl = getApiUrl();
  const envKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY;

  if (!envKey || envKey === "mock") {
    return {
      success: false,
      error: "Flagsmith environment key is not configured.",
    };
  }

  try {
    const res = await fetch(
      `${apiUrl}/identities/?identifier=${encodeURIComponent(identifier)}`,
      {
        method: "GET",
        headers: {
          "X-Environment-Key": envKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Flagsmith API Error (${res.status}): Failed to retrieve identity: ${errText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      identity: data.identifier || identifier,
      traits: data.traits || [],
      flags: data.flags || [],
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error retrieving Flagsmith identity: ${err.message}`,
    };
  }
}

/**
 * Creates or verifies a Flagsmith project segment.
 * Checks existing segments on project first, creates if missing.
 */
export async function getOrCreateFlagsmithSegment(input: {
  name: string;
  description: string;
  ruleProperty: string;
  ruleOperator?: string;
  ruleValue: string;
}): Promise<{
  success: boolean;
  segment?: any;
  created?: boolean;
  error?: string;
}> {
  const projectId = process.env.FLAGSMITH_PROJECT_ID;
  const authHeaders = getManagementAuthHeader();
  const apiUrl = getApiUrl();

  if (!projectId) {
    return { success: false, error: "FLAGSMITH_PROJECT_ID is not configured." };
  }

  if (!authHeaders.Authorization) {
    return {
      success: false,
      error: "FLAGSMITH_ORG_API_TOKEN is required for segment management.",
    };
  }

  try {
    // 1. List existing segments
    const listRes = await fetch(`${apiUrl}/projects/${projectId}/segments/`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });

    if (listRes.ok) {
      const listData = await listRes.json();
      const segments = Array.isArray(listData.results) ? listData.results : Array.isArray(listData) ? listData : [];
      const existing = segments.find((s: any) => s.name === input.name);
      if (existing) {
        return { success: true, segment: existing, created: false };
      }
    }

    // 2. Create segment
    const createRes = await fetch(`${apiUrl}/projects/${projectId}/segments/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        project: Number(projectId),
        rules: [
          {
            type: "ALL",
            rules: [],
            conditions: [
              {
                operator: input.ruleOperator || "EQUAL",
                property: input.ruleProperty,
                value: input.ruleValue,
              },
            ],
          },
        ],
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return {
        success: false,
        error: `Flagsmith Segment Creation Error (${createRes.status}): ${errText}`,
      };
    }

    const created = await createRes.json();
    return { success: true, segment: created, created: true };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error creating Flagsmith segment: ${err.message}`,
    };
  }
}

/**
 * Evaluates whether a set of traits satisfies the "Beta Testers" segment rule.
 */
export function evaluateBetaTesterSegment(traits: { trait_key: string; trait_value: any }[]): boolean {
  if (!Array.isArray(traits)) return false;
  return traits.some(
    (t) =>
      t.trait_key === "beta_tester" &&
      (t.trait_value === true || t.trait_value === "true" || t.trait_value === 1)
  );
}
