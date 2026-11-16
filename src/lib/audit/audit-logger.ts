import crypto from "crypto";

/**
 * Centralized Audit Logging Service
 * PulsePilot AI — Cryptographic & Operational Audit Trails
 * Append-Only SHA-256 Hash Chained Records with Tamper-Evidence
 */

export interface AuditRecord {
  id: string;
  timestamp: string;
  signature?: string;
  previousSignature?: string;
  action:
    | "EXPERIMENT_CREATED"
    | "EXPERIMENT_APPROVED"
    | "FLAG_ACTIVATED"
    | "TRAFFIC_SPLIT_UPDATED"
    | "GRADUAL_STAGE_UPDATED"
    | "GRADUAL_STAGE_FAILED"
    | "ROLLOUT_RECOMMENDED"
    | "ROLLOUT_APPROVED_EXECUTED"
    | "ROLLOUT_FAILED"
    | "ROLLBACK_EXECUTED"
    | "ROLLBACK_FAILED"
    | "KILL_SWITCH_TRIGGERED"
    | "KILL_SWITCH_FAILED"
    | "OPERATION_FAILED"
    | "CONVERSION_RECORDED"
    | "ANALYSIS_GENERATED"
    | "IDENTITY_TRAITS_UPDATED"
    | "SEGMENT_CREATED"
    | "SEGMENT_TARGETING_EVALUATED";
  actor: {
    name: string;
    type: "human" | "agent" | "system";
  };
  entityType:
    | "EXPERIMENT"
    | "FLAGSMITH_FLAG"
    | "TELEMETRY"
    | "FLAGSMITH_SEGMENT"
    | "FLAGSMITH_IDENTITY";
  entityId: string;
  details: string;
  previousState?: any;
  newState?: any;
  metadata?: Record<string, any>;
}

export const GENESIS_SIGNATURE = "0000000000000000000000000000000000000000000000000000000000000000";

export function computeRecordSignature(
  prevSig: string,
  record: {
    id: string;
    timestamp: string;
    action: string;
    actor: { name: string; type: string };
    entityId: string;
    details: string;
    metadata?: any;
  }
): string {
  const payload = [
    prevSig,
    record.id,
    record.timestamp,
    record.action,
    `${record.actor.type}:${record.actor.name}`,
    record.entityId,
    record.details,
    JSON.stringify(record.metadata || {}),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// Persistent in-memory store across Next.js dev reloads
const globalAuditStore = globalThis as unknown as {
  auditLogsStore?: AuditRecord[];
};

if (!globalAuditStore.auditLogsStore) {
  // Initialize with genesis seeds, chained in chronological order
  const rawSeedLogs: Array<Omit<AuditRecord, "signature" | "previousSignature">> = [
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
      id: "audit-1",
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      action: "ROLLOUT_RECOMMENDED",
      actor: { name: "Rollout Strategist", type: "agent" },
      entityType: "EXPERIMENT",
      entityId: "exp_checkout_social_proof",
      details: "Detected 97.4% Bayesian win probability; recommended 100% rollout of Variant B.",
      metadata: { confidence: 0.974, uplift: 18.4, pValue: 0.026 },
    },
  ];

  let prev = GENESIS_SIGNATURE;
  const chainedSeeds: AuditRecord[] = [];
  for (const raw of rawSeedLogs) {
    const sig = computeRecordSignature(prev, raw);
    chainedSeeds.push({
      ...raw,
      previousSignature: prev,
      signature: sig,
    });
    prev = sig;
  }

  // Store is ordered latest-first (newest at index 0)
  globalAuditStore.auditLogsStore = chainedSeeds.reverse();
}

const auditLogsStore = globalAuditStore.auditLogsStore;

export async function recordAuditLog(
  record: Omit<AuditRecord, "id" | "timestamp" | "signature" | "previousSignature">
): Promise<AuditRecord> {
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = new Date().toISOString();

  // Previous signature is the signature of the currently newest record, or GENESIS if empty
  const previousSignature = auditLogsStore.length > 0 && auditLogsStore[0].signature
    ? auditLogsStore[0].signature
    : GENESIS_SIGNATURE;

  const baseRecord = {
    ...record,
    id,
    timestamp,
  };

  const signature = computeRecordSignature(previousSignature, baseRecord);

  const newRecord: AuditRecord = {
    ...baseRecord,
    previousSignature,
    signature,
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

export interface AuditIntegrityReport {
  valid: boolean;
  verifiedCount: number;
  genesisSignature: string;
  headSignature: string | null;
  brokenAtId?: string;
  error?: string;
}

/**
 * Validates the cryptographic integrity of the audit log chain.
 * Verifies that:
 * 1. Each record's SHA-256 signature matches its re-hashed payload.
 * 2. Hash chaining links from newest (head) down to genesis are intact.
 */
export function verifyAuditLogIntegrity(records?: AuditRecord[]): AuditIntegrityReport {
  const logs = records || auditLogsStore;

  if (logs.length === 0) {
    return {
      valid: true,
      verifiedCount: 0,
      genesisSignature: GENESIS_SIGNATURE,
      headSignature: null,
    };
  }

  // logs are latest-first (index 0 is newest, index length-1 is oldest)
  // Verify each record's signature matches its contents
  for (let i = 0; i < logs.length; i++) {
    const record = logs[i];
    const prevSig = record.previousSignature || GENESIS_SIGNATURE;
    const expectedSig = computeRecordSignature(prevSig, record);

    if (record.signature !== expectedSig) {
      return {
        valid: false,
        verifiedCount: i,
        genesisSignature: GENESIS_SIGNATURE,
        headSignature: logs[0].signature || null,
        brokenAtId: record.id,
        error: `Signature mismatch at record ${record.id}. Expected ${expectedSig}, got ${record.signature}`,
      };
    }

    // Verify chain linkage: record[i].previousSignature must match record[i+1].signature (if i+1 exists)
    if (i < logs.length - 1) {
      const nextOlderRecord = logs[i + 1];
      if (record.previousSignature !== nextOlderRecord.signature) {
        return {
          valid: false,
          verifiedCount: i,
          genesisSignature: GENESIS_SIGNATURE,
          headSignature: logs[0].signature || null,
          brokenAtId: record.id,
          error: `Hash chain broken between record ${record.id} and ${nextOlderRecord.id}`,
        };
      }
    } else {
      // The oldest record must link back to GENESIS_SIGNATURE
      if (record.previousSignature !== GENESIS_SIGNATURE) {
        return {
          valid: false,
          verifiedCount: i,
          genesisSignature: GENESIS_SIGNATURE,
          headSignature: logs[0].signature || null,
          brokenAtId: record.id,
          error: `Oldest record ${record.id} does not link to GENESIS_SIGNATURE`,
        };
      }
    }
  }

  return {
    valid: true,
    verifiedCount: logs.length,
    genesisSignature: GENESIS_SIGNATURE,
    headSignature: logs[0].signature || null,
  };
}
