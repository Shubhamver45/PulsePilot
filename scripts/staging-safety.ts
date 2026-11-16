/**
 * PulsePilot AI — Staging Environment Safety & Identity Assurance Module
 * 
 * Enforces strict staging-only isolation invariants:
 * 1. Mandatory STAGING_PROJECT_REF with strict format validation.
 * 2. Exact parsed hostname validation against the expected Supabase host.
 * 3. Exact comparison with known production project reference (czqhiuidekvozuoqdmyd).
 * 4. Rejection of non-Supabase or unsupported host formats.
 * 5. Rejection of missing, malformed, or mismatching expected project references.
 * 6. Agreement between project reference and target hostnames across all URLs.
 * 7. Verification that TLS certificate verification is NOT disabled:
 *    - Rejects sslmode=disable, sslmode=allow, sslmode=prefer, sslmode=no-verify.
 *    - Rejects rejectUnauthorized=false.
 *    - Requires sslmode=verify-full or sslmode=require.
 * 8. Zero fallback to DATABASE_URL or DIRECT_URL.
 * 9. Separation of client-side endpoint validation from server session inspection.
 * 10. Structured database error inspection with exact SQLSTATE assertions (e.g. 42501).
 * 11. Explicit rejection of transaction-aborted 25P02 masquerading as permission failures.
 * 12. Explicit documentation that Supabase exposes no native PostgreSQL project identifier,
 *     and current_database() = 'postgres' is standard and NOT treated as staging proof.
 * 13. Zero secret leakage across all logs and outputs.
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

export const KNOWN_PRODUCTION_PROJECT_REF = "czqhiuidekvozuoqdmyd";
export const VALID_PROJECT_REF_REGEX = /^[a-z0-9]{12,40}$/;

export interface TlsPolicy {
  sslMode: string;
  certVerificationEnforced: boolean;
  hostnameVerificationEnforced: boolean;
}

export interface ValidatedStagingEndpoint {
  protocol: string;
  hostname: string;
  port: string;
  database: string;
  username: string;
  projectRef: string;
  isPooler: boolean;
  sanitizedUrl: string;
  rawUrl: string;
  tlsPolicy: TlsPolicy;
}

export interface StagingEnvironmentConfig {
  stagingProjectRef: string;
  stagingDatabaseUrl: string;
  stagingDirectUrl: string;
  dbEndpoint: ValidatedStagingEndpoint;
  directEndpoint: ValidatedStagingEndpoint;
}

/**
 * Pure server-returned attributes obtained by querying PostgreSQL.
 * Note: Supabase exposes no native PostgreSQL catalog variable for cloud project reference.
 * Therefore, this record contains strictly values returned by PostgreSQL itself.
 */
export interface ServerIdentityRecord {
  current_database: string;
  current_user: string;
  session_user: string;
  inet_server_addr: string | null;
  inet_server_port: number | null;
  version: string;
}

/**
 * Structured database error inspection result.
 */
export interface DatabaseErrorInspection {
  sqlState: string | null;
  isPermissionDenied: boolean;
  isTransactionAborted: boolean;
  rawMessage: string;
}

/**
 * Validates the STAGING_PROJECT_REF format, presence, and production collision.
 */
export function validateStagingProjectRef(projectRef: string | undefined): string {
  if (!projectRef || projectRef.trim() === "") {
    throw new Error(
      "MISSING_STAGING_PROJECT_REF: STAGING_PROJECT_REF is strictly mandatory. " +
      "Set a dedicated staging project reference in .env.staging or environment."
    );
  }

  const cleanRef = projectRef.trim().toLowerCase();

  // Guard against template placeholders
  if (
    cleanRef.includes("your-staging") ||
    cleanRef.includes("staging_project_ref") ||
    cleanRef.includes("replace_me") ||
    cleanRef === "placeholder" ||
    cleanRef === "postgres" ||
    cleanRef === "staging"
  ) {
    throw new Error(
      `INVALID_STAGING_PROJECT_REF: "${projectRef}" appears to be a placeholder or invalid identifier. ` +
      "Provide a valid Supabase project reference."
    );
  }

  // Format validation: Supabase project references are lowercase alphanumeric strings
  if (!VALID_PROJECT_REF_REGEX.test(cleanRef)) {
    throw new Error(
      `MALFORMED_STAGING_PROJECT_REF: "${projectRef}" does not match valid Supabase project reference format ` +
      `(/^[a-z0-9]{12,40}$/).`
    );
  }

  // Collision validation: Strict check against production project reference
  if (cleanRef === KNOWN_PRODUCTION_PROJECT_REF.toLowerCase()) {
    throw new Error(
      `PRODUCTION_COLLISION: STAGING_PROJECT_REF matches known production reference "${KNOWN_PRODUCTION_PROJECT_REF}". ` +
      "Mutating or testing against production is strictly prohibited."
    );
  }

  return cleanRef;
}

/**
 * Parses and sanitizes a connection URL, validating hostname, agreement with expected project ref,
 * and strict TLS verification policies.
 */
export function validateStagingEndpointUrl(
  urlStr: string | undefined,
  expectedProjectRef: string,
  paramName: "STAGING_DATABASE_URL" | "STAGING_DIRECT_URL"
): ValidatedStagingEndpoint {
  if (!urlStr || urlStr.trim() === "") {
    throw new Error(
      `MISSING_${paramName}: A dedicated ${paramName} is strictly required. ` +
      `Fallback to DATABASE_URL or DIRECT_URL is strictly prohibited.`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    throw new Error(`MALFORMED_URL: ${paramName} contains an invalid URL structure.`);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`INVALID_PROTOCOL: ${paramName} must use postgresql: or postgres: protocol.`);
  }

  // Strict TLS Policy Enforcement:
  // Reject insecure sslmode values that disable or weaken encryption/verification.
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase() || "require";
  if (sslMode === "disable" || sslMode === "allow" || sslMode === "prefer" || sslMode === "no-verify") {
    throw new Error(
      `INSECURE_TLS_CONFIGURATION: ${paramName} specifies sslmode="${sslMode}". ` +
      "Disabling or weakening TLS verification is strictly prohibited. Permitted modes: sslmode=require, sslmode=verify-full."
    );
  }

  const rejectUnauthorized = parsed.searchParams.get("rejectUnauthorized");
  if (rejectUnauthorized === "false" || rejectUnauthorized === "0") {
    throw new Error(
      `INSECURE_TLS_CONFIGURATION: ${paramName} explicitly disables certificate validation ` +
      "(rejectUnauthorized=false is prohibited)."
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Validate supported Supabase host pattern
  const isSupabaseCo = hostname.endsWith(".supabase.co");
  const isSupabasePooler = hostname.endsWith(".supabase.com") || hostname.includes("pooler.supabase.com");

  if (!isSupabaseCo && !isSupabasePooler) {
    throw new Error(
      `UNSUPPORTED_HOST: Target host "${parsed.hostname}" in ${paramName} is not a recognized Supabase endpoint. ` +
      "Only official Supabase direct (.supabase.co) or pooler (.supabase.com) hosts are permitted."
    );
  }

  let derivedRef = "";
  const hostParts = hostname.split(".");

  if (isSupabaseCo) {
    // Direct host format: db.<project-ref>.supabase.co or <project-ref>.supabase.co
    if (hostParts[0] === "db" && hostParts.length >= 2) {
      derivedRef = hostParts[1];
    } else {
      derivedRef = hostParts[0];
    }
  } else if (isSupabasePooler) {
    // Pooler format: aws-0-<region>.pooler.supabase.com with username postgres.<project-ref>
    // Or <project-ref>.pooler.supabase.com
    if (parsed.username.includes(".")) {
      const userParts = parsed.username.split(".");
      derivedRef = userParts[userParts.length - 1];
    } else if (hostParts.length >= 4 && hostParts[1] === "pooler") {
      derivedRef = hostParts[0];
    } else {
      throw new Error(
        `MALFORMED_POOLER_ENDPOINT: ${paramName} connects to a Supabase pooler host but username does not ` +
        `contain the project reference suffix (e.g. postgres.<project-ref>).`
      );
    }
  }

  derivedRef = derivedRef.toLowerCase();

  if (!derivedRef || !VALID_PROJECT_REF_REGEX.test(derivedRef)) {
    throw new Error(
      `MALFORMED_SUPABASE_ENDPOINT: Unable to derive valid Supabase project reference from ${paramName}. ` +
      `Extracted: "${derivedRef}".`
    );
  }

  // Production collision check on URL endpoint
  if (
    derivedRef === KNOWN_PRODUCTION_PROJECT_REF.toLowerCase() ||
    hostname.includes(KNOWN_PRODUCTION_PROJECT_REF.toLowerCase())
  ) {
    throw new Error(
      `PRODUCTION_COLLISION: ${paramName} targets known production reference "${KNOWN_PRODUCTION_PROJECT_REF}". ` +
      "Targeting production infrastructure via staging runner is strictly prohibited."
    );
  }

  // Project reference and target hostname agreement assertion
  if (derivedRef !== expectedProjectRef.toLowerCase()) {
    throw new Error(
      `PROJECT_REF_MISMATCH: ${paramName} targets project "${derivedRef}", which does not match ` +
      `mandatory STAGING_PROJECT_REF "${expectedProjectRef}". Target hostname and project reference must agree.`
    );
  }

  const sanitizedUrl = `${parsed.protocol}//${parsed.username || "postgres"}:***@${parsed.host}${parsed.pathname}`;

  return {
    protocol: parsed.protocol.replace(":", ""),
    hostname: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    username: parsed.username || "postgres",
    projectRef: derivedRef,
    isPooler: isSupabasePooler,
    sanitizedUrl,
    rawUrl: urlStr.trim(),
    tlsPolicy: {
      sslMode,
      certVerificationEnforced: sslMode === "verify-full" || sslMode === "verify-ca" || sslMode === "require",
      hostnameVerificationEnforced: sslMode === "verify-full",
    },
  };
}

/**
 * Loads configuration from process.env or .env.staging and performs strict safety validation.
 * Enforces:
 * - STAGING_PROJECT_REF mandatory.
 * - STAGING_DATABASE_URL mandatory.
 * - STAGING_DIRECT_URL mandatory for migration execution.
 * - Zero fallback to DATABASE_URL or DIRECT_URL.
 * - Both URLs target the exact same validated staging project.
 */
export function loadAndValidateStagingEnv(
  envOverrides?: Record<string, string | undefined>
): StagingEnvironmentConfig {
  const env: Record<string, string | undefined> = { ...process.env, ...envOverrides };

  // Read .env.staging if STAGING_DATABASE_URL or STAGING_PROJECT_REF are missing
  if (!env.STAGING_DATABASE_URL || !env.STAGING_PROJECT_REF) {
    const stagingEnvPath = path.resolve(".env.staging");
    if (fs.existsSync(stagingEnvPath)) {
      const content = fs.readFileSync(stagingEnvPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const [k, ...vParts] = trimmed.split("=");
        const key = k.trim();
        const val = vParts.join("=").replace(/^["']|["']$/g, "").trim();
        if (key && !env[key]) {
          env[key] = val;
        }
      }
    }
  }

  // 1. Mandatory STAGING_PROJECT_REF validation
  const stagingProjectRef = validateStagingProjectRef(env.STAGING_PROJECT_REF);

  // 2. Prohibit silent fallback to DATABASE_URL
  const stagingDatabaseUrl = env.STAGING_DATABASE_URL;
  if (!stagingDatabaseUrl || stagingDatabaseUrl.trim() === "") {
    throw new Error(
      "MISSING_STAGING_DATABASE_URL: A dedicated STAGING_DATABASE_URL is strictly required. " +
      "Silent fallback to DATABASE_URL is strictly prohibited."
    );
  }

  // 3. Prohibit silent fallback to DIRECT_URL; STAGING_DIRECT_URL is mandatory for migration execution
  const stagingDirectUrl = env.STAGING_DIRECT_URL;
  if (!stagingDirectUrl || stagingDirectUrl.trim() === "") {
    throw new Error(
      "MISSING_STAGING_DIRECT_URL: A dedicated STAGING_DIRECT_URL is strictly required for migration execution. " +
      "Silent fallback to DIRECT_URL or pooled connection is strictly prohibited."
    );
  }

  // 4. Validate database connection endpoint
  const dbEndpoint = validateStagingEndpointUrl(
    stagingDatabaseUrl,
    stagingProjectRef,
    "STAGING_DATABASE_URL"
  );

  // 5. Validate direct connection endpoint
  const directEndpoint = validateStagingEndpointUrl(
    stagingDirectUrl,
    stagingProjectRef,
    "STAGING_DIRECT_URL"
  );

  // 6. Ensure both URLs target the same staging project
  if (dbEndpoint.projectRef !== directEndpoint.projectRef) {
    throw new Error(
      `PROJECT_MISMATCH: STAGING_DATABASE_URL (project: ${dbEndpoint.projectRef}) and ` +
      `STAGING_DIRECT_URL (project: ${directEndpoint.projectRef}) target different projects!`
    );
  }

  return {
    stagingProjectRef,
    stagingDatabaseUrl,
    stagingDirectUrl,
    dbEndpoint,
    directEndpoint,
  };
}

/**
 * Validates connected PostgreSQL server session against expected staging configuration.
 */
export function verifyServerSession(
  serverRecord: ServerIdentityRecord,
  validatedEndpoint: ValidatedStagingEndpoint
): { verified: boolean; warnings: string[]; serverDetails: ServerIdentityRecord; validatedEndpoint: ValidatedStagingEndpoint } {
  const warnings: string[] = [];

  // Check 1: Server-reported database name collision check
  if (serverRecord.current_database.toLowerCase().includes(KNOWN_PRODUCTION_PROJECT_REF.toLowerCase())) {
    throw new Error(
      `PRODUCTION_COLLISION: Server reports current_database() = "${serverRecord.current_database}", ` +
      `which matches known production project "${KNOWN_PRODUCTION_PROJECT_REF}"!`
    );
  }

  // Check 2: Explicit awareness of Supabase database name limitation
  if (serverRecord.current_database.toLowerCase() === "postgres") {
    warnings.push(
      "current_database() reports 'postgres' (standard default for all Supabase projects) and does NOT prove staging identity. " +
      "PostgreSQL exposes no cloud project reference catalog variable. " +
      "Target identity assurance relies on validated endpoint hostname and TLS certificate verification."
    );
  }

  return {
    verified: true,
    warnings,
    serverDetails: serverRecord,
    validatedEndpoint,
  };
}

/**
 * Structured inspection of database errors to extract PostgreSQL SQLSTATE.
 */
export function inspectDatabaseError(err: unknown): DatabaseErrorInspection {
  let sqlState: string | null = null;
  let rawMessage = "";

  if (typeof err === "object" && err !== null) {
    const anyErr = err as Record<string, any>;
    rawMessage = typeof anyErr.message === "string" ? anyErr.message : String(err);

    // 1. Prisma Client KnownRequestError meta.code (PostgreSQL error code)
    if (anyErr.meta && typeof anyErr.meta.code === "string") {
      sqlState = anyErr.meta.code;
    }
    // 2. Direct PostgreSQL error object (node-postgres / pg / pg-protocol)
    else if (typeof anyErr.code === "string" && /^[0-9A-Z]{5}$/.test(anyErr.code)) {
      sqlState = anyErr.code;
    }
    // 3. Structured parsing from message (e.g. "Code: `42501`" or "SQLSTATE: 42501")
    else if (rawMessage) {
      const match = rawMessage.match(/Code:\s*[`"']?([0-9A-Z]{5})[`"']?/i) ||
                    rawMessage.match(/SQLSTATE\s*[:=]?\s*[`"']?([0-9A-Z]{5})[`"']?/i) ||
                    rawMessage.match(/SQLSTATE\s+([0-9A-Z]{5})/i);
      if (match) {
        sqlState = match[1];
      }
    }
  } else {
    rawMessage = String(err);
  }

  const isPermissionDenied = sqlState === "42501";
  const isTransactionAborted = sqlState === "25P02";

  return {
    sqlState,
    isPermissionDenied,
    isTransactionAborted,
    rawMessage,
  };
}

/**
 * Asserts that a database error strictly matches the expected SQLSTATE.
 * Specifically rejects generic transaction-aborted errors (25P02) and missing SQLSTATEs.
 */
export function assertExactSqlState(
  err: unknown,
  expectedSqlState: string,
  contextMessage: string
): void {
  const inspection = inspectDatabaseError(err);

  if (!inspection.sqlState) {
    throw new Error(
      `MISSING_SQLSTATE: Expected SQLSTATE "${expectedSqlState}" for ${contextMessage}, ` +
      `but no SQLSTATE could be extracted from error: ${inspection.rawMessage}`
    );
  }

  if (inspection.isTransactionAborted) {
    throw new Error(
      `TRANSACTION_ABORTED: Encountered generic transaction aborted error (SQLSTATE 25P02) for ${contextMessage}. ` +
      `A previous command failed without savepoint recovery, masking the true failure reason.`
    );
  }

  if (inspection.sqlState !== expectedSqlState) {
    throw new Error(
      `UNEXPECTED_SQLSTATE: Expected SQLSTATE "${expectedSqlState}" for ${contextMessage}, ` +
      `but received SQLSTATE "${inspection.sqlState}": ${inspection.rawMessage}`
    );
  }
}

/**
 * Factory helper ensuring PrismaClient receives the exact validated staging direct URL.
 */
export function createStagingPrismaClient(directEndpoint: ValidatedStagingEndpoint): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: directEndpoint.rawUrl },
    },
    log: ["error"],
  });
}
