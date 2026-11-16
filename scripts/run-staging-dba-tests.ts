/**
 * PulsePilot AI — Staging DBA Execution & Live Acceptance Runner
 * 
 * Safety Protocol:
 * - Phase 1: Staging Connection Safety
 *   1. Require a dedicated STAGING_DATABASE_URL environment variable.
 *   2. Fail closed if STAGING_DATABASE_URL is missing (exit 1).
 *   3. Inspect the staging hostname and Supabase project reference.
 *   4. Compare the project reference against known production reference: czqhiuidekvozuoqdmyd.
 *   5. Abort immediately if they match (exit 1).
 *   6. NEVER silently fall back to DATABASE_URL.
 *   7. NEVER print connection strings, passwords, tokens, or credentials in logs.
 */

import fs from "fs";
import path from "path";

const KNOWN_PRODUCTION_PROJECT_REF = "czqhiuidekvozuoqdmyd";

interface SanitizedTargetInfo {
  protocol: string;
  hostname: string;
  port: string;
  database: string;
  username: string;
  projectRef: string;
}

function extractSanitizedTarget(urlStr: string): SanitizedTargetInfo {
  try {
    const parsed = new URL(urlStr);
    const hostParts = parsed.hostname.split(".");
    
    // In Supabase, host is typically db.<project-ref>.supabase.co or <project-ref>.supabase.co
    let projectRef = "non_supabase_host";
    if (parsed.hostname.includes("supabase.co")) {
      if (hostParts[0] === "db" && hostParts.length >= 2) {
        projectRef = hostParts[1];
      } else {
        projectRef = hostParts[0];
      }
    }

    return {
      protocol: parsed.protocol.replace(":", ""),
      hostname: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace("/", "") || "postgres",
      username: parsed.username || "anonymous",
      projectRef,
    };
  } catch (err) {
    throw new Error("Invalid URL format in STAGING_DATABASE_URL.");
  }
}

async function runStagingSafetyGate() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — SEC-03.1 STAGING PROVISIONING GATE RUNNER         ");
  console.log("=====================================================================\n");

  // 1. Strict Enforcement: Require STAGING_DATABASE_URL (No DATABASE_URL fallback)
  // Check process.env or .env.staging
  if (!process.env.STAGING_DATABASE_URL) {
    const stagingEnvPath = path.resolve(".env.staging");
    if (fs.existsSync(stagingEnvPath)) {
      const content = fs.readFileSync(stagingEnvPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("STAGING_DATABASE_URL=")) {
          process.env.STAGING_DATABASE_URL = trimmed.split("=").slice(1).join("=").replace(/^["']|["']$/g, "").trim();
        }
      }
    }
  }

  const stagingUrl = process.env.STAGING_DATABASE_URL;

  if (!stagingUrl || stagingUrl.trim() === "") {
    console.error("❌ [CRITICAL SAFETY HALT: MISSING STAGING_DATABASE_URL]");
    console.error("A dedicated STAGING_DATABASE_URL environment variable is strictly required.");
    console.error("Rule Enforcement: Silent fallback to DATABASE_URL is strictly prohibited to prevent accidental production mutation.");
    console.error("Action Required: Provision an isolated Supabase staging database and set:");
    console.error("  export STAGING_DATABASE_URL=\"postgresql://postgres:<PASSWORD>@db.<staging-ref>.supabase.co:5432/postgres\"\n");
    console.log("📄 Staging DBA SQL execution script is ready at: scripts/staging-dba-execution.sql");
    console.log("📄 Acceptance Runbook documented in: SEC03_REVOCATION_FINAL_SECURITY_SIGNOFF.md\n");
    process.exit(1);
  }

  // 2. Parse & Sanitize Target Connection (Zero secret leakage)
  let targetInfo: SanitizedTargetInfo;
  try {
    targetInfo = extractSanitizedTarget(stagingUrl);
  } catch (err: any) {
    console.error(`❌ [ERROR] ${err.message}`);
    process.exit(1);
  }

  console.log("Staging Target Sanitized Inspection (Zero Secret Leakage):");
  console.log(`  • Protocol:    ${targetInfo.protocol}`);
  console.log(`  • Hostname:    ${targetInfo.hostname}`);
  console.log(`  • Port:        ${targetInfo.port}`);
  console.log(`  • Database:    ${targetInfo.database}`);
  console.log(`  • Role/User:   ${targetInfo.username}`);
  console.log(`  • Project Ref: ${targetInfo.projectRef}\n`);

  // 3. Collision Check: Verify Project Ref Does Not Match Production
  const isProductionCollision =
    targetInfo.projectRef.toLowerCase() === KNOWN_PRODUCTION_PROJECT_REF.toLowerCase() ||
    targetInfo.hostname.toLowerCase().includes(KNOWN_PRODUCTION_PROJECT_REF.toLowerCase());

  if (isProductionCollision) {
    console.error("🛑 [CRITICAL SECURITY ALERT: PRODUCTION COLLISION DETECTED] 🛑");
    console.error(`Target project reference '${targetInfo.projectRef}' matches KNOWN PRODUCTION ('${KNOWN_PRODUCTION_PROJECT_REF}')!`);
    console.error("Cardinal Rule Violation: Remote SQL execution against production is STRICTLY BLOCKED.");
    console.error("The migration must NOT be run against this database.\n");
    process.exit(1);
  }

  // 4. Staging Script Existence
  const scriptPath = path.resolve("scripts/staging-dba-execution.sql");
  if (!fs.existsSync(scriptPath)) {
    console.error(`❌ [ERROR] Expected SQL script not found at ${scriptPath}`);
    process.exit(1);
  }

  console.log("✅ Target database verified as non-production staging instance.");
  console.log("✅ Project reference is isolated from production.");
  console.log(`✅ Staging DBA execution script verified at: ${scriptPath}\n`);
  console.log("Next Step: The DBA can execute the script using psql or the Supabase SQL Editor:");
  console.log(`  psql "${stagingUrl.replace(/:[^:]*@/, ":***@")}" -f scripts/staging-dba-execution.sql\n`);
}

runStagingSafetyGate().catch((err) => {
  console.error("Unexpected error in safety gate:", err);
  process.exit(1);
});
