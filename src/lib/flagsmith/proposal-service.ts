/**
 * PulsePilot AI — AI Experiment Proposal & Cryptographic Approval Service
 * Flagsmith-First Autonomous Governance Engine
 *
 * Implements strict Human-in-the-Loop (HITL) proposal and execution handshake:
 * 1. Agent generates structured experiment proposal
 * 2. Remote Flagsmith inspection & duplicate detection against live environment
 * 3. Exact traffic allocation validation (strictly 100%)
 * 4. Application code instrumentation plan & diff generation
 * 5. Cryptographic SHA-256 configuration hashing (anti-tamper)
 * 6. Authenticated human sign-off bound to proposal ID & hash
 * 7. Stale approval expiration (15-min TTL) & replay prevention
 * 8. Verified read-after-write execution against Flagsmith REST API
 */

import crypto from "crypto";
import type { ExperimentStrategy } from "@/lib/ai/schemas";
import {
  createFlagsmithMultivariateFeature,
  getLiveRemoteFeatureState,
} from "./flagsmith-admin";
import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import type { AuthUser } from "@/lib/auth/auth-service";

export interface ExperimentProposal {
  proposalId: string;
  configurationHash: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "EXECUTING" | "EXECUTED" | "REJECTED" | "EXPIRED";
  targetEnvironment: string;
  strategy: ExperimentStrategy;
  duplicateCheck: {
    existsInFlagsmith: boolean;
    existingFeatureId?: number;
    existsInDatabase: boolean;
    warning?: string;
  };
  validation: {
    totalTrafficAllocation: number;
    isValid: boolean;
    errors: string[];
  };
  instrumentationPlan: {
    isTemplate: boolean;
    templateNotice: string;
    targetFiles: string[];
    requiredSdk: string;
    flagEvaluationCode: string;
    exposureTrackingCode: string;
    conversionTrackingCode: string;
    proposedDiff: string;
  };
  proposedBy: string;
  proposedAt: string;
  expiresAt: string;
  executedAt?: string;
  executedBy?: string;
  executionResult?: any;
}

// Durable in-memory fallback registry for offline unit testing & local mock mode
const proposalRegistry = new Map<string, ExperimentProposal>();

/**
 * Computes an immutable SHA-256 configuration hash over the proposal payload.
 * Any modification to the strategy, flag name, or traffic allocations after proposal
 * changes the hash and immediately invalidates any prior approval.
 */
export function computeConfigurationHash(strategy: ExperimentStrategy): string {
  const canonical = {
    featureName: strategy.flagsmith_feature_name,
    control: {
      key: strategy.control_variant.key,
      allocation: strategy.control_variant.trafficAllocation,
      value: strategy.control_variant.featureValue,
    },
    treatments: strategy.treatment_variants.map((v) => ({
      key: v.key,
      allocation: v.trafficAllocation,
      value: v.featureValue,
    })),
    primaryMetric: strategy.primary_metric.key,
    guardrails: strategy.guardrail_metrics?.map((m) => m.key).sort() || [],
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

/**
 * Generates an application code instrumentation reference template.
 * Clearly labeled as an integration template for developer guidance,
 * avoiding any false claim of automated workspace repository mutation.
 */
export function generateInstrumentationPlan(strategy: ExperimentStrategy): {
  isTemplate: boolean;
  templateNotice: string;
  targetFiles: string[];
  requiredSdk: string;
  flagEvaluationCode: string;
  exposureTrackingCode: string;
  conversionTrackingCode: string;
  proposedDiff: string;
} {
  const flagName = strategy.flagsmith_feature_name;
  const primaryMetric = strategy.primary_metric.key;

  const flagEvaluationCode = `// 1. Evaluate Feature Flag on Flagsmith Edge
const flagState = flagsmith.getValue("${flagName}");
const currentVariant = flagState?.layout || "control";`;

  const exposureTrackingCode = `// 2. Track Identity Exposure (Attributed to evaluated variant)
await fetch("/api/telemetry/track", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    experimentFlag: "${flagName}",
    distinctUserId: user.id,
    eventType: "EXPOSURE",
    variantKey: currentVariant,
  }),
});`;

  const conversionTrackingCode = `// 3. Track Primary Conversion Metric (${primaryMetric})
await fetch("/api/telemetry/track", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    experimentFlag: "${flagName}",
    distinctUserId: user.id,
    eventType: "CONVERSION",
    metricKey: "${primaryMetric}",
    variantKey: currentVariant,
    properties: { orderValue: cart.total, orderId: order.id },
  }),
});`;

  const proposedDiff = `--- a/src/components/CheckoutContainer.tsx.example
+++ b/src/components/CheckoutContainer.tsx.example
@@ -14,6 +14,16 @@
+  // PulsePilot Flagsmith Reference Integration Template: ${flagName}
+  // NOTE: This is an example integration template for developer guidance.
+  // Adapt component names, prop types, and paths to match your codebase.
+  const variantConfig = flagsmith.getValue("${flagName}");
+  
+  // Record First-Touch Exposure Event
+  useEffect(() => {
+    recordExposure("${flagName}", user.id, variantConfig?.layout || "control");
+  }, [variantConfig, user.id]);
+
   return (
-    <MultiStepCheckoutForm cart={cart} user={user} />
+    variantConfig?.layout === "single_page" ? (
+      <SinglePageCheckoutForm cart={cart} user={user} onComplete={() => recordConversion("${primaryMetric}")} />
+    ) : (
+      <MultiStepCheckoutForm cart={cart} user={user} onComplete={() => recordConversion("${primaryMetric}")} />
+    )
   );
 }`;

  return {
    isTemplate: true,
    templateNotice:
      "Reference integration template for developer guidance. This is not an automated in-place repository patch; adapt component names, file paths, and transaction objects to match your application codebase.",
    targetFiles: ["src/components/CheckoutContainer.tsx.example"],
    requiredSdk: "flagsmith (or flagsmith-nodejs)",
    flagEvaluationCode,
    exposureTrackingCode,
    conversionTrackingCode,
    proposedDiff,
  };
}

/**
 * Creates a formal Experiment Proposal awaiting human sign-off.
 * Performs live duplicate checks against Flagsmith and persists proposal to PostgreSQL.
 */
export async function createExperimentProposal(
  strategy: ExperimentStrategy,
  proposingUser: AuthUser,
  targetEnvironment: string = "development"
): Promise<ExperimentProposal> {
  const proposalId = `prop_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const configurationHash = computeConfigurationHash(strategy);

  // 1. Live Duplicate Check Against Remote Flagsmith Environment
  let existsInFlagsmith = false;
  let existingFeatureId: number | undefined;
  let duplicateWarning: string | undefined;

  try {
    const remoteCheck = await getLiveRemoteFeatureState(strategy.flagsmith_feature_name);
    if (remoteCheck.success && remoteCheck.state) {
      existsInFlagsmith = true;
      existingFeatureId = remoteCheck.state.feature?.id || remoteCheck.state.id;
      duplicateWarning = `Feature flag '${strategy.flagsmith_feature_name}' already exists in remote Flagsmith environment (Feature ID: ${existingFeatureId}). Re-using existing flag configuration upon approval.`;
    }
  } catch {
    // Environment unreachable or offline
  }

  // 2. Duplicate Check Against Database
  let existsInDatabase = false;
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      const existingExp = await prisma.experiment.findUnique({
        where: { flagsmithFeatureName: strategy.flagsmith_feature_name },
      });
      if (existingExp) {
        existsInDatabase = true;
        duplicateWarning = `Experiment '${strategy.flagsmith_feature_name}' is already recorded in the database (Status: ${existingExp.status}).`;
      }
    } catch {
      // Database cold or offline
    }
  }

  // 3. Traffic Allocation Validation
  const totalAllocation =
    (strategy.control_variant.trafficAllocation || 0) +
    strategy.treatment_variants.reduce((sum, v) => sum + (v.trafficAllocation || 0), 0);

  if (totalAllocation !== 100) {
    throw new Error(
      `Total traffic allocation must equal exactly 100%, but received ${totalAllocation}%.`
    );
  }

  const errors: string[] = [];
  if (strategy.control_variant.trafficAllocation <= 0) {
    errors.push("Control variant traffic allocation must be greater than 0%.");
  }
  for (const v of strategy.treatment_variants) {
    if (v.trafficAllocation <= 0) {
      errors.push(`Treatment variant '${v.key}' traffic allocation must be greater than 0%.`);
    }
  }

  // 4. Code Instrumentation Plan
  const instrumentationPlan = generateInstrumentationPlan(strategy);

  // 15-Minute Expiration Window
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

  const proposal: ExperimentProposal = {
    proposalId,
    configurationHash,
    status: "PENDING_APPROVAL",
    targetEnvironment,
    strategy,
    duplicateCheck: {
      existsInFlagsmith,
      existingFeatureId,
      existsInDatabase,
      warning: duplicateWarning,
    },
    validation: {
      totalTrafficAllocation: totalAllocation,
      isValid: errors.length === 0,
      errors,
    },
    instrumentationPlan,
    proposedBy: proposingUser.fullName || proposingUser.email,
    proposedAt: now.toISOString(),
    expiresAt,
  };

  // Persist to PostgreSQL if database is configured
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      await prisma.experimentProposal.create({
        data: {
          id: proposalId,
          configurationHash,
          status: "PENDING_APPROVAL",
          targetEnvironment,
          flagsmithFeatureName: strategy.flagsmith_feature_name,
          strategy: strategy as any,
          duplicateCheck: proposal.duplicateCheck as any,
          validation: proposal.validation as any,
          instrumentationPlan: proposal.instrumentationPlan as any,
          proposedBy: proposal.proposedBy,
          proposedAt: now,
          expiresAt: new Date(expiresAt),
        },
      });
    } catch (dbErr: any) {
      console.warn("[Proposal Service] Database proposal insert note:", dbErr.message);
    }
  }

  // Fallback cache for immediate in-memory and test resolution
  proposalRegistry.set(proposalId, proposal);

  return proposal;
}

/**
 * Retrieves a proposal by its unique ID from PostgreSQL with fallback to in-memory store.
 * Automatically checks and updates expired status.
 */
export async function getProposal(proposalId: string): Promise<ExperimentProposal | null> {
  // 1. Try PostgreSQL lookup if available
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      const record = await prisma.experimentProposal.findUnique({
        where: { id: proposalId },
      });
      if (record) {
        let status = record.status as ExperimentProposal["status"];
        if (status === "PENDING_APPROVAL" && new Date() > record.expiresAt) {
          status = "EXPIRED";
          await prisma.experimentProposal.update({
            where: { id: proposalId },
            data: { status: "EXPIRED" },
          }).catch(() => {});
        }
        return {
          proposalId: record.id,
          configurationHash: record.configurationHash,
          status,
          targetEnvironment: record.targetEnvironment,
          strategy: record.strategy as any,
          duplicateCheck: record.duplicateCheck as any,
          validation: record.validation as any,
          instrumentationPlan: record.instrumentationPlan as any,
          proposedBy: record.proposedBy,
          proposedAt: record.proposedAt.toISOString(),
          expiresAt: record.expiresAt.toISOString(),
          executedAt: record.executedAt?.toISOString(),
          executedBy: record.executedBy || undefined,
          executionResult: record.executionResult || undefined,
        };
      }
    } catch (dbErr: any) {
      console.warn("[Proposal Service] Database proposal lookup note:", dbErr.message);
    }
  }

  // 2. In-memory fallback
  const proposal = proposalRegistry.get(proposalId);
  if (!proposal) return null;

  if (proposal.status === "PENDING_APPROVAL" && new Date().toISOString() > proposal.expiresAt) {
    proposal.status = "EXPIRED";
    proposalRegistry.set(proposalId, proposal);
  }

  return proposal;
}

/**
 * Rejects or cancels an active experiment proposal.
 * Persists status: REJECTED to PostgreSQL.
 */
export async function rejectProposal(
  proposalId: string,
  user: AuthUser,
  reason: string = "Rejected by reviewer"
): Promise<{ success: boolean; message: string }> {
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    throw new Error(`Proposal '${proposalId}' not found.`);
  }

  if (proposal.status === "EXECUTED") {
    throw new Error(`Cannot reject proposal '${proposalId}' because it has already been executed.`);
  }

  proposal.status = "REJECTED";
  proposalRegistry.set(proposalId, proposal);

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      await prisma.experimentProposal.update({
        where: { id: proposalId },
        data: { status: "REJECTED" },
      });
    } catch (dbErr: any) {
      console.warn("[Proposal Service] Database proposal rejection note:", dbErr.message);
    }
  }

  try {
    await recordAuditLog({
      action: "EXPERIMENT_ARCHIVED",
      actor: { name: user.fullName || user.email, type: "human" },
      entityType: "EXPERIMENT_PROPOSAL",
      entityId: proposal.strategy.flagsmith_feature_name,
      details: `Experiment proposal '${proposalId}' rejected by ${user.fullName || user.email}: ${reason}`,
      metadata: {
        proposalId,
        configurationHash: proposal.configurationHash,
        reason,
      },
    });
  } catch (auditErr: any) {
    console.warn("[Proposal Service] Audit log persistence note:", auditErr.message);
  }

  return {
    success: true,
    message: `Proposal '${proposalId}' has been rejected.`,
  };
}

/**
 * Approves and executes a proposed experiment against Flagsmith.
 * Strictly verifies authentication, configuration hash integrity, and TTL.
 */
export async function approveAndExecuteProposal(
  proposalId: string,
  submittedHash: string,
  approvingUser: AuthUser,
  options?: {
    confirmedProductionTarget?: boolean;
  }
): Promise<{
  success: boolean;
  proposalId: string;
  flagsmithFeatureId: number;
  flagsmithFeatureName: string;
  status: string;
  verified: boolean;
  remoteCreated: boolean;
  isExisting: boolean;
  executionReport: {
    operationId: string;
    approvedBy: string;
    approvedAt: string;
    targetEnvironment: string;
    configurationHash: string;
    readAfterWriteStatus: string;
    verifiedState: any;
  };
}> {
  // 1. RBAC Verification: Only ADMIN and EDITOR can authorize Flagsmith mutations
  if (approvingUser.role !== "ADMIN" && approvingUser.role !== "EDITOR") {
    throw new Error(
      `Only users with ADMIN or EDITOR roles can approve experiment proposals. Role '${approvingUser.role}' is not authorized.`
    );
  }

  // 2. Proposal Lookup
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    throw new Error(`Proposal '${proposalId}' was not found. Please regenerate the experiment proposal.`);
  }

  // 3. Expiration Check
  if (proposal.status === "EXPIRED" || new Date().toISOString() > proposal.expiresAt) {
    proposal.status = "EXPIRED";
    throw new Error(
      `Proposal '${proposalId}' expired at ${proposal.expiresAt}. Approvals must be signed within 15 minutes of generation.`
    );
  }

  // 4. Rejection Check
  if (proposal.status === "REJECTED") {
    throw new Error(
      `Proposal '${proposalId}' has been rejected and cannot be executed.`
    );
  }

  // 5. Replay Prevention
  if (proposal.status === "EXECUTED") {
    throw new Error(
      `Proposal '${proposalId}' has already been executed at ${proposal.executedAt}. Replay attacks are prohibited (PROPOSAL_ALREADY_EXECUTED).`
    );
  }

  // 6. Anti-Tamper Configuration Hash Verification
  const recomputedHash = computeConfigurationHash(proposal.strategy);
  if (submittedHash !== proposal.configurationHash || submittedHash !== recomputedHash) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: PROPOSAL_TAMPERED - Configuration hash mismatch. The proposed experiment was altered after generation. Approved hash: ${submittedHash}, Current hash: ${recomputedHash}.`
    );
  }

  // 7. Validation Error Gate
  if (!proposal.validation.isValid) {
    throw new Error(
      `Proposal contains validation errors: ${proposal.validation.errors.join("; ")}`
    );
  }

  // 8. Production Confirmation Guard
  if (proposal.targetEnvironment === "production" && !options?.confirmedProductionTarget) {
    throw new Error(
      "Production mutation blocked: Target is 'production' but confirmedProductionTarget was not explicitly asserted."
    );
  }

  const strategy = proposal.strategy;
  const verifiedAuthorizer = approvingUser.fullName || approvingUser.email;

  // 9. Atomic State Transition to EXECUTING (PostgreSQL Multi-Instance Lock + Local Mutex)
  const isDbConfigured = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock"));
  let lockedInDb = false;

  if (isDbConfigured) {
    try {
      const updateResult = await prisma.experimentProposal.updateMany({
        where: {
          id: proposalId,
          status: "PENDING_APPROVAL",
          configurationHash: submittedHash,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: "EXECUTING",
          approvedBy: verifiedAuthorizer,
          approvedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        const latest = await prisma.experimentProposal.findUnique({ where: { id: proposalId } });
        if (latest?.status === "EXECUTED") {
          throw new Error(
            `Proposal '${proposalId}' has already been executed at ${latest.executedAt?.toISOString()}. Replay attacks are prohibited (PROPOSAL_ALREADY_EXECUTED).`
          );
        }
        if (latest?.status === "EXECUTING") {
          throw new Error(
            `Proposal '${proposalId}' is currently being executed by another process. Concurrent execution blocked.`
          );
        }
        if (latest?.status === "REJECTED") {
          throw new Error(`Proposal '${proposalId}' has been rejected and cannot be executed.`);
        }
        if (latest?.expiresAt && latest.expiresAt <= new Date()) {
          throw new Error(
            `Proposal '${proposalId}' expired at ${latest.expiresAt.toISOString()}. Approvals must be signed within 15 minutes of generation.`
          );
        }
        if (latest && latest.configurationHash !== submittedHash) {
          throw new Error(
            `CRITICAL SECURITY VIOLATION: PROPOSAL_TAMPERED - Configuration hash mismatch. Approved hash: ${submittedHash}, Current hash: ${latest.configurationHash}.`
          );
        }
        throw new Error(`Proposal '${proposalId}' is not in a valid state for execution.`);
      }
      lockedInDb = true;
    } catch (dbErr: any) {
      if (
        dbErr.message?.includes("PROPOSAL_ALREADY_EXECUTED") ||
        dbErr.message?.includes("Concurrent execution blocked") ||
        dbErr.message?.includes("PROPOSAL_TAMPERED")
      ) {
        throw dbErr;
      }
      console.warn("[Proposal Service] Database atomic transition note:", dbErr.message);
    }
  }

  // In-memory mutex transition
  if (proposal.status !== "PENDING_APPROVAL") {
    throw new Error(`Proposal '${proposalId}' status '${proposal.status}' is not eligible for execution.`);
  }
  proposal.status = "EXECUTING";

  // 8. Provision Feature Flag in Flagsmith
  const flagsmithPayload = {
    name: strategy.flagsmith_feature_name,
    description: `${strategy.experiment_name} | Hypothesis: ${strategy.hypothesis.slice(0, 100)}...`,
    initialValue: JSON.stringify(strategy.control_variant.featureValue),
    variants: strategy.treatment_variants.map((v) => ({
      key: v.key,
      trafficAllocation: v.trafficAllocation,
      value: JSON.stringify(v.featureValue),
    })),
  };

  const fsResult = await createFlagsmithMultivariateFeature(flagsmithPayload);

  if (!fsResult.success) {
    proposal.status = "PENDING_APPROVAL";
    proposalRegistry.set(proposalId, proposal);
    if (isDbConfigured && lockedInDb) {
      await prisma.experimentProposal.update({
        where: { id: proposalId },
        data: { status: "PENDING_APPROVAL" },
      }).catch(() => {});
    }

    await recordAuditLog({
      action: "OPERATION_FAILED",
      actor: { name: verifiedAuthorizer, type: "human" },
      entityType: "EXPERIMENT",
      entityId: strategy.flagsmith_feature_name,
      details: `Approved proposal execution failed during Flagsmith provisioning: ${fsResult.error}`,
      metadata: {
        proposalId,
        configurationHash: submittedHash,
        error: fsResult.error,
        status: fsResult.status,
      },
    });

    throw new Error(`Flagsmith provisioning failed: ${fsResult.error} (${fsResult.status})`);
  }

  const featureId = fsResult.featureId!;

  // 9. Read-After-Write Edge Verification
  const edgeVerification = await getLiveRemoteFeatureState(strategy.flagsmith_feature_name);
  if (!edgeVerification.success || !edgeVerification.state) {
    proposal.status = "PENDING_APPROVAL";
    proposalRegistry.set(proposalId, proposal);
    if (isDbConfigured && lockedInDb) {
      await prisma.experimentProposal.update({
        where: { id: proposalId },
        data: { status: "PENDING_APPROVAL" },
      }).catch(() => {});
    }
    throw new Error(
      `Read-after-write verification failed: Feature '${strategy.flagsmith_feature_name}' could not be verified on Flagsmith edge.`
    );
  }

  // 10. Persist to PostgreSQL Prisma
  let experimentDbId = `exp_${Date.now()}`;
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      let org = await prisma.organization.findFirst();
      if (!org) {
        org = await prisma.organization.create({
          data: {
            name: approvingUser.organizationName || "Acme Growth Inc.",
            slug: `acme-growth-${Date.now().toString(36).slice(-4)}`,
          },
        });
      }

      let project = await prisma.project.findFirst({
        where: { organizationId: org.id },
      });
      if (!project) {
        project = await prisma.project.create({
          data: {
            name: "PulsePilot Main Project",
            organizationId: org.id,
            flagsmithProjectId: process.env.FLAGSMITH_PROJECT_ID || "53867",
            flagsmithEnvironmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY || "4Y72D2n57QaWFq7TU4sNsz",
          },
        });
      }

      const experiment = await prisma.experiment.upsert({
        where: { flagsmithFeatureName: strategy.flagsmith_feature_name },
        update: {
          title: strategy.experiment_name,
          hypothesis: strategy.hypothesis,
          flagsmithFeatureId: featureId,
          status: "ACTIVE",
          primaryMetric: strategy.primary_metric.key,
          guardrailMetrics: strategy.guardrail_metrics?.map((m) => m.key) || [],
          sampleSizeTarget: 5000,
        },
        create: {
          projectId: project.id,
          title: strategy.experiment_name,
          hypothesis: strategy.hypothesis,
          flagsmithFeatureId: featureId,
          flagsmithFeatureName: strategy.flagsmith_feature_name,
          status: "ACTIVE",
          primaryMetric: strategy.primary_metric.key,
          guardrailMetrics: strategy.guardrail_metrics?.map((m) => m.key) || [],
          targetAudience: strategy.target_audience?.segmentName || "All Visitors",
          sampleSizeTarget: 5000,
        },
      });

      experimentDbId = experiment.id;

      await prisma.experimentVariant.deleteMany({
        where: { experimentId: experiment.id },
      });

      await prisma.experimentVariant.createMany({
        data: [
          {
            experimentId: experiment.id,
            key: strategy.control_variant.key,
            name: strategy.control_variant.name,
            isControl: true,
            trafficAllocation: strategy.control_variant.trafficAllocation,
            featureValue: strategy.control_variant.featureValue as any,
          },
          ...strategy.treatment_variants.map((v) => ({
            experimentId: experiment.id,
            key: v.key,
            name: v.name,
            isControl: false,
            trafficAllocation: v.trafficAllocation,
            featureValue: v.featureValue as any,
          })),
        ],
      });
    } catch (dbErr: any) {
      console.error("[Prisma Persistence Error in Proposal Execution]:", dbErr.message);
    }
  }

  // 11. Finalize Proposal Status
  const executedAt = new Date().toISOString();
  proposal.status = "EXECUTED";
  proposal.executedAt = executedAt;
  proposal.executedBy = verifiedAuthorizer;
  proposal.executionResult = fsResult;
  proposalRegistry.set(proposalId, proposal);

  if (isDbConfigured && lockedInDb) {
    try {
      await prisma.experimentProposal.update({
        where: { id: proposalId },
        data: {
          status: "EXECUTED",
          executedBy: verifiedAuthorizer,
          executedAt: new Date(executedAt),
          executionResult: fsResult as any,
        },
      });
    } catch (updateErr: any) {
      console.warn("[Proposal Service] Database proposal completion note:", updateErr.message);
    }
  }

  const operationId = `op_fs_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  // 12. Record Audit Trail
  try {
    await recordAuditLog({
      action: "EXPERIMENT_CREATED",
      actor: { name: verifiedAuthorizer, type: "human" },
      entityType: "EXPERIMENT",
      entityId: strategy.flagsmith_feature_name,
      details: `Human authorizer ${verifiedAuthorizer} approved and executed proposal '${proposalId}' (Feature ID: ${featureId}, Hash: ${submittedHash.slice(0, 8)}...).`,
      metadata: {
        proposalId,
        operationId,
        configurationHash: submittedHash,
        featureId,
        flagsmithFeatureName: strategy.flagsmith_feature_name,
        targetEnvironment: proposal.targetEnvironment,
        remoteCreated: fsResult.remoteCreated,
        isExisting: fsResult.isExisting,
        verified: true,
      },
    });
  } catch (auditErr: any) {
    console.warn("[Proposal Service] Audit log persistence note:", auditErr.message);
  }

  return {
    success: true,
    proposalId,
    flagsmithFeatureId: featureId,
    flagsmithFeatureName: strategy.flagsmith_feature_name,
    status: "ACTIVE",
    verified: true,
    remoteCreated: fsResult.remoteCreated ?? false,
    isExisting: fsResult.isExisting ?? false,
    executionReport: {
      operationId,
      approvedBy: verifiedAuthorizer,
      approvedAt: executedAt,
      targetEnvironment: proposal.targetEnvironment,
      configurationHash: submittedHash,
      readAfterWriteStatus: "VERIFIED_AT_EDGE",
      verifiedState: edgeVerification.state,
    },
  };
}
