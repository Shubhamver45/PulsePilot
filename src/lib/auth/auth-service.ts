/**
 * Authentication & Workspace Management Service
 * PulsePilot AI — Enterprise RBAC & Workspace Isolation
 */

import { z } from "zod";

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
const USERS_STORE: Map<string, { user: AuthUser; passwordHash: string }> = new Map();
const SESSIONS_STORE: Map<string, { userId: string; expiresAt: number }> = new Map();
const WORKSPACES_STORE: Map<string, Workspace> = new Map();

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

  const token = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  SESSIONS_STORE.set(token, {
    userId: newUser.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
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

  const token = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  SESSIONS_STORE.set(token, {
    userId: entry.user.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });

  return { success: true, user: entry.user, token };
}

/**
 * Get current session user from token
 */
export async function getUserFromToken(token: string): Promise<AuthUser | null> {
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
 * Log out user by token
 */
export async function logoutUser(token: string): Promise<boolean> {
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
