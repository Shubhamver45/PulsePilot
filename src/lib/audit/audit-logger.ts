/**
 * Centralized Audit Logging Service
 * PulsePilot AI — Cryptographic & Operational Audit Trails
 */

export interface AuditRecord {
  id: string;
  timestamp: string;
  action:
    | "EXPERIMENT_CREATED"
    | "EXPERIMENT_APPROVED"
    | "FLAG_ACTIVATED"
    | "TRAFFIC_SPLIT_UPDATED"
    | "ROLLOUT_RECOMMENDED"
    | "ROLLOUT_APPROVED_EXECUTED"
    | "ROLLBACK_EXECUTED"
    | "KILL_SWITCH_TRIGGERED"
    | "CONVERSION_RECORDED";
  actor: {
    name: string;
    type: "human" | "agent" | "system";
  };
  entityType: "EXPERIMENT" | "FLAGSMITH_FLAG" | "TELEMETRY";
  entityId: string;
  details: string;
  previousState?: any;
  newState?: any;
  metadata?: Record<string, any>;
}

// In-memory store for local / demo auditing
const auditLogsStore: AuditRecord[] = [
  {
    id: "audit-1",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    action: "ROLLOUT_RECOMMENDED",
    actor: { name: "Rollout Strategist", type: "agent" },
    entityType: "EXPERIMENT",
    entityId: "exp_checkout_social_proof",
    details: "Detected 97.4% Bayesian win probability; recommended 100% rollout of Variant B.",
    metadata: { confidence: 0.974, uplift: 18.4, pValue: 0.026 },
  },
  {
    id: "audit-2",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    action: "FLAG_ACTIVATED",
    actor: { name: "Sarah Lin", type: "human" },
    entityType: "FLAGSMITH_FLAG",
    entityId: "exp_checkout_social_proof",
    details: "Human authorized multivariate flag deployment to Flagsmith Production environment.",
    metadata: { splits: { control: 50, variant_social_proof: 50 } },
  },
  {
    id: "audit-3",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    action: "EXPERIMENT_CREATED",
    actor: { name: "Hypothesis Architect", type: "agent" },
    entityType: "EXPERIMENT",
    entityId: "exp_pricing_annual_default",
    details: "Synthesized experiment specification from natural language growth intent.",
    metadata: { model: "gemini-2.5-flash", tokens: 580 },
  },
];

export async function recordAuditLog(
  record: Omit<AuditRecord, "id" | "timestamp">
): Promise<AuditRecord> {
  const newRecord: AuditRecord = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...record,
  };

  auditLogsStore.unshift(newRecord);
  if (auditLogsStore.length > 500) {
    auditLogsStore.pop();
  }

  return newRecord;
}

export function getAuditLogs(): AuditRecord[] {
  return [...auditLogsStore];
}

