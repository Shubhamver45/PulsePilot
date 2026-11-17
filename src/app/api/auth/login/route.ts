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
    const body = await request.json();
    const input = LoginInputSchema.parse(body);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const isProduction = process.env.NODE_ENV === "production";

    let authenticatedUser: AuthUser | null = null;
    let sessionToken: string | null = null;

    // 1. Supabase Auth Integration (Production Source of Truth)
    if (supabaseUrl && anonKey && anonKey !== "mock") {
      try {
        const supabase = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data, error } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });

        if (error) {
          // If Supabase Auth rejects credentials in production, fail closed
          if (isProduction) {
            return NextResponse.json(
              { success: false, error: "Invalid email or password." },
              { status: 401 }
            );
          }
        } else if (data.user) {
          // Attempt to link to database user profile
          let dbUser = null;
          try {
            if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
              dbUser = await prisma.user.findFirst({
                where: {
                  OR: [{ id: data.user.id }, { email: input.email.toLowerCase().trim() }],
                },
                include: { organization: true },
              });
            }
          } catch {
            // Database lookup error, fallback to user metadata
          }

          const rawRole = (dbUser?.role || data.user.user_metadata?.role || "ADMIN") as string;
          const role: UserRole =
            rawRole === "EDITOR" || rawRole === "VIEWER" ? rawRole : "ADMIN";

          authenticatedUser = {
            id: data.user.id,
            email: input.email.toLowerCase().trim(),
            fullName:
              dbUser?.fullName ||
              data.user.user_metadata?.fullName ||
              input.email.split("@")[0],
            role,
            organizationId: dbUser?.organizationId || "org_acme_growth",
            organizationName: dbUser?.organization?.name || "Acme Growth Inc.",
            activeWorkspaceId: "ws_acme_prod",
            activeWorkspaceName: "Acme Growth (Production)",
            createdAt: dbUser?.createdAt?.toISOString() || new Date().toISOString(),
          };

          sessionToken = createSignedToken(authenticatedUser);
        }
      } catch (sbErr: any) {
        if (isProduction) {
          return NextResponse.json(
            { success: false, error: "Authentication service error. Please try again." },
            { status: 500 }
          );
        }
      }
    }

    // 2. Development / Test Demo Fallback (Non-Production Only)
    if (!authenticatedUser) {
      if (isProduction) {
        return NextResponse.json(
          { success: false, error: "Invalid email or password." },
          { status: 401 }
        );
      }

      const result = await loginUser(input);
      if (!result.success || !result.user) {
        return NextResponse.json({ success: false, error: result.error }, { status: 401 });
      }

      authenticatedUser = result.user;
      sessionToken = result.token || null;
    }

    const response = NextResponse.json({
      success: true,
      user: authenticatedUser,
      token: sessionToken,
      message: `Welcome back, ${authenticatedUser.fullName}!`,
    });

    // Set secure HTTP-only session cookie (24-hour least privilege duration)
    response.cookies.set("pulsepilot_session", sessionToken || "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.errors ? err.errors[0].message : err.message },
      { status: 400 }
    );
  }
}
