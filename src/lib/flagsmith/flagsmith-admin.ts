/**
 * Flagsmith Server-Side Management API Client
 * PulsePilot AI â€” Official Flagsmith Remote Actuation Plane
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
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\¶»§q«^