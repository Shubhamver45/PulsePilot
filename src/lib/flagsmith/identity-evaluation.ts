/**
 * Identity evaluation helpers based on the Flagsmith SDK identities response.
 *
 * The official Flagsmith SDK serializer exposes the assigned multivariate key
 * as `variant`. This is the authoritative value for experiment attribution;
 * `feature_state_value` / `value` is the remote-config payload, not a
 * variant identifier.
 */

export interface FlagsmithIdentityAssignment {
  success: boolean;
  error?: string;
  status?: number;
  flag?: string;
  identity?: string;
  enabled?: boolean;
  variantKey?: string | null;
  value?: unknown;
  parsedValue?: unknown;
  traits?: Array<{ trait_key: string; trait_value: unknown }>;
  featureType?: string | null;
}

/**
 * Reads the official Flagsmith SDK identity response and resolves its assigned
 * variant key. Never derive the key from a JSON remote-config value.
 */
export function resolveFlagsmithVariantKey(flag: any): string | null {
  const officialVariant = flag?.variant;
  if (typeof officialVariant === "string" && officialVariant.trim()) {
    return officialVariant.trim();
  }

  // Compatibility fallback for response proxies that expose the keyed option
  // directly but omit the SDK's `variant` convenience field.
  const option =
    flag?.multivariate_feature_option ??
    flag?.multivariate_feature_state_value?.multivariate_feature_option ??
    flag?.multivariate_feature_option_value ??
    null;
  if (typeof option?.key === "string" && option.key.trim()) {
    return option.key.trim();
  }

  // Some integrations put a stable key in a structured config, but a raw
  // string / JSON payload is never treated as the Flagsmith variant key.
  const rawValue = flag?.feature_state_value ?? flag?.value;
  if (rawValue && typeof rawValue === "object" &&
      typeof rawValue.variantKey === "string" && rawValue.variantKey.trim()) {
    return rawValue.variantKey.trim();
  }

  if (flag?.feature?.type === "MULTIVARIATE") return null;
  return "control";
}

function parseRemoteValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

const getApiUrl = () =>
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");

/**
 * Fetch a fresh Flagsmith assignment for a stable identity. Used by both the
 * evaluation endpoint and the telemetry ingestion endpoint so the server—not
 * a browser-supplied variant name—decides which experiment arm was assigned.
 */
export async function getFlagsmithIdentityAssignment(
  identity: string,
  featureName: string
): Promise<FlagsmithIdentityAssignment> {
  const environmentKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY;

  if (!environmentKey || environmentKey === "mock") {
    return {
      success: false,
      error: "A live Flagsmith environment key is required for identity evaluation.",
      status: 503,
    };
  }

  try {
    const response = await fetch(
      `${getApiUrl()}/identities/?identifier=${encodeURIComponent(identity)}`,
      {
        method: "GET",
        headers: {
          "X-Environment-Key": environmentKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Flagsmith identity evaluation failed with HTTP ${response.status}.`,
        status: 502,
      };
    }

    const payload = await response.json();
    const flags = Array.isArray(payload?.flags) ? payload.flags : [];
    const matched = flags.find((item: any) =>
      item?.feature?.name === featureName || item?.name === featureName
    );

    if (!matched) {
      return {
        success: false,
        error: `Feature '${featureName}' was not returned for identity '${identity}' by Flagsmith.`,
        status: 404,
      };
    }

    const variantKey = resolveFlagsmithVariantKey(matched);
    const featureType = matched?.feature?.type ?? null;

    if (featureType === "MULTIVARIATE" && !variantKey) {
      return {
        success: false,
        error: "Flagsmith returned a multivariate feature without its assigned variant key. Exposure attribution is blocked.",
        status: 502,
      };
    }

    const value = matched.feature_state_value ?? matched.value ?? null;
    return {
      success: true,
      flag: featureName,
      identity,
      enabled: Boolean(matched.enabled),
      variantKey,
      value,
      parsedValue: parseRemoteValue(value),
      traits: Array.isArray(payload?.traits) ? payload.traits : [],
      featureType,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Flagsmith identity evaluation failed: ${error?.message || "Unknown network error"}`,
      status: 502,
    };
  }
}
