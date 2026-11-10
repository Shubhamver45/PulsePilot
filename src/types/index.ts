/**
 * PulsePilot AI — Core Domain Types
 */

export type UserRole = "ADMIN" | "EDITOR" | "VIEWER";

export type ExperimentStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "RUNNING"
  | "PAUSED"
  | "CONCLUDED_ROLLED_OUT"
  | "CONCLUDED_ROLLED_BACK";

export type MetricType =
  | "CONVERSION_RATE"
  | "CLICK_THROUGH"
  | "REVENUE"
  | "RETENTION"
  | "CUSTOM";

export type MetricDirection = "INCREASE" | "DECREASE";

export type AgentRole =
  | "STRATEGY_AGENT"
  | "EXPERIMENT_BUILDER_AGENT"
  | "ANALYTICS_AGENT"
  | "RELEASE_GUARDIAN_AGENT"
  | "GROWTH_ADVISOR_AGENT";

export interface VariantAllocation {
  key: string;
  name: string;
  description?: string;
  isControl: boolean;
  trafficAllocation: number;
  featureValue: Record<string, any>;
}

export interface MetricDefinition {
  key: string;
  name: string;
  type: MetricType;
  direction: MetricDirection;
  description?: string;
}

export interface StatisticalResult {
  variantKey: string;
  variantName: string;
  isControl: boolean;
  exposures: number;
  conversions: number;
  conversionRate: number;
  relativeLift: number;
  zScore: number;
  pValue: number;
  confidenceInterval: [number, number];
  isSignificant: boolean;
  bayesWinProbability: number;
}

export interface CanaryStageConfig {
  stagePercent: number; // 5, 25, 50, 75, 100
  durationHours: number;
  requireApproval: boolean;
}
