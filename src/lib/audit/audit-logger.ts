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
  sequenceNumber?: number;
  action:
    | "EXPERIMENT_CREATED"
    | "EXPERIMENT_APPROVED"
    | "FLAG_ACTIVATED"
    | "TRAFFIC_SPLIT_UPDATED"
    | "GRADUAL_STAGE_UPDATED"
    | "GRADUAL_STAGE_FAILED"
    | "ROLLOUT_RECOMMENDED"
    | "ROLLOUT_APPROVED"
    | "ROLLOUT_APPROVED_EXECUTED"
    | "ROLLOUT_FAILED"
    | "ROLLBACK_PERFORMED"
    | "ROLLBACK_EXECUTED"
    | "ROLLBACK_FAILED"
    | "KILL_SWITCH_TRIGGERED"
    | "KILL_SWITCH_FAILED"
    | "OPERATION_FAILED"
    | "CONVERSION_RECORDED"
    | "EXPERIMENT_COMPLETED"
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

export function canonicalJsonStringify(val: any): string {
  if (val === null || val === undefined) return "{}";
  if (typeof val !== "object") return JSON.stringify(val);
  if (Array.isArray(val)) {
    return "[" + val.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(val).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify(val[k]))
      .join(",") +
    "}"
  );
}

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
    canonicalJsonStringify(record.metadata || {}),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// Persistent in-memory store across Next.js dev reloads
const globalAuditStore = globalThis as unknown as {
  auditLogsStore?: AuditRecord[];
};

if (!globalAuditStore.auditLogsStore) {
  // Initialize with genesis seeds, chained in chronological order
  const rawSeedLogs: Array<Omit<AuditRecord, "signature" | "previousSignature" | "sequenceNumber">> = [
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
  let seq = 1;
  const chainedSeeds: AuditRecord[] = [];
  for (const raw of rawSeedLogs) {
    const sig = computeRecordSignature(prev, raw);
    chainedSeeds.push({
      ...raw,
      previousSignature: prev,
      signature: sig,
      sequenceNumber: seq++,
    });
    prev = sig;
  }

  // Store is ordered latest-first (newest at index 0)
  globalAuditStore.auditLogsStore = chainedSeeds.reverse();
}

const auditLogsStore = globalAuditStore.auditLogsStore;

export const AUDIT_ADVISORY_LOCK_ID = 8847291048591823;

async function getPrisma() {
  try {
    const { prisma } = await import("../db/prisma.ts");
    return prisma;
  } catch {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma;
  }
}

// Local in-process mutex queue to prevent local connection-pool exhaustion
let inProcessQueue: Promise<any> = Promise.resolve();

export async function recordAuditLog(
  record: Omit<AuditRecord, "id" | "timestamp" | "signature" | "previousSignature" | "sequenceNumber">
): Promise<AuditRecord> {
  const isDbConfigured = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock");

  if (!isDbConfigured) {
    // In-memory / offline mock path
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();
    const previousSignature =
      auditLogsStore.length > 0 && auditLogsStore[0].signature
        ? auditLogsStore[0].signature
        : GENESIS_SIGNATURE;
    const sequenceNumber = (auditLogsStore[0]?.sequenceNumber || auditLogsStore.length) + 1;

    const baseRecord = { ...record, id, timestamp };
    const signature = computeRecordSignature(previousSignature, baseRecord);
    const newRecord: AuditRecord = {
      ...baseRecord,
      previousSignature,
      signature,
      sequenceNumber,
    };
    auditLogsStore.unshift(newRecord);
    if (auditLogsStore.length > 500) auditLogsStore.pop();
    return newRecord;
  }

  // Queue locally per process, and synchronize across all serverless processes via PostgreSQL advisory lock
  return new Promise((resolve, reject) => {
    inProcessQueue = inProcessQueue.then(async () => {
      const MAX_RETRIES = 5;
      let lastError: any = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const prisma = await getPrisma();

          const persistedRecord = await prisma.$transaction(
            async (tx) => {
              // 1. Acquire transaction-scoped PostgreSQL advisory lock (distributed cross-instance mutex)
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_ADVISORY_LOCK_ID})`;

              // 2. Read the latest sequence number and previous signature ONLY after lock is held
              const lastDbLog = await tx.auditLog.findFirst({
                orderBy: { sequenceNumber: "desc" },
              });

              const previousSignature = lastDbLog?.signature || GENESIS_SIGNATURE;
              const sequenceNumber = (lastDbLog?.sequenceNumber || 0) + 1;

              const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const timestamp = new Date().toISOString();

              const baseRecord = {
                ...record,
                id,
                timestamp,
              };

              const signature = computeRecordSignature(previousSignature, baseRecord);

              const auditRecord: AuditRecord = {
                ...baseRecord,
                previousSignature,
                signature,
                sequenceNumber,
              };

              const org = await tx.organization.findFirst();
              if (!org) {
                throw new Error("Cannot persist audit log: No organization found in database.");
              }

              // 3. Insert record within the same transaction
              await tx.auditLog.create({
                data: {
                  id: auditRecord.id,
                  organizationId: org.id,
                  action: auditRecord.action as any,
                  entityType: auditRecord.entityType,
                  entityId: auditRecord.entityId,
                  actorName: auditRecord.actor.name,
                  actorType: auditRecord.actor.type,
                  details: auditRecord.details,
                  signature: auditRecord.signature,
                  previousSignature: auditRecord.previousSignature,
                  sequenceNumber: auditRecord.sequenceNumber,
                  previousState: auditRecord.previousState || undefined,
                  newState: auditRecord.newState || undefined,
                  metadata: auditRecord.metadata || undefined,
                  createdAt: new Date(auditRecord.timestamp),
                },
              });

              return auditRecord;
            },
            {
              maxWait: 20000,
              timeout: 20000,
            }
          );

          // 4. Synchronize in-memory cache upon verified transaction commit
          auditLogsStore.unshift(persistedRecord);
          if (auditLogsStore.length > 500) {
            auditLogsStore.pop();
          }

          resolve(persistedRecord);
          return;
        } catch (err: any) {
          lastError = err;
          const isRetryable =
            err.code === "P2002" || // Unique constraint violation (sequenceNumber/signature)
            err.code === "P2034" || // Transaction conflict
            err.code === "P2028" || // Transaction API error
            err.message?.includes("Unable to start a transaction") ||
            err.message?.includes("could not serialize access") ||
            err.message?.includes("deadlock detected") ||
            err.message?.includes("canceling statement due to lock timeout");

          if (isRetryable && attempt < MAX_RETRIES) {
            // Jittered backoff: 30ms * attempt + random [0..40ms]
            await new Promise((r) => setTimeout(r, 30 * attempt + Math.floor(Math.random() * 40)));
            continue;
          }

          break;
        }
      }

      // Never return false success! Explicitly throw failure!
      reject(
        new Error(
          `CRITICAL AUDIT PERSISTENCE FAILURE: Failed to persist audit record for [${record.action}] after ${MAX_RETRIES} attempts. Reason: ${lastError?.message || lastError}`
        )
      );
    });
  });
}

/**
 * Returns latest audit logs synchronously from memory.
 */
export function getAuditLogs(): AuditRecord[] {
  return [...auditLogsStore];
}

/**
 * Returns latest audit logs from PostgreSQL if configured, falling back to memory.
 */
export async function getPersistedAuditLogs(): Promise<AuditRecord[]> {
  const isDbConfigured = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock");

  if (isDbConfigured) {
    try {
      const prisma = await getPrisma();
      const dbLogs = await prisma.auditLog.findMany({
        orderBy: [{ sequenceNumber: "desc" }, { createdAt: "desc" }],
      });

      if (dbLogs && dbLogs.length > 0) {
        return dbLogs.map((log) => ({
          id: log.id,
          timestamp: log.createdAt.toISOString(),
          action: log.action as any,
          actor: {
            name: log.actorName || "system",
            type: (log.actorType as any) || "system",
          },
          entityType: log.entityType as any,
          entityId: log.entityId,
          details: log.details || "",
          signature: log.signature || undefined,
          previousSignature: log.previousSignature || undefined,
          sequenceNumber: log.sequenceNumber || undefined,
          previousState: log.previousState,
          newState: log.newState,
          metadata: log.metadata as Record<string, any> | undefined,
        }));
      }
    } catch (err: any) {
      console.warn("[getPersistedAuditLogs Warning]:", err?.message);
    }
  }

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
      // The oldest record: if it's the genesis block, it must link to GENESIS_SIGNATURE
      if (record.previousSignature && record.previousSignature !== GENESIS_SIGNATURE && logs.length === 1) {
        // Single isolated non-genesis record check
      } else if (record.previousSignature !== GENESIS_SIGNATURE && (record.sequenceNumber === 1 || !record.sequenceNumber)) {
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

/**
 * Validates the cryptographic integrity of records stored in PostgreSQL.
 */
export async function verifyPersistedAuditLogIntegrity(): Promise<AuditIntegrityReport> {
  const persistedLogs = await getPersistedAuditLogs();
  return verifyAuditLogIntegrity(persistedLogs);
}
