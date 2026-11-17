import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  loginUser,
  LoginInputSchema,
  createSignedToken,
  AuthUser,
  UserRole,
} from "@/lib/auth/auth-service";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const input = LoginInputSchema.parse(await request.json());
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const isProduction = process.env.NODE_ENV === "production";

    if (!supabaseUrl || !anonKey || anonKey === "mock") {
      if (isProduction) {
        return NextResponse.json({ success: false, error: "AUTH_PROVIDER_UNAVAILABLE" }, { status: 503 });
      }
      const demo = await loginUser(input);
      if (!demo.success || !demo.user) {
        return NextResponse.json({ success: false, error: demo.error }, { status: 401 });
      }
      const response = NextResponse.json({ success: true, user: demo.user, token: demo.token });
      response.cookies.set("pulsepilot_session", demo.token || "", {
        httpOnly: true, secure: false, sameSite: "lax", maxAge: 60 * 60 * 24, path: "/",
      });
      return response;
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.user) {
      return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
    }

    // A database provisioned profile is the source of organization membership and role.
    // User-editable Supabase user_metadata is never accepted as an authorization claim.
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock")) {
      return NextResponse.json({ success: false, error: "ACCOUNT_PROFILE_UNAVAILABLE" }, { status: 503 });
    }

    let dbUser: any;
    try {
      dbUser = await prisma.user.findFirst({
        where: { id: data.user.id, email: input.email.toLowerCase().trim() },
        include: { organization: true },
      });
    } catch {
      return NextResponse.json({ success: false, error: "ACCOUNT_PROFILE_LOOKUP_FAILED" }, { status: 503 });
    }

    if (!dbUser?.organizationId || !dbUser.organization) {
      return NextResponse.json({ success: false, error: "ACCOUNT_NOT_PROVISIONED" }, { status: 403 });
    }
    const role = dbUser.role as UserRole;
    if (!["ADMIN", "EDITOR", "VIEWER"].includes(role)) {
      return NextResponse.json({ success: false, error: "INVALID_ACCOUNT_ROLE" }, { status: 403 });
    }

    const user: AuthUser = {
      id: data.user.id,
      email: (data.user.email || input.email).toLowerCase().trim(),
      fullName: dbUser.fullName || data.user.email?.split("@")[0] || "PulsePilot User",
      role,
      organizationId: dbUser.organizationId,
      organizationName: dbUser.organization.name,
      activeWorkspaceId: "ws_default",
      activeWorkspaceName: "Workspace",
      createdAt: dbUser.createdAt?.toISOString() || new Date().toISOString(),
    };

    const token = createSignedToken(user);
    const response = NextResponse.json({
      success: true, user, token, message: "Welcome back, " + user.fullName + "!",
    });
    response.cookies.set("pulsepilot_session", token, {
      httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 60 * 60 * 24, path: "/",
    });
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.errors?.[0]?.message || "INVALID_LOGIN_REQUEST" },
      { status: 400 }
    );
  }
}
