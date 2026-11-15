/**
 * Flagsmith Production Isolation Guards
 * PulsePilot AI — Production Safety & Zero Silent Mock Fallbacks
 */

export interface ProductionGuardResult {
  allowed: boolean;
  statusCode?: number;
  error?: string;
  code?: string;
}

/**
 * Ensures production never evaluates feature flags without a valid environment key.
 */
export function checkProductionEvaluationGuard(
  envKey: string | undefined,
  nodeEnv: string = process.env.NODE_ENV || "development"
): ProductionGuardResult {
  if (nodeEnv === "production" && (!envKey || envKey === "mock" || envKey.trim() === "")) {
    return {
      allowed: false,
      statusCode: 503,
      error: "Missing production Flagsmith credentials: Environment API key is not configured.",
      code: "FLAGSMITH_NOT_CONFIGURED",
    };
  }
  return { allowed: true };
}

/**
 * Ensures production never performs a flag mutation or rollout without valid management credentials.
 */
export function checkProductionRolloutGuard(
  isRemoteConfigured: boolean,
  nodeEnv: string = process.env.NODE_ENV || "development"
): ProductionGuardResult {
  if (nodeEnv === "production" && !isRemoteConfigured) {
    return {
      allowed: false,
      statusCode: 503,
      error: "Production rollout requires valid Flagsmith management credentials. Organization API token is not configured.",
      code: "FLAGSMITH_NOT_CONFIGURED",
    };
  }
  return { allowed: true };
}

/**
 * Ensures production halts with 502 if the remote Flagsmith edge fetch fails,
 * preventing silent fallback to local mock state in production.
 */
export function checkProductionRemoteFetchGuard(
  fetchError: Error,
  nodeEnv: string = process.env.NODE_ENV || "development"
): ProductionGuardResult {
  if (nodeEnv === "production") {
    return {
      allowed: false,
      statusCode: 502,
      error: `Flagsmith remote edge evaluation failed: ${fetchError.message}`,
      code: "FLAGSMITH_EDGE_FETCH_FAILED",
    };
  }
  return { allowed: true };
}
