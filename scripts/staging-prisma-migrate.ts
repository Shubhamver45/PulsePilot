/**
 * PulsePilot AI — Staging Prisma Migration Runner
 * 
 * Safely executes Prisma migrations against the dedicated STAGING database.
 * 
 * Safety Rules:
 * 1. Requires STAGING_DATABASE_URL (fails closed if missing).
 * 2. Strictly prohibits silent fallback to DATABASE_URL.
 * 3. Inspects host and project reference; aborts if matching production (czqhiuidekvozuoqdmyd).
 * 4. Redacts all passwords and credentials in logs.
 * 5. Runs `prisma migrate deploy` with scoped environment variables.
 */

import { spawnSync } from "child_process";

const KNOWN_PRODUCTION_PROJECT_REF = "czqhiuidekvozuoqdmyd";

function sanitizeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
  } catch {
    return "[MALFORMED_URL]";
  }
}

async function main() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — STAGING PRISMA MIGRATION RUNNER                   ");
  console.log("=====================================================================\n");

  // Support loading from .env.staging if not present in process.env
  const fs = await import("fs");
  const path = await import("path");
  if (!process.env.STAGING_DATABASE_URL) {
    const stagingEnvPath = path.resolve(".env.staging");
    if (fs.existsSync(stagingEnvPath)) {
      const content = fs.readFileSync(stagingEnvPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("STAGING_DATABASE_URL=")) {
          process.env.STAGING_DATABASE_URL = trimmed.split("=").slice(1).join("=").replace(/^["']|["']$/g, "").trim();
        }
        if (trimmed.startsWith("STAGING_DIRECT_URL=")) {
          process.env.STAGING_DIRECT_URL = trimmed.split("=").slice(1).join("=").replace(/^["']|["']$/g, "").trim();
        }
      }
    }
  }

  const stagingUrl = process.env.STAGING_DATABASE_URL;
  const stagingDirectUrl = process.env.STAGING_DIRECT_URL || stagingUrl;

  // 1. Fail closed if STAGING_DATABASE_URL is missing
  if (!stagingUrl || stagingUrl.trim() === "") {
    console.error("❌ [CRITICAL SAFETY HALT: MISSING STAGING_DATABASE_URL]");
    console.error("A dedicated STAGING_DATABASE_URL environment variable is strictly required.");
    console.error("Rule Enforcement: Silent fallback to DATABASE_URL is strictly prohibited to prevent accidental production mutation.");
    console.error("Please provision a dedicated staging database and set STAGING_DATABASE_URL.\n");
    process.exit(1);
  }

  // 2. Parse and verify project reference is NOT production
  try {
    const parsed = new URL(stagingUrl);
    const hostname = parsed.hostname.toLowerCase();
    
    if (hostname.includes(KNOWN_PRODUCTION_PROJECT_REF.toLowerCase())) {
      console.error("🛑 [CRITICAL SECURITY ALERT: PRODUCTION COLLISION DETECTED] 🛑");
      console.error(`Target database host '${parsed.hostname}' matches KNOWN PRODUCTION ('${KNOWN_PRODUCTION_PROJECT_REF}')!`);
      console.error("Cardinal Rule Violation: Prisma migration against production via staging runner is STRICTLY BLOCKED.\n");
      process.exit(1);
    }

    console.log("Staging Target Sanitized Inspection:");
    console.log(`  • Host:     ${parsed.hostname}`);
    console.log(`  • Port:     ${parsed.port || "5432"}`);
    console.log(`  • Database: ${parsed.pathname.replace("/", "")}`);
    console.log(`  • Target:   ${sanitizeUrl(stagingUrl)}\n`);
  } catch (err: any) {
    console.error("❌ Malformed STAGING_DATABASE_URL:", err.message);
    process.exit(1);
  }

  // 3. Execute `npx prisma migrate deploy` strictly targeted at staging
  console.log("🚀 Executing 'prisma migrate deploy' against staging database...\n");

  const env = {
    ...process.env,
    DATABASE_URL: stagingUrl,
    DIRECT_URL: stagingDirectUrl,
  };

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`\n❌ Prisma staging migration failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }

  console.log("\n✅ Staging migrations successfully applied.");
}

main().catch((err) => {
  console.error("Staging migration runner failed:", err);
  process.exit(1);
});

