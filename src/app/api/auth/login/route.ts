import { NextResponse } from "next/server";
import { LoginInputSchema, loginUser } from "@/lib/auth/auth-service";
import { getSupabasePublicClient } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/db/prisma";

const secureCookie = process.env.NODE_ENV === "production";

function setSessionCookies(response: NextResponse, accessToken: string, refreshToken: string, expiresIn: number) {
  response.cookies.set("pulsepilot_session", accessToken, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: Math.max(60, expiresIn),
    path: "/",
  });
  response.cookies.set("pulsepilot_refresh_token", refreshToken, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function POST(request: Request) {
  try {
    const input = LoginInputSchema.parse(await request.json());

    // Local-only compatibility; hosted deployments must use verified Supabase Auth.
    if (
      process.env.NODE_ENV !== "production" &&
      (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    ) {
      const legacy = await loginUser(input);
      if (!legacy.success || !legacy.user || !legacy.token) {
        return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
      }
      const response = NextResponse.json({ success: true, user: legacy.user, authSource: "local_development" });
      response.cookies.set("pulsepilot_session", legacy.token, {
        httpOnly: true, secure: false, sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/",
      });
      return response;
    }

    const supabase = getSupabasePublicClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password, or the email address has not been confirmed." },
        { status: 401 }
      );
    }

    const profile = await prisma.user.findUnique({
      where: { id: data.user.id },
      include: { organization: true },
    });

    if (!profile || !profile.organization) {
      // Do not create an implicit admin profile during login.
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.json({
        success: false,
        error: "Your account is authenticated but has no PulsePilot workspace profile. Contact the workspace administrator.",
      }, { status: 403 });
    }

    const user = {
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

    const response = NextResponse.json({
      success: true,
      user,
      authSource: "supabase_auth",
      message: `Welcome back, ${user.fullName}.`,
    });
    setSessionCookies(response, data.session.access_token, data.session.refresh_token, data.session.expires_in);
    return response;
  } catch (error: any) {
    const message = error?.issues?.[0]?.message || error?.message || "Login failed.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
