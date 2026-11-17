/**
 * PulsePilot AI — AI Experiment Proposal & Cryptographic Approval Service
 * Flagsmith-First Autonomous Governance Engine
 *
 * Implements strict Human-in-the-Loop (HITL) proposal and execution handshake:
 * 1. Agent generates structured experiment proposal
 * 2. Remote Flagsmith inspection & duplicate detection against live environment
 * 3. Exact traffic allocation validation (strictly 100%)
 * 4. Application code instrumentation reference template generation
 * 5. Cryptographic SHA-256 configuration hashing (anti-tamper)
 * 6. Durable PostgreSQL persistence (fail-closed, no silent memory fallback in production)
 * 7. Two-step separation:
 *    Step A: Authenticated human approval (POST /api/experiments/approve) -> status: APPROVED
 *    Step B: Idempotent lease execution (POST /api/experiments/execute) -> status: EXECUTING -> EXECUTED
 * 8. Stale approval expiration (15-min TTL) & anti-replay prevention
 * 9. Execution leases, reconciliation, and read-after-write verification against Flagsmith REST API
 */

import crypto from "crypto";
import type { ExperimentStrategy } from "@/lib/ai/schemas";
import {
  createFlagsmithMultivariateFeature,
  getLiveRemoteFeatureState,
} from "./flagsmith-admin";
import type { Prisma } from "@prisma/client";
import { withTenantContext } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import type { AuthUser } from "@/lib/auth/auth-service";


// Durable proposal and experiment data access always runs as pulsepilot_app,
// scoped to the authenticated user's organization.
function tenantScopedPrisma(organizationId: string) {
  return {
    experiment: {
      findUnique: (args: Prisma.ExperimentFindUniqueArgs) =>
        withTenantContext(organizationId, (tx) => tx.experiment.findUnique(args)),
    },
    experimentProposal: {
      create: (args: Prisma.ExperimentProposalCreateArgs) =>
        withTenantContext(organizationId, (tx) => tx.experimentProposal.create(args)),
      findUnique: (args: Prisma.ExperimentProposalFindUniqueArgs) =>
        withTenantContext(organizationId, (tx) => tx.experimentProposal.findUnique(args)),
      update: (args: Prisma.ExperimentProposalUpdateArgs) =>
        withTenantContext(organizationId, (tx) => tx.experimentProposal.update(args)),
      updateMany: (args: Prisma.ExperimentProposalUpdateManyArgs) =>
        withTenantContext(organizationId, (tx) => tx.experimentProposal.updateMany(args)),
    },
  };
}

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
  approvedBy?: string;
  approvedAt?: string;
  executedBy?: string;
  executedAt?: string;
  executionResult?: any;
  idempotencyKey?: string;
  leaseExpiresAt?: string;
  remoteFeatureId?: number;
  executionStep?: string;
}

// In-memory fallback registry: permitted ONLY in explicit test/mock isolation
const proposalRegistry = new Map<string, ExperimentProposal>();

function isMockOrTestMode(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.DATABASE_URL?.includes("mock"))
  );
}

function isDatabaseConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes("mock") &&
    process.env.DATABASE_URL.startsWith("postgres")
  );
}

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
 * Enforces fail-closed durable PostgreSQL persistence when DATABASE_URL is configured.
 */
export async function createExperimentProposal(
  strategy: ExperimentStrategy,
  proposingUser: AuthUser,
  targetEnvironment: string = "development"
): Promise<ExperimentProposal> {
  const db = tenantScopedPrisma(proposingUser.organizationId);
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
  if (isDatabaseConfigured()) {
    try {
      const existingExp = await db.experiment.findUnique({
        where: { flagsmithFeatureName: strategy.flagsmith_feature_name },
      });
      if (existingExp) {
        existsInDatabase = true;
        duplicateWarning = `Experiment '${strategy.flagsmith_feature_name}' is already recorded in the database (Status: ${existingExp.status}).`;
      }
    } catch {
      // Handled in persistence gate
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
    executionStep: "PENDING_APPROVAL",
  };

  // 5. Fail-Closed Persistence Gate
  if (isDatabaseConfigured()) {
    try {
      await db.experimentProposal.create({
        data: {
          id: proposalId,
          configurationHash,
          status: "PENDING_APPROVAL",
          targetEnvironment,
          flagsmithFeatureName: strategy.flagsmith_feature_name,
          organizationId: proposingUser.organizationId,
          strategy: strategy as any,
          duplicateCheck: proposal.duplicateCheck as any,
          validation: proposal.validation as any,
          instrumentationPlan: proposal.instrumentationPlan as any,
          proposedBy: proposal.proposedBy,
          proposedAt: now,
          expiresAt: new Date(expiresAt),
          executionStep: "PENDING_APPROVAL",
        },
      });
    } catch (dbErr: any) {
      console.error("[Proposal Service] Database insertion failed:", dbErr.message);
      const error: any = new Error(
        `DATABASE_PERSISTENCE_FAILED: Failed to durably persist experiment proposal: ${dbErr.message}`
      );
      error.statusCode = 503;
      throw error;
    }
  } else if (!isMockOrTestMode()) {
    const error: any = new Error(
      "DATABASE_NOT_CONFIGURED: Production and staging proposals require durable PostgreSQL persistence. In-memory storage is disabled outside isolated test mode."
    );
    error.statusCode = 503;
    throw error;
  } else {
    // Only in explicit isolated mock or test mode
    proposalRegistry.set(proposalId, proposal);
  }

  return proposal;
}

/**
 * Retrieves a proposal by its unique ID.
 * In database mode, reads strictly from PostgreSQL (never silently falls back to in-memory store).
 */
export async function getProposal(proposalId: string, organizationId: string): Promise<ExperimentProposal | null> {
  const db = tenantScopedPrisma(organizationId);
  if (isDatabaseConfigured()) {
    try {
      const record = await db.experimentProposal.findUnique({
        where: { id: proposalId },
      });
      if (!record) return null;

      let status = record.status as ExperimentProposal["status"];
      if (status === "PENDING_APPROVAL" && new Date() > record.expiresAt) {
        status = "EXPIRED";
        await db.experimentProposal.update({
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
        approvedBy: record.approvedBy || undefined,
        approvedAt: record.approvedAt?.toISOString(),
        executedBy: record.executedBy || undefined,
        executedAt: record.executedAt?.toISOString(),
        executionResult: record.executionResult || undefined,
        idempotencyKey: record.idempotencyKey || undefined,
        leaseExpiresAt: record.leaseExpiresAt?.toISOString(),
        remoteFeatureId: record.remoteFeatureId || undefined,
        executionStep: record.executionStep || undefined,
      };
    } catch (dbErr: any) {
      console.error("[Proposal Service] Database proposal read failed:", dbErr.message);
      const error: any = new Error(
        `DATABASE_READ_FAILED: Failed to query proposal from database: ${dbErr.message}`
      );
      error.statusCode = 503;
      throw error;
    }
  }

  if (!isMockOrTestMode()) {
    const error: any = new Error(
      "DATABASE_NOT_CONFIGURED: Proposal retrieval requires durable database connection outside test mode."
    );
    error.statusCode = 503;
    throw error;
  }

  // Fallback ONLY in isolated test/mock mode
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
): Promise<{
  const db = tenantScopedPrisma(user.organizationId); success: boolean; message: string }> {
  // Guest and Viewer role cannot reject proposals
  if (user.role === "VIEWER" || user.id === "usr_guest") {
    const error: any = new Error(
      "VIEWER role and guest users cannot reject experiment proposals. Only ADMIN or EDITOR roles have governance authority."
    );
    error.statusCode = 403;
    throw error;
  }

  const proposal = await getProposal(proposalId, user.organizationId);
  if (!proposal) {
    throw new Error(`Proposal '${proposalId}' not found.`);
  }

  if (proposal.status === "EXECUTED") {
    throw new Error(`Cannot reject proposal '${proposalId}' because it has already been executed.`);
  }

  if (isDatabaseConfigured()) {
    try {
      await db.experimentProposal.update({
        where: { id: proposalId },
        data: { status: "REJECTED", executionStep: `REJECTED: ${reason}` },
      });
    } catch (dbErr: any) {
      const error: any = new Error(`Failed to persist proposal rejection: ${dbErr.message}`);
      error.statusCode = 503;
      throw error;
    }
  } else if (isMockOrTestMode()) {
    proposal.status = "REJECTED";
    proposalRegistry.set(proposalId, proposal);
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
  } catch {
    // Audit logging is non-blocking on proposal rejection
  }

  return {
    success: true,
    message: `Proposal '${proposalId}' has been rejected.`,
  };
}

/**
 * STEP 1: APPROVES an experiment proposal (Human Sign-off Handshake).
 * Atomically transitions PENDING_APPROVAL -> APPROVED.
 * Strictly verifies authentication, RBAC, hash integrity, and 15-min TTL.
 * NOTE: DOES NOT CALL FLAGSMITH. Flagsmith mutations occur strictly in executeApprovedProposal.
 */
export async function approveProposal(
  proposalId: string,
  submittedHash: string,
  approvingUser: AuthUser
): Promise<{
  const db = tenantScopedPrisma(approvingUser.organizationId);
  success: boolean;
  proposalId: string;
  status: "APPROVED";
  approvedBy: string;
  approvedAt: string;
  configurationHash: string;
  message: string;
}> {
  // 1. RBAC Verification: Only authenticated ADMIN and EDITOR can authorize proposals
  if (approvingUser.role !== "ADMIN" && approvingUser.role !== "EDITOR") {
    const error: any = new Error(
      `Only users with ADMIN or EDITOR roles can approve experiment proposals. Role '${approvingUser.role}' is not authorized to approve.`
    );
    error.statusCode = 403;
    throw error;
  }

  if (approvingUser.id === "usr_guest" || approvingUser.email?.includes("@pulsepilot.demo")) {
    const error: any = new Error(
      "Demo Guest sessions cannot approve proposals. Please sign in with an authenticated corporate identity."
    );
    error.statusCode = 403;
    throw error;
  }

  // 2. Proposal Lookup
  const proposal = await getProposal(proposalId, approvingUser.organizationId);
  if (!proposal) {
    const error: any = new Error(`Proposal '${proposalId}' was not found. Please regenerate the proposal.`);
    error.statusCode = 404;
    throw error;
  }

  // 3. Expiration Check
  if (proposal.status === "EXPIRED" || new Date().toISOString() > proposal.expiresAt) {
    proposal.status = "EXPIRED";
    const error: any = new Error(
      `Proposal '${proposalId}' expired at ${proposal.expiresAt}. Approvals must be signed within 15 minutes of generation.`
    );
    error.statusCode = 400;
    throw error;
  }

  // 4. Rejection & Prior State Guards
  if (proposal.status === "REJECTED") {
    const error: any = new Error(`Proposal '${proposalId}' has been rejected and cannot be approved.`);
    error.statusCode = 400;
    throw error;
  }

  if (proposal.status === "EXECUTED") {
    const error: any = new Error(
      `Proposal '${proposalId}' has already been executed at ${proposal.executedAt}. Re-approval is prohibited (PROPOSAL_ALREADY_EXECUTED).`
    );
    error.statusCode = 400;
    throw error;
  }

  if (proposal.status === "APPROVED") {
    return {
      success: true,
      proposalId,
      status: "APPROVED",
      approvedBy: proposal.approvedBy || "Administrator",
      approvedAt: proposal.approvedAt || new Date().toISOString(),
      configurationHash: proposal.configurationHash,
      message: `Proposal '${proposalId}' is already approved. Ready for execution.`,
    };
  }

  // 5. Anti-Tamper Configuration Hash Verification
  const recomputedHash = computeConfigurationHash(proposal.strategy);
  if (submittedHash !== proposal.configurationHash || submittedHash !== recomputedHash) {
    const error: any = new Error(
      `CRITICAL SECURITY VIOLATION: PROPOSAL_TAMPERED - Configuration hash mismatch. Approved hash: ${submittedHash}, Current hash: ${recomputedHash}.`
    );
    error.statusCode = 409;
    throw error;
  }

  // 6. Validation Error Gate
  if (!proposal.validation.isValid) {
    const error: any = new Error(
      `Proposal contains validation errors: ${proposal.validation.errors.join("; ")}`
    );
    error.statusCode = 400;
    throw error;
  }

  const verifiedAuthorizer = approvingUser.fullName || approvingUser.email;
  const now = new Date();

  // 7. Atomic State Transition: PENDING_APPROVAL -> APPROVED in PostgreSQL
  if (isDatabaseConfigured()) {
    try {
      const updateResult = await db.experimentProposal.updateMany({
        where: {
          id: proposalId,
          status: "PENDING_APPROVAL",
          configurationHash: submittedHash,
          expiresAt: { gt: now },
        },
        data: {
          status: "APPROVED",
          approvedBy: verifiedAuthorizer,
          approvedAt: now,
          executionStep: "APPROVED_AWAITING_EXECUTION",
        },
      });

      if (updateResult.count === 0) {
        const latest = await db.experimentProposal.findUnique({ where: { id: proposalId } });
        if (latest?.status === "APPROVED") {
          return {
            success: true,
            proposalId,
            status: "APPROVED",
            approvedBy: latest.approvedBy || verifiedAuthorizer,
            approvedAt: latest.approvedAt?.toISOString() || now.toISOString(),
            configurationHash: submittedHash,
            message: `Proposal '${proposalId}' is already approved. Ready for execution.`,
          };
        }
        if (latest?.status === "EXECUTED") {
          throw new Error(`Proposal '${proposalId}' has already been executed.`);
        }
        if (latest?.status === "REJECTED") {
          throw new Error(`Proposal '${proposalId}' has been rejected.`);
        }
        if (latest?.expiresAt && latest.expiresAt <= now) {
          throw new Error(`Proposal '${proposalId}' expired at ${latest.expiresAt.toISOString()}.`);
        }
        throw new Error(`Proposal '${proposalId}' is not in a valid state for approval.`);
      }
    } catch (dbErr: any) {
      console.error("[Proposal Service] Database atomic approval transition error:", dbErr.message);
      const error: any = new Error(`Failed to atomically approve proposal in database: ${dbErr.message}`);
      error.statusCode = 503;
      throw error;
    }
  } else if (isMockOrTestMode()) {
    proposal.status = "APPROVED";
    proposal.approvedBy = verifiedAuthorizer;
    proposal.approvedAt = now.toISOString();
    proposal.executionStep = "APPROVED_AWAITING_EXECUTION";
    proposalRegistry.set(proposalId, proposal);
  }

  // Record Audit Trail for Approval Handshake
  try {
    await recordAuditLog({
      action: "EXPERIMENT_APPROVED",
      actor: { name: verifiedAuthorizer, type: "human" },
      entityType: "EXPERIMENT_PROPOSAL",
      entityId: proposal.strategy.flagsmith_feature_name,
      details: `Experiment proposal '${proposalId}' approved by ${verifiedAuthorizer} (${approvingUser.role}) with hash ${submittedHash}. Ready for execution.`,
      metadata: {
        proposalId,
        configurationHash: submittedHash,
        targetEnvironment: proposal.targetEnvironment,
      },
    });
  } catch {
    // Non-blocking audit failure
  }

  return {
    success: true,
    proposalId,
    status: "APPROVED",
    approvedBy: verifiedAuthorizer,
    approvedAt: now.toISOString(),
    configurationHash: submittedHash,
    message: `Proposal '${proposalId}' approved successfully. Ready for execution.`,
  };
}

/**
 * STEP 2: EXECUTES an approved experiment proposal against Flagsmith.
 * Implements:
 * - Requirement of prior APPROVED status
 * - Durable execution lease & lease expiration (prevents concurrent execution)
 * - Idempotency key tracking
 * - Pre-execution remote Flagsmith check (avoids duplicate creation upon retry)
 * - Complete read-after-write verification before marking EXECUTED
 * - Never blindly resets to PENDING_APPROVAL on uncertain network failure
 */
export async function executeApprovedProposal(
  proposalId: string,
  submittedHash: string,
  executingUser: AuthUser,
  options?: {
  const db = tenantScopedPrisma(executingUser.organizationId);
    idempotencyKey?: string;
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
  executionStep: string;
  executionReport: {
    operationId: string;
    idempotencyKey: string;
    approvedBy: string;
    approvedAt: string;
    executedBy: string;
    executedAt: string;
    targetEnvironment: string;
    configurationHash: string;
    readAfterWriteStatus: string;
    verifiedState: any;
  };
}> {
  // 1. RBAC Verification
  if (executingUser.role !== "ADMIN" && executingUser.role !== "EDITOR") {
    const error: any = new Error(
      `Role '${executingUser.role}' is not authorized to execute experiment proposals. Only ADMIN and EDITOR roles have mutation authority.`
    );
    error.statusCode = 403;
    throw error;
  }

  // 2. Proposal Lookup
  const proposal = await getProposal(proposalId, executingUser.organizationId);
  if (!proposal) {
    const error: any = new Error(`Proposal '${proposalId}' was not found.`);
    error.statusCode = 404;
    throw error;
  }

  // 3. Status Verification: Must be APPROVED (or EXECUTING with expired lease for recovery)
  if (proposal.status === "PENDING_APPROVAL") {
    const error: any = new Error(
      `Proposal '${proposalId}' has not been approved. Proposals require an explicit human sign-off via /api/experiments/approve before execution.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (proposal.status === "REJECTED") {
    const error: any = new Error(`Proposal '${proposalId}' has been rejected and cannot be executed.`);
    error.statusCode = 400;
    throw error;
  }

  if (proposal.status === "EXPIRED") {
    const error: any = new Error(`Proposal '${proposalId}' has expired and cannot be executed.`);
    error.statusCode = 400;
    throw error;
  }

  // 4. Replay Prevention & Idempotent Success Return
  if (proposal.status === "EXECUTED") {
    if (options?.idempotencyKey && proposal.idempotencyKey === options.idempotencyKey && proposal.executionResult) {
      return {
        ...proposal.executionResult,
        success: true,
      };
    }
    const error: any = new Error(
      `Proposal '${proposalId}' has already been executed at ${proposal.executedAt}. Replay attacks are prohibited (PROPOSAL_ALREADY_EXECUTED).`
    );
    error.statusCode = 400;
    throw error;
  }

  // 5. Anti-Tamper Configuration Hash Verification
  const recomputedHash = computeConfigurationHash(proposal.strategy);
  if (submittedHash !== proposal.configurationHash || submittedHash !== recomputedHash) {
    const error: any = new Error(
      `CRITICAL SECURITY VIOLATION: PROPOSAL_TAMPERED - Configuration hash mismatch. Approved hash: ${submittedHash}, Current hash: ${recomputedHash}.`
    );
    error.statusCode = 409;
    throw error;
  }

  // 6. Production Confirmation Guard
  if (proposal.targetEnvironment === "production" && !options?.confirmedProductionTarget) {
    const error: any = new Error(
      "Production mutation blocked: Target is 'production' but confirmedProductionTarget was not explicitly asserted."
    );
    error.statusCode = 400;
    throw error;
  }

  const strategy = proposal.strategy;
  const verifiedExecutor = executingUser.fullName || executingUser.email;
  const idempotencyKey = options?.idempotencyKey || `exec_${proposalId}_${Date.now()}`;
  const now = new Date();
  const leaseDurationMs = 2 * 60 * 1000; // 2-minute durable execution lease
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  // 7. Atomic Execution Lease Acquisition in PostgreSQL
  if (isDatabaseConfigured()) {
    try {
      const leaseResult = await db.experimentProposal.updateMany({
        where: {
          id: proposalId,
          configurationHash: submittedHash,
          OR: [
            { status: "APPROVED" },
            {
              status: "EXECUTING",
              OR: [
                { leaseExpiresAt: { lt: now } }, // Expired lease recovery
                { idempotencyKey }, // Idempotent retry with same key
              ],
            },
          ],
        },
        data: {
          status: "EXECUTING",
          idempotencyKey,
          leaseExpiresAt,
          executedBy: verifiedExecutor,
          executionStep: "LEASE_ACQUIRED_PRE_MUTATION_CHECK",
        },
      });

      if (leaseResult.count === 0) {
        const latest = await db.experimentProposal.findUnique({ where: { id: proposalId } });
        if (latest?.status === "EXECUTED") {
          if (latest.executionResult) {
            return { ...(latest.executionResult as any), success: true };
          }
          throw new Error(`Proposal '${proposalId}' has already been executed (PROPOSAL_ALREADY_EXECUTED).`);
        }
        if (latest?.status === "EXECUTING") {
          throw new Error(
            `CONCURRENT_EXECUTION_IN_PROGRESS: Proposal '${proposalId}' is currently executing under lease until ${latest.leaseExpiresAt?.toISOString()}. Concurrent execution blocked.`
          );
        }
        throw new Error(`Proposal '${proposalId}' is not in an executable state (Status: ${latest?.status}).`);
      }
    } catch (dbErr: any) {
      if (
        dbErr.message?.includes("PROPOSAL_ALREADY_EXECUTED") ||
        dbErr.message?.includes("CONCURRENT_EXECUTION_IN_PROGRESS")
      ) {
        throw dbErr;
      }
      const error: any = new Error(`Failed to acquire execution lease: ${dbErr.message}`);
      error.statusCode = 503;
      throw error;
    }
  } else if (isMockOrTestMode()) {
    if (proposal.status !== "APPROVED" && proposal.status !== "EXECUTING") {
      throw new Error(`Proposal '${proposalId}' is not approved for execution (Status: ${proposal.status}).`);
    }
    proposal.status = "EXECUTING";
    proposal.idempotencyKey = idempotencyKey;
    proposal.leaseExpiresAt = leaseExpiresAt.toISOString();
    proposal.executedBy = verifiedExecutor;
    proposal.executionStep = "LEASE_ACQUIRED_PRE_MUTATION_CHECK";
  }

  // 8. Pre-Execution Remote Flagsmith State Reconciliation
  // Check if feature already exists remotely (avoids duplicate creation upon network retry)
  let remoteFeatureId: number | undefined;
  let isExisting = false;
  let remoteState: any = null;

  try {
    const remoteCheck = await getLiveRemoteFeatureState(strategy.flagsmith_feature_name);
    if (remoteCheck.success && remoteCheck.state) {
      isExisting = true;
      remoteFeatureId = remoteCheck.state.feature?.id || remoteCheck.state.id;
      remoteState = remoteCheck.state;

      if (isDatabaseConfigured()) {
        await db.experimentProposal.update({
          where: { id: proposalId },
          data: {
            remoteFeatureId,
            executionStep: "FLAG_EXISTS_REMOTELY_VERIFYING",
          },
        }).catch(() => {});
      }
    }
  } catch {
    // Network lookup failure: proceed to controlled creation
  }

  // 9. Remote Provisioning (If not already created)
  if (!isExisting) {
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

    if (isDatabaseConfigured()) {
      await db.experimentProposal.update({
        where: { id: proposalId },
        data: { executionStep: "DISPATCHING_FLAGSMITH_MUTATION" },
      }).catch(() => {});
    }

    const fsResult = await createFlagsmithMultivariateFeature(flagsmithPayload);

    if (!fsResult.success) {
      // NOTE: Do NOT reset to PENDING_APPROVAL on uncertain network failure
      // Keep in EXECUTING with explicit error step so it can be reconciled
      if (isDatabaseConfigured()) {
        await db.experimentProposal.update({
          where: { id: proposalId },
          data: {
            executionStep: `MUTATION_FAILED_UNRECONCILED: ${fsResult.error?.slice(0, 200)}`,
          },
        }).catch(() => {});
      }

      await recordAuditLog({
        action: "OPERATION_FAILED",
        actor: { name: verifiedExecutor, type: "human" },
        entityType: "EXPERIMENT",
        entityId: strategy.flagsmith_feature_name,
        details: `Proposal execution failed during Flagsmith provisioning: ${fsResult.error}`,
        metadata: {
          proposalId,
          configurationHash: submittedHash,
          error: fsResult.error,
          status: fsResult.status,
        },
      });

      const error: any = new Error(
        `Flagsmith remote provisioning failed: ${fsResult.error || "Unknown API error"}. Proposal state preserved in EXECUTING for reconciliation.`
      );
      error.statusCode = 502;
      throw error;
    }

    remoteFeatureId = fsResult.featureId;
    remoteState = fsResult.state;
  }

  // 10. Read-After-Write Edge Verification
  const verification = await getLiveRemoteFeatureState(strategy.flagsmith_feature_name);
  if (!verification.success || !verification.state) {
    if (isDatabaseConfigured()) {
      await db.experimentProposal.update({
        where: { id: proposalId },
        data: {
          remoteFeatureId,
          executionStep: "READBACK_VERIFICATION_PENDING",
        },
      }).catch(() => {});
    }

    const error: any = new Error(
      `Remote feature provisioned (Feature ID: ${remoteFeatureId}), but read-after-write edge verification could not be confirmed: ${verification.error}. Proposal preserved for reconciliation.`
    );
    error.statusCode = 502;
    throw error;
  }

  const verifiedState = verification.state;
  const verifiedFeatureId = verifiedState.feature?.id || verifiedState.id || remoteFeatureId;

  // 11. Finalize Execution: Atomically transition to EXECUTED
  const executedAt = new Date().toISOString();
  const executionReport = {
    operationId: `op_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    idempotencyKey,
    approvedBy: proposal.approvedBy || verifiedExecutor,
    approvedAt: proposal.approvedAt || executedAt,
    executedBy: verifiedExecutor,
    executedAt,
    targetEnvironment: proposal.targetEnvironment,
    configurationHash: submittedHash,
    readAfterWriteStatus: "VERIFIED",
    verifiedState,
  };

  const finalResult = {
    success: true,
    proposalId,
    flagsmithFeatureId: Number(verifiedFeatureId),
    flagsmithFeatureName: strategy.flagsmith_feature_name,
    status: "EXECUTED",
    verified: true,
    remoteCreated: !isExisting,
    isExisting,
    executionStep: "VERIFIED_COMPLETED",
    executionReport,
  };

  if (isDatabaseConfigured()) {
    try {
      await db.experimentProposal.update({
        where: { id: proposalId },
        data: {
          status: "EXECUTED",
          executedBy: verifiedExecutor,
          executedAt: new Date(executedAt),
          remoteFeatureId: Number(verifiedFeatureId),
          executionStep: "VERIFIED_COMPLETED",
          executionResult: finalResult as any,
          leaseExpiresAt: null, // Clear execution lease
        },
      });
    } catch (dbErr: any) {
      console.warn("[Proposal Service] Database execution finalization note:", dbErr.message);
    }
  } else if (isMockOrTestMode()) {
    proposal.status = "EXECUTED";
    proposal.executedBy = verifiedExecutor;
    proposal.executedAt = executedAt;
    proposal.remoteFeatureId = Number(verifiedFeatureId);
    proposal.executionStep = "VERIFIED_COMPLETED";
    proposal.executionResult = finalResult;
    proposalRegistry.set(proposalId, proposal);
  }

  // 12. Record Audit Log
  try {
    await recordAuditLog({
      action: "EXPERIMENT_CREATED",
      actor: { name: verifiedExecutor, type: "human" },
      entityType: "EXPERIMENT",
      entityId: strategy.flagsmith_feature_name,
      details: `Experiment proposal '${proposalId}' executed against Flagsmith (${proposal.targetEnvironment}): Feature ID ${verifiedFeatureId}. Read-after-write verified.`,
      metadata: {
        proposalId,
        flagsmithFeatureId: verifiedFeatureId,
        flagsmithFeatureName: strategy.flagsmith_feature_name,
        targetEnvironment: proposal.targetEnvironment,
        configurationHash: submittedHash,
        idempotencyKey,
      },
    });
  } catch {
    // Non-blocking
  }

  return finalResult;
}

/**
 * Combined approval and execution wrapper.
 * Calls approveProposal followed by executeApprovedProposal.
 * Preserves backward compatibility for automated tests and single-click admin actions.
 */
export async function approveAndExecuteProposal(
  proposalId: string,
  submittedHash: string,
  user: AuthUser,
  options?: {
    confirmedProductionTarget?: boolean;
    idempotencyKey?: string;
  }
) {
  // 1. Approve proposal if not already approved
  const current = await getProposal(proposalId, user.organizationId);
  if (current?.status === "PENDING_APPROVAL") {
    await approveProposal(proposalId, submittedHash, user);
  }

  // 2. Execute approved proposal
  return executeApprovedProposal(proposalId, submittedHash, user, options);
}
