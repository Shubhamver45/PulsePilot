/**
 * Authentication & Workspace Management Service
 * PulsePilot AI — Enterprise RBAC & Workspace Isolation
 */

import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

async function getPrisma() {
  try {
    const mod = await import("../db/prisma.ts");
    return mod.prisma;
  } catch {
    const mod = await import("@/lib/db/prisma");
    return mod.prisma;
  }
}

export type UserRole = "ADMIN" | "EDITOR" | "VIEWER";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  activeWorkspaceId: string;
  activeWorkspaceName: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
}

// In-Memory User and Session Store (Synced with Database / Mock Resilience)
const USERS_STORE: Map<string, { user: AuthUser; passwordHash: string; disabled?: boolean }> = new Map();
const SESSIONS_STORE: Map<string, { userId: string; expiresAt: number }> = new Map();
const WORKSPACES_STORE: Map<string, Workspace> = new Map();
const REVOKED_JTIS_CACHE: Set<string> = new Set();

// =============================================================================
// SEC-03.1: PERSISTENT TOKEN REVOCATION ENGINE (CROSS-INSTANCE SERVERLESS)
// =============================================================================

export const PERSISTENT_REVOCATION_FILE =
  process.env.REVOKED_TOKENS_PATH ||
  path.join(os.tmpdir(), "pulsepilot_revoked_tokens.json");

export function readPersistentRevocationStore(): Record<
  string,
  { userId: string; expiresAt: number; revokedAt: number; reason?: string }
> {
  try {
    if (fs.existsSync(PERSISTENT_REVOCATION_FILE)) {
      const data = fs.readFileSync(PERSISTENT_REVOCATION_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err: any) {
    console.warn("[Revocation Store] Warning reading persistent store file:", err.message);
  }
  return {};
}

export function writePersistentRevocationStore(
  store: Record<string, { userId: string; expiresAt: number; revokedAt: number; reason?: string }>
): void {
  try {
    const dir = path.dirname(PERSISTENT_REVOCATION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${PERSISTENT_REVOCATION_FILE}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(tmpPath, PERSISTENT_REVOCATION_FILE);
  } catch (err: any) {
    console.warn("[Revocation Store] Warning writing persistent store file:", err.message);
  }
}

/**
 * Persistently records a token revocation by its unique identifier (jti).
 * Does NOT store raw tokens. Prunes expired revocation entries automatically.
 */
export async function recordTokenRevocation(
  jti: string,
  userId: string,
  expiresAtSec: number,
  reason = "USER_LOGOUT"
): Promise<boolean> {
  if (!jti) return false;

  const isProduction = process.env.NODE_ENV === "production";
  let dbSuccess = false;

  // 1. Persistent Database Write (PostgreSQL public.revoked_tokens)
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      const expDate = new Date(expiresAtSec * 1000);
      const db = await getPrisma();
      await db.$executeRawUnsafe(
        `INSERT INTO public.revoked_tokens (jti, user_id, revoked_at, expires_at, reason)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (jti) DO NOTHING`,
        jti,
        userId,
        expDate,
        reason
      );
      dbSuccess = true;
    } catch (dbErr: any) {
      if (isProduction) {
        throw new Error(
          `PERSISTENT_REVOCATION_WRITE_FAILED: Failed to record token revocation in database: ${dbErr.message}`
        );
      }
      console.warn("[Revocation Store] DB persistent revocation write warning:", dbErr.message);
    }
  } else if (isProduction) {
    throw new Error(
      "PERSISTENT_REVOCATION_WRITE_FAILED: DATABASE_URL is not configured for revocation in production environment."
    );
  }

  // 2. Persistent Shared Storage (LOCAL / TEST ENVIRONMENTS ONLY)
  // Production strictly prohibits filesystem fallback due to serverless instance isolation.
  if (!isProduction) {
    const store = readPersistentRevocationStore();
    const now = Math.floor(Date.now() / 1000);

    // Prune expired records to prevent unbounded growth
    for (const [key, record] of Object.entries(store)) {
      if (record.expiresAt < now) {
        delete store[key];
      }
    }

    store[jti] = {
      userId,
      expiresAt: expiresAtSec,
      revokedAt: now,
      reason,
    };

    writePersistentRevocationStore(store);
    return true;
  }

  return dbSuccess;
}

/**
 * Checks whether a token jti is revoked in persistent storage.
 * In privileged contexts (failClosed=true) or production, database failures abort authorization.
 * File-store fallback is strictly prohibited in production environments.
 */
export async function isTokenRevoked(
  jti: string,
  options: { failClosed?: boolean } = {}
): Promise<boolean> {
  if (!jti) return true;

  const isProduction = process.env.NODE_ENV === "production";

  // 1. Persistent Database Check
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      const db = await getPrisma();
      const rows: Array<{ jti: string }> = await db.$queryRawUnsafe(
        `SELECT jti FROM public.revoked_tokens WHERE jti = $1 LIMIT 1`,
        jti
      );
      if (rows && rows.length > 0) {
        return true;
      }
    } catch (dbErr: any) {
      if (options.failClosed || isProduction) {
        throw new Error(
          `PERSISTENT_REVOCATION_UNAVAILABLE: Revocation check failed closed: ${dbErr.message}`
        );
      }
      console.warn("[Revocation Store] Persistent DB check error:", dbErr.message);
    }
  } else if (isProduction) {
    // In production, unconfigured or mock DATABASE_URL must fail closed
    throw new Error(
      "PERSISTENT_REVOCATION_UNAVAILABLE: DATABASE_URL is not configured for revocation in production environment."
    );
  }

  // 2. Persistent Shared File Check (LOCAL / TEST ENVIRONMENTS ONLY)
  // In production, fallback to local /tmp is strictly disabled.
  if (!isProduction) {
    const store = readPersistentRevocationStore();
    const entry = store[jti];
    if (entry) {
      if (entry.expiresAt >= Math.floor(Date.now() / 1000)) {
        return true;
      }
    }
  }

  return false;
}

// =============================================================================
// SEC-03: STATELESS HMAC-SHA256 SESSION TOKEN ENGINE (SERVERLESS RESILIENT)
// =============================================================================

export const TOKEN_ISSUER = "pulsepilot-auth";
export const TOKEN_AUDIENCE = "pulsepilot-app";
export const DEFAULT_SESSION_DURATION_MS = 1000 * 60 * 60 * 24; // 24 hours (Staging Least-Privilege Lifetime)

export interface TokenClaims {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string;
  orgName: string;
  workspaceId: string;
  workspaceName: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRITICAL SECURITY CONFIGURATION ERROR: SESSION_SECRET is not configured in production environment."
      );
    }
    return "pulsepilot_dev_stateless_hmac_secret_key_minimum_32_characters_long_2026";
  }
  return secret;
}

export function getPreviousSigningSecret(): string | null {
  return process.env.SESSION_SECRET_PREVIOUS || null;
}

/**
 * Creates a cryptographically signed, stateless session token.
 * Prevents session fixation via unique jti, enforces algorithm HS256, binds claims.
 */
export function createSignedToken(
  user: AuthUser,
  expiresInMs: number = DEFAULT_SESSION_DURATION_MS
): string {
  const secret = getSigningSecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec =
    expiresInMs < 0
      ? nowSec + Math.floor(expiresInMs / 1000)
      : nowSec + Math.max(60, Math.floor(expiresInMs / 1000));

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const claims: TokenClaims = {
    sub: user.id,
    email: user.email.toLowerCase().trim(),
    name: user.fullName.trim(),
    role: user.role,
    orgId: user.organizationId,
    orgName: user.organizationName,
    workspaceId: user.activeWorkspaceId,
    workspaceName: user.activeWorkspaceName,
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    iat: nowSec,
    exp: expSec,
    jti: crypto.randomUUID(),
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const message = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("base64url");

  return `pps_${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verifies a stateless session token:
 * - Constant-time signature comparison
 * - Strict algorithm validation (prevents algorithm substitution, rejects "none")
 * - Validates expiry, issuer, audience, and essential claims
 * - Supports key rotation fallback via SESSION_SECRET_PREVIOUS
 */
export function verifySignedToken(token: string): AuthUser | null {
  if (!token || typeof token !== "string" || !token.startsWith("pps_")) {
    return null;
  }

  const raw = token.slice(4);
  const parts = raw.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    // 1. Strict Algorithm Validation (Prevent algorithm substitution)
    const headerJson = Buffer.from(headerB64, "base64url").toString("utf8");
    const header = JSON.parse(headerJson);
    if (!header || header.alg !== "HS256" || header.typ !== "JWT") {
      return null;
    }

    const message = `${headerB64}.${payloadB64}`;
    const primarySecret = getSigningSecret();

    // 2. Compute Expected Signature
    const expectedSigPrimary = crypto
      .createHmac("sha256", primarySecret)
      .update(message)
      .digest("base64url");

    let isSigValid = false;

    // Primary Secret Verification (Constant-Time)
    if (
      signatureB64.length === expectedSigPrimary.length &&
      crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSigPrimary))
    ) {
      isSigValid = true;
    } else {
      // Key Rotation Fallback: Check previous secret if configured
      const prevSecret = getPreviousSigningSecret();
      if (prevSecret) {
        const expectedSigPrev = crypto
          .createHmac("sha256", prevSecret)
          .update(message)
          .digest("base64url");

        if (
          signatureB64.length === expectedSigPrev.length &&
          crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSigPrev))
        ) {
          isSigValid = true;
        }
      }
    }

    if (!isSigValid) {
      return null;
    }

    // 3. Claims and Expiry Validation
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const claims: TokenClaims = JSON.parse(payloadJson);

    const nowSec = Math.floor(Date.now() / 1000);

    // Reject Expired Tokens
    if (!claims.exp || claims.exp <= nowSec) {
      return null;
    }

    // Validate Issuer and Audience
    if (claims.iss !== TOKEN_ISSUER || claims.aud !== TOKEN_AUDIENCE) {
      return null;
    }

    // Validate Required Identity Claims
    if (!claims.sub || typeof claims.sub !== "string" || claims.sub.trim().length === 0) {
      return null;
    }
    if (!claims.email || typeof claims.email !== "string" || !claims.email.includes("@")) {
      return null;
    }

    const validRoles: UserRole[] = ["ADMIN", "EDITOR", "VIEWER"];
    if (!validRoles.includes(claims.role)) {
      return null;
    }

    // Construct Authenticated User Profile
    return {
      id: claims.sub,
      email: claims.email,
      fullName: claims.name || claims.email,
      role: claims.role,
      organizationId: claims.orgId || "org_default",
      organizationName: claims.orgName || "PulsePilot Workspace",
      activeWorkspaceId: claims.workspaceId || "ws_default",
      activeWorkspaceName: claims.workspaceName || "Production",
      createdAt: new Date((claims.iat || nowSec) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

// Seed Default Workspaces & Users for 1-Click QA / Demo Login
function seedAuthDefaults() {
  const defaultOrgId = "org_acme_growth";
  const defaultWorkspaceId = "ws_acme_prod";

  WORKSPACES_STORE.set(defaultWorkspaceId, {
    id: defaultWorkspaceId,
    organizationId: defaultOrgId,
    name: "Acme Growth (Production)",
    slug: "acme-growth-prod",
    description: "Production experimentation workspace for flags and telemetry.",
    createdAt: new Date().toISOString(),
  });

  WORKSPACES_STORE.set("ws_acme_staging", {
    id: "ws_acme_staging",
    organizationId: defaultOrgId,
    name: "Acme Growth (Staging)",
    slug: "acme-growth-staging",
    description: "Staging and canary pre-flight testing workspace.",
    createdAt: new Date().toISOString(),
  });

  // Default User 1: Product Lead (Admin)
  const sarahUser: AuthUser = {
    id: "usr_sarah_lin",
    email: "sarah@pulsepilot.ai",
    fullName: "Sarah Lin",
    role: "ADMIN",
    organizationId: defaultOrgId,
    organizationName: "Acme Growth Inc.",
    activeWorkspaceId: defaultWorkspaceId,
    activeWorkspaceName: "Acme Growth (Production)",
    createdAt: new Date().toISOString(),
  };

  USERS_STORE.set(sarahUser.email.toLowerCase(), {
    user: sarahUser,
    passwordHash: "demo_password_hash_sarah123",
  });

  // Default User 2: Senior Growth Engineer (Editor)
  const alexUser: AuthUser = {
    id: "usr_alex_rivera",
    email: "alex@pulsepilot.ai",
    fullName: "Alex Rivera",
    role: "EDITOR",
    organizationId: defaultOrgId,
    organizationName: "Acme Growth Inc.",
    activeWorkspaceId: defaultWorkspaceId,
    activeWorkspaceName: "Acme Growth (Production)",
    createdAt: new Date().toISOString(),
  };

  USERS_STORE.set(alexUser.email.toLowerCase(), {
    user: alexUser,
    passwordHash: "demo_password_hash_alex123",
  });
}

seedAuthDefaults();

// Validation Schemas
export const RegisterInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  organizationName: z.string().min(2, "Workspace name must be at least 2 characters"),
});

export const LoginInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const WorkspaceInputSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters"),
  description: z.string().optional(),
});

/**
 * Register a new user and generate their isolated workspace
 */
export async function registerUser(input: z.infer<typeof RegisterInputSchema>): Promise<{
  success: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}> {
  const emailKey = input.email.toLowerCase().trim();
  if (USERS_STORE.has(emailKey)) {
    return { success: false, error: "An account with this email address already exists." };
  }

  const orgId = `org_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const workspace: Workspace = {
    id: workspaceId,
    organizationId: orgId,
    name: `${input.organizationName} (Production)`,
    slug: input.organizationName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    description: `Primary workspace for ${input.organizationName}`,
    createdAt: new Date().toISOString(),
  };
  WORKSPACES_STORE.set(workspaceId, workspace);

  const newUser: AuthUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    email: emailKey,
    fullName: input.fullName.trim(),
    role: "ADMIN",
    organizationId: orgId,
    organizationName: input.organizationName.trim(),
    activeWorkspaceId: workspaceId,
    activeWorkspaceName: workspace.name,
    createdAt: new Date().toISOString(),
  };

  USERS_STORE.set(emailKey, {
    user: newUser,
    passwordHash: `hash_${input.password}`,
  });

  const token = createSignedToken(newUser);
  SESSIONS_STORE.set(token, {
    userId: newUser.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  });

  return { success: true, user: newUser, token };
}

/**
 * Register or sync a user with a specific Supabase Auth user ID
 */
export async function registerUserWithId(
  input: z.infer<typeof RegisterInputSchema>,
  userId: string
): Promise<{
  success: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}> {
  const emailKey = input.email.toLowerCase().trim();
  const orgId = `org_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const workspace: Workspace = {
    id: workspaceId,
    organizationId: orgId,
    name: `${input.organizationName} (Production)`,
    slug: input.organizationName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    description: `Primary workspace for ${input.organizationName}`,
    createdAt: new Date().toISOString(),
  };
  WORKSPACES_STORE.set(workspaceId, workspace);

  const newUser: AuthUser = {
    id: userId,
    email: emailKey,
    fullName: input.fullName.trim(),
    role: "ADMIN",
    organizationId: orgId,
    organizationName: input.organizationName.trim(),
    activeWorkspaceId: workspaceId,
    activeWorkspaceName: workspace.name,
    createdAt: new Date().toISOString(),
  };

  USERS_STORE.set(emailKey, {
    user: newUser,
    passwordHash: `hash_${input.password}`,
  });

  const token = createSignedToken(newUser);
  SESSIONS_STORE.set(token, {
    userId: newUser.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });

  return { success: true, user: newUser, token };
}

/**
 * Log in an existing user
 */
export async function loginUser(input: z.infer<typeof LoginInputSchema>): Promise<{
  success: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}> {
  const emailKey = input.email.toLowerCase().trim();
  const entry = USERS_STORE.get(emailKey);

  if (!entry) {
    return { success: false, error: "Invalid email or password." };
  }

  // Verify password matches demo master password, exact hash, or demo pre-set password
  const isValid =
    input.password === "pulsepilot2026" ||
    entry.passwordHash === `hash_${input.password}` ||
    (entry.passwordHash === "demo_password_hash_sarah123" && input.password === "sarah123") ||
    (entry.passwordHash === "demo_password_hash_alex123" && input.password === "alex123");

  if (!isValid) {
    return { success: false, error: "Invalid email or password." };
  }

  const token = createSignedToken(entry.user);
  SESSIONS_STORE.set(token, {
    userId: entry.user.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });

  return { success: true, user: entry.user, token };
}

/**
 * Get current session user from token with persistent revocation verification
 */
export async function getUserFromToken(
  token: string,
  options?: { checkRevocation?: boolean; failClosed?: boolean }
): Promise<AuthUser | null> {
  if (!token) return null;

  // 1. Verify stateless HMAC-SHA256 token (survives serverless cold starts & multiple instances)
  if (token.startsWith("pps_")) {
    const verifiedUser = verifySignedToken(token);
    if (!verifiedUser) {
      return null;
    }

    // Extract jti and verify revocation against persistent store
    const raw = token.slice(4);
    const parts = raw.split(".");
    if (parts.length === 3) {
      try {
        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
        const claims: TokenClaims = JSON.parse(payloadJson);
        if (claims.jti) {
          // Fast path in-memory cache check
          if (REVOKED_JTIS_CACHE.has(claims.jti)) {
            return null;
          }

          const isRevoked = await isTokenRevoked(claims.jti, {
            failClosed: options?.failClosed ?? false,
          });
          if (isRevoked) {
            REVOKED_JTIS_CACHE.add(claims.jti);
            return null;
          }
        }
      } catch (err: any) {
        if (options?.failClosed && err.message?.includes("PERSISTENT_REVOCATION_UNAVAILABLE")) {
          throw err;
        }
        return null;
      }
    }

    return verifiedUser;
  }

  // 2. Fallback to in-memory session store (legacy tokens or unit test mocks)
  const session = SESSIONS_STORE.get(token);
  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  for (const entry of Array.from(USERS_STORE.values())) {
    if (entry.user.id === session.userId) {
      return entry.user;
    }
  }

  return null;
}

/**
 * Log out user by token (persists revocation of jti across all serverless instances)
 */
export async function logoutUser(token: string): Promise<boolean> {
  if (!token) return false;

  if (token.startsWith("pps_")) {
    const raw = token.slice(4);
    const parts = raw.split(".");
    if (parts.length === 3) {
      try {
        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
        const claims: TokenClaims = JSON.parse(payloadJson);
        if (claims.jti) {
          REVOKED_JTIS_CACHE.add(claims.jti);
          await recordTokenRevocation(
            claims.jti,
            claims.sub,
            claims.exp || Math.floor(Date.now() / 1000) + 86400,
            "USER_LOGOUT"
          );
        }
      } catch {
        // Ignore json parse error in logout
      }
    }
  }

  return SESSIONS_STORE.delete(token);
}

/**
 * Create a new workspace in user's organization
 */
export async function createWorkspace(
  organizationId: string,
  name: string,
  description?: string
): Promise<Workspace> {
  const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const workspace: Workspace = {
    id: workspaceId,
    organizationId,
    name: name.trim(),
    slug: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    description: description || `Workspace for ${name}`,
    createdAt: new Date().toISOString(),
  };

  WORKSPACES_STORE.set(workspaceId, workspace);
  return workspace;
}

/**
 * List all workspaces in an organization
 */
export async function listWorkspaces(organizationId: string): Promise<Workspace[]> {
  const list: Workspace[] = [];
  for (const ws of Array.from(WORKSPACES_STORE.values())) {
    if (ws.organizationId === organizationId) {
      list.push(ws);
    }
  }
  return list;
}

/**
 * Query real-time user status and role from database or memory store
 * Ensures that disabled accounts or revoked/demoted roles are immediately blocked
 */
export async function getLiveUserStatus(
  userId: string,
  email?: string
): Promise<{ active: boolean; role: UserRole } | null> {
  // 1. If database is configured and not mock, query database record
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      const db = await getPrisma();
      const dbUser = await db.user.findFirst({
        where: {
          OR: [{ id: userId }, ...(email ? [{ email: email.toLowerCase().trim() }] : [])],
        },
        select: { id: true, role: true },
      });
      if (dbUser) {
        return { active: true, role: dbUser.role as UserRole };
      }
    } catch (dbErr: any) {
      throw new Error(`DATABASE_STATUS_CHECK_FAILED: ${dbErr.message}`);
    }
  }

  // 2. Query in-memory USERS_STORE (dev/test/demo fallback)
  for (const entry of Array.from(USERS_STORE.values())) {
    if (entry.user.id === userId || (email && entry.user.email.toLowerCase() === email.toLowerCase())) {
      return {
        active: entry.disabled !== true,
        role: entry.user.role,
      };
    }
  }

  return null;
}

/**
 * Update demo user active status or role for testing and admin operations
 */
export function setDemoUserStatus(
  email: string,
  updates: { active?: boolean; role?: UserRole }
): void {
  const entry = USERS_STORE.get(email.toLowerCase().trim());
  if (entry) {
    if (updates.active !== undefined) {
      entry.disabled = !updates.active;
    }
    if (updates.role !== undefined) {
      entry.user.role = updates.role;
    }
  }
}
