import { NextResponse } from "next/server";
import { getAuthenticatedApplicationUser, getRefreshTokenFromRequest, getSupabasePublicClient } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/db/prisma";

function attachCookies(response: NextResponse, accessToken: string, refreshToken: string, expiresIn: number) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("pulsepilot_session", accessToken, {
    httpOnly: true, secure, sameSite: "lax", maxAge: Math.max(60, expiresIn), path: "/",
  });
  response.cookies.set("pulsepilot_refresh_token", refreshToken, {
    httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
  });
}

function profileToResponse(profile: any) {
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

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedApplicationUser(request);
    if (user) {
      return NextResponse.json({ authenticated: true, user });
    }

    const refreshToken = getRefreshTokenFromRequest(request);
    if (refreshToken) {
      try {
        const supabase = getSupabasePublicClient();
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (!error && data.user && data.session) {
          const profile = await prisma.user.findUnique({
            where: { id: data.user.id },
            include: { organization: true },
          });
          if (profile?.organization) {
            const response = NextResponse.json({
              authenticated: true,
              user: profileToResponse(profile),
            });
            attachCookies(response, data.session.access_token, data.session.refresh_token, data.session.expires_in);
            return response;
          }
        }
      } catch (refreshError) {
        console.warn("[Auth] Session refresh failed:", refreshError);
      }
    }

    const response = NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    response.cookies.delete("pulsepilot_session");
    response.cookies.delete("pulsepilot_refresh_token");
    return response;
  } catch (error: any) {
    console.error("[Auth] Failed to resolve session:", error?.message || error);
    return NextResponse.json({ authenticated: false, user: null }, { status: 503 });
  }
}
