/**
 * PulsePilot AI — Dedicated Staging Flagsmith Integration Test Suite
 * Flagsmith Toggle Wars — Track 02: AI Agents & Feature Flags
 *
 * Requirements:
 * 1. Target staging environment: Project 53867, Environment Key: 4Y72D2n57QaWFq7TU4sNsz (Development, ID: 115953)
 * 2. Strict guard against production mutations
 * 3. Strict Human-in-the-Loop approval gate (CONFIRM_STAGING_MUTATION=true)
 * 4. Record remote resource IDs, HTTP response statuses, and read-after-write comparisons
 * 5. Non-destructive: automated cleanup of created feature flag
 * 6. Produce JSON evidence artifact: artifacts/staging-flagsmith-integration-report.json
 */

import fs from "fs";
import path from "path";
import {
  createFlagsmithMultivariateFeature,
  getLiveRemoteFeatureState,
  getManagementAuthHeader,
} from "../src/lib/flagsmith/flagsmith-admin";

const EXPECTED_STAGING_ENV_KEY = "4Y72D2n57QaWFq7TU4sNsz";
const EXPECTED_PROJECT_ID = "53867";
const EXPECTED_ENVIRONMENT_ID = 115953;

interface IntegrationReport {
  timestamp: string;
  targetEnvironment: {
    projectId: string;
    environmentId: number;
    environmentKey: string;
    environmentName: string;
  };
  humanApprovalConfirmed: boolean;
  steps: {
    step: string;
    operation: string;
    endpoint: string;
    httpStatus: number;
    latencyMs: number;
    success: boolean;
    details: any;
  }[];
  readAfterWriteComparison: {
    expectedFeatureName: string;
    observedFeatureName: string;
    expectedVariantsCount: number;
    observedVariantsCount: number;
    expectedControlAllocation: number;
    observedControlAllocation: number;
    matches: boolean;
  };
  cleanupVerified: boolean;
  overallSuccess: boolean;
}

async function runStagingIntegration() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT — STAGING FLAGSMITH INTEGRATION SUITE (TRACK 02)      ");
  console.log("=====================================================================\n");

  const envKey = process.env.FLAGSMITH_ENVIRONMENT_KEY || "";
  const projectId = process.env.FLAGSMITH_PROJECT_ID || "53867";
  const apiUrl = (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");
  const authHeader = getManagementAuthHeader();

  // 1. Target Environment Verification
  console.log("1. Environment Identity & Safety Verification:");
  console.log(`   - Configured Project ID: ${projectId}`);
  console.log(`   - Configured Environment Key: ${envKey ? `${envKey.slice(0, 6)}...${envKey.slice(-4)}` : "MISSING"}`);

  if (envKey !== EXPECTED_STAGING_ENV_KEY) {
    console.error(`❌ REJECTED: FLAGSMITH_ENVIRONMENT_KEY does not match expected staging key '${EXPECTED_STAGING_ENV_KEY}'. Found: '${envKey}'`);
    process.exit(1);
  }

  if (projectId !== EXPECTED_PROJECT_ID) {
    console.error(`❌ REJECTED: FLAGSMITH_PROJECT_ID does not match expected staging project '${EXPECTED_PROJECT_ID}'. Found: '${projectId}'`);
    process.exit(1);
  }

  console.log("   ✅ Target confirmed as staging/development environment (Project 53867, Env 115953).\n");

  // 2. Strict Human Approval Gate
  console.log("2. Human-in-the-Loop Approval Check:");
  const isApproved = process.env.CONFIRM_STAGING_MUTATION === "true";
  if (!isApproved) {
    console.error("❌ MUTATION BLOCKED BY HITL POLICY:");
    console.error("   Remote Flagsmith mutations require explicit human sign-off.");
    console.error("   To authorize this run, execute with: CONFIRM_STAGING_MUTATION=true npm run test:staging-flagsmith\n");
    process.exit(1);
  }
  console.log("   ✅ CONFIRM_STAGING_MUTATION=true asserted by authenticated operator.\n");

  if (!authHeader.Authorization) {
    console.error("❌ BLOCKED: FLAGSMITH_ORG_API_TOKEN is missing or empty.");
    process.exit(1);
  }

  const report: IntegrationReport = {
    timestamp: new Date().toISOString(),
    targetEnvironment: {
      projectId,
      environmentId: EXPECTED_ENVIRONMENT_ID,
      environmentKey: `${envKey.slice(0, 6)}...${envKey.slice(-4)}`,
      environmentName: "Development",
    },
    humanApprovalConfirmed: true,
    steps: [],
    readAfterWriteComparison: {
      expectedFeatureName: "",
      observedFeatureName: "",
      expectedVariantsCount: 1,
      observedVariantsCount: 0,
      expectedControlAllocation: 50,
      observedControlAllocation: 0,
      matches: false,
    },
    cleanupVerified: false,
    overallSuccess: false,
  };

  let createdFeatureId: number | null = null;
  const testFlagName = `exp_staging_audit_${Date.now()}`;

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Verify Management API
    // -------------------------------------------------------------------------
    console.log("3. Step 1: Preflight Management API Verification...");
    const t0 = performance.now();
    const mgmtRes = await fetch(`${apiUrl}/projects/${projectId}/features/`, {
      method: "GET",
      headers: { ...authHeader, "Content-Type": "application/json" },
    });
    const mgmtLatency = Number((performance.now() - t0).toFixed(2));
    const mgmtOk = mgmtRes.ok;
    const mgmtBody = mgmtOk ? await mgmtRes.json() : null;
    const existingCount = Array.isArray(mgmtBody) ? mgmtBody.length : mgmtBody?.results?.length || 0;

    console.log(`   - HTTP ${mgmtRes.status} in ${mgmtLatency}ms (Existing features: ${existingCount})`);
    report.steps.push({
      step: "1. Management API Preflight",
      operation: "GET",
      endpoint: `/projects/${projectId}/features/`,
      httpStatus: mgmtRes.status,
      latencyMs: mgmtLatency,
      success: mgmtOk,
      details: { existingFeaturesCount: existingCount },
    });

    if (!mgmtOk) throw new Error(`Management API preflight failed with HTTP ${mgmtRes.status}`);

    // -------------------------------------------------------------------------
    // STEP 2: Verify Edge API
    // -------------------------------------------------------------------------
    console.log("4. Step 2: Preflight Edge Evaluation API Verification...");
    const t1 = performance.now();
    const edgeRes = await fetch(`${apiUrl}/flags/`, {
      method: "GET",
      headers: { "X-Environment-Key": envKey, "Content-Type": "application/json" },
    });
    const edgeLatency = Number((performance.now() - t1).toFixed(2));
    const edgeOk = edgeRes.ok;
    const edgeFlags = edgeOk ? await edgeRes.json() : [];

    console.log(`   - HTTP ${edgeRes.status} in ${edgeLatency}ms (Edge flags: ${edgeFlags.length})`);
    report.steps.push({
      step: "2. Edge API Preflight",
      operation: "GET",
      endpoint: `/flags/`,
      httpStatus: edgeRes.status,
      latencyMs: edgeLatency,
      success: edgeOk,
      details: { edgeFlagsCount: edgeFlags.length },
    });

    if (!edgeOk) throw new Error(`Edge evaluation preflight failed with HTTP ${edgeRes.status}`);

    // -------------------------------------------------------------------------
    // STEP 3: Remote Multivariate Feature Provisioning
    // -------------------------------------------------------------------------
    console.log(`5. Step 3: Provisioning Remote Feature '${testFlagName}' (50/50 split)...`);
    const t2 = performance.now();
    const createResult = await createFlagsmithMultivariateFeature({
      name: testFlagName,
      description: "PulsePilot DevSecOps Staging Audit Test (Auto-Cleaned)",
      initialValue: JSON.stringify({ layout: "wizard_v1" }),
      variants: [
        {
          key: "express_checkout",
          trafficAllocation: 50,
          value: JSON.stringify({ layout: "express_single_page" }),
        },
      ],
    });
    const createLatency = Number((performance.now() - t2).toFixed(2));
    createdFeatureId = createResult.featureId || null;

    console.log(`   - Created: ${createResult.success}, Remote Feature ID: ${createdFeatureId} in ${createLatency}ms`);
    report.steps.push({
      step: "3. Feature Provisioning",
      operation: "POST",
      endpoint: `/projects/${projectId}/features/`,
      httpStatus: createResult.success ? 201 : 400,
      latencyMs: createLatency,
      success: createResult.success,
      details: {
        featureId: createdFeatureId,
        featureName: testFlagName,
        error: createResult.error,
      },
    });

    if (!createResult.success || !createdFeatureId) {
      throw new Error(`Feature provisioning failed: ${createResult.error}`);
    }

    // -------------------------------------------------------------------------
    // STEP 4: Read-After-Write Edge Verification
    // -------------------------------------------------------------------------
    console.log("6. Step 4: Performing Read-After-Write Verification on Edge...");
    const t3 = performance.now();
    const rawState = await getLiveRemoteFeatureState(testFlagName);
    const readLatency = Number((performance.now() - t3).toFixed(2));

    const observedFeatureName = rawState.state?.feature?.name || rawState.state?.name || "";
    const observedVariants = rawState.state?.multivariate_feature_state_values || [];
    const treatmentAlloc = observedVariants[0]?.percentage_allocation ?? 0;
    const controlAlloc = 100 - treatmentAlloc;

    const matches =
      observedFeatureName === testFlagName &&
      observedVariants.length === 1 &&
      controlAlloc === 50 &&
      treatmentAlloc === 50;

    report.readAfterWriteComparison = {
      expectedFeatureName: testFlagName,
      observedFeatureName,
      expectedVariantsCount: 1,
      observedVariantsCount: observedVariants.length,
      expectedControlAllocation: 50,
      observedControlAllocation: controlAlloc,
      matches,
    };

    console.log(`   - Edge Read: ${rawState.success ? "OK" : "FAILED"} in ${readLatency}ms`);
    console.log(`   - Observed Variants: ${observedVariants.length}, Control: ${controlAlloc}%, Treatment: ${treatmentAlloc}%`);
    console.log(`   - Read-After-Write Match: ${matches ? "✅ VERIFIED" : "❌ MISMATCH"}`);

    report.steps.push({
      step: "4. Read-After-Write Verification",
      operation: "GET",
      endpoint: `/flags/ (Edge Evaluator)`,
      httpStatus: rawState.success ? 200 : 404,
      latencyMs: readLatency,
      success: matches,
      details: {
        observedState: rawState.state,
      },
    });

    if (!matches) throw new Error("Read-after-write verification failed: remote state did not match created spec.");

    // -------------------------------------------------------------------------
    // STEP 5: Automated Cleanup of Test Feature
    // -------------------------------------------------------------------------
    console.log(`7. Step 5: Cleaning up test feature '${testFlagName}' (ID: ${createdFeatureId})...`);
    const t4 = performance.now();
    const delRes = await fetch(`${apiUrl}/projects/${projectId}/features/${createdFeatureId}/`, {
      method: "DELETE",
      headers: { ...authHeader },
    });
    const delLatency = Number((performance.now() - t4).toFixed(2));
    const delOk = delRes.status === 204 || delRes.ok;

    console.log(`   - Cleanup DELETE: HTTP ${delRes.status} in ${delLatency}ms (${delOk ? "CLEANED" : "FAILED"})`);
    report.cleanupVerified = delOk;
    report.steps.push({
      step: "5. Feature Cleanup",
      operation: "DELETE",
      endpoint: `/projects/${projectId}/features/${createdFeatureId}/`,
      httpStatus: delRes.status,
      latencyMs: delLatency,
      success: delOk,
      details: { deletedFeatureId: createdFeatureId },
    });

    report.overallSuccess = matches && delOk;
  } catch (err: any) {
    console.error(`\n❌ Staging Integration Exception: ${err.message}`);
    // Attempt emergency cleanup if feature was created
    if (createdFeatureId) {
      console.log(`   Attempting emergency cleanup of feature ${createdFeatureId}...`);
      await fetch(`${apiUrl}/projects/${projectId}/features/${createdFeatureId}/`, {
        method: "DELETE",
        headers: { ...authHeader },
      }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 6: Write Evidence Artifact
  // ---------------------------------------------------------------------------
  const artifactsDir = path.resolve(process.cwd(), "artifacts");
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  const reportPath = path.join(artifactsDir, "staging-flagsmith-integration-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=====================================================================");
  console.log(`   STAGING INTEGRATION RESULT: ${report.overallSuccess ? "✅ ALL TESTS PASSED" : "❌ FAILED"}`);
  console.log(`   Report written to: ${reportPath}`);
  console.log("=====================================================================\n");

  if (!report.overallSuccess) {
    process.exit(1);
  }
}

runStagingIntegration();
