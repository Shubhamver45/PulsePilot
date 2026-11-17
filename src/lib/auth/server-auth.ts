import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db/prisma";

export type ApplicationRole = "ADMIN" | "EDITOR" | "VIEWER";

export interface AuthenticatedApplicationUser {
  id: string;
  email: string;
  fullName: string;
  role: ApplicationRole;
  organizationId: string;
  organizationName: string;
  activeWorkspaceId: string;
  activeWorkspaceName: string;
  createdAt: string;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function getSupabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || anonKey === "mock") {
    throw new Error("Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function getAccessTokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim() || null;
  }
  return readCookie(request, "pulsepilot_session");
}

export function getRefreshTokenFromRequest(request: Request): string | null {
  return readCookie(request, "pulsepilot_refresh_token");
}

/**
 * Validate the Supabase access token against the Auth server, then resolve
 * the application's role and organization from the trusted public.users row.
 * User-editable user_metadata is deliberately never used for authorization.
 */
export async function getAuthenticatedApplicationUser(
  request: Request
): Promise<AuthenticatedApplicationUser | null> {
  const accessToken = getAccessTokenFromRequest(request);
  if (!accessToken) {
    // Development-only compatibility for local mock runs; never enabled on Vercel.
    if (process.env.NODE_ENV !== "production") {
      const legacyToken = readCookie(request, "pulsepilot_session");
      if (legacyToken) {
        try {
          const legacy = await import("@/lib/auth/auth-service");
          const user = await legacy.getUserFromToken(legacyToken);
          if (user) return user as AuthenticatedApplicationUser;
        } catch {
          // Continue to unauthenticated response.
        }
      }
    }
    return null;
  }

  const supabase = getSupabasePublicClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const profile = await prisma.user.findUnique({
    where: { id: data.user.id },
    include: { organization: true },
  });

  if (!profile || !profile.organization) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName || profile.email,
    role: profile.role,
    organizationId: profile.organizationId,
    organizationName: profile.organization.name,
    activeWorkspaceId: profile.organizationId,
    activeWorkspaceName: profile.organization.name,
    createdAt: profile.createdAt.toISOString(),
  };
}
