import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  registerUser,
  registerUserWithId,
  RegisterInputSchema,
} from "@/lib/auth/auth-service";
import { prisma } from "@/lib/db/prisma";

/**
 * Supabase Auth + Prisma Application Profile Registration Endpoint
 *
 * Architecture:
 * 1. Supabase Auth is the single source of truth for authentication credentials.
 * 2. On successful auth account creation, obtain the authenticated user UUID.
 * 3. Maintain a 1:1 relationship with public.users via the Supabase Auth user ID.
 * 4. Create or link the corresponding Organization and Workspace.
 * 5. Handle duplicate registrations and database transaction failures gracefully.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = RegisterInputSchema.parse(body);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let authUserId: string | null = null;
    let authSource: "supabase_auth" | "in_memory_fallback" = "in_memory_fallback";

    // 1. Supabase Auth Account Creation (Source of Truth)
    if (supabaseUrl && (serviceRoleKey || anonKey)) {
      try {
        if (serviceRoleKey && serviceRoleKey !== "mock") {
          // Server-Side Admin Client (Pre-confirms email and sets metadata)
          const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });

          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: input.email,
            password: input.password,
            email_confirm: true,
            user_metadata: {
              fullName: input.fullName,
              organizationName: input.organizationName,
            },
          });

          if (error) {
            const isDuplicate =
              error.message?.toLowerCase().includes("already registered") ||
              error.message?.toLowerCase().includes("already exists") ||
              error.status === 422;

            return NextResponse.json(
              {
                success: false,
                error: isDuplicate
                  ? "An account with this email address already exists."
                  : error.message,
              },
              { status: isDuplicate ? 409 : 400 }
            );
          }

          authUserId = data.user?.id || null;
          authSource = "supabase_auth";
        } else if (anonKey && anonKey !== "mock") {
          // Public Client Fallback
          const supabase = createClient(supabaseUrl, anonKey);
          const { data, error } = await supabase.auth.signUp({
            email: input.email,
            password: input.password,
            options: {
              data: {
                fullName: input.fullName,
                organizationName: input.organizationName,
              },
            },
          });

          if (error) {
            const isDuplicate =
              error.message?.toLowerCase().includes("already registered") ||
              error.message?.toLowerCase().includes("already exists") ||
              error.status === 422;

            return NextResponse.json(
              {
                success: false,
                error: isDuplicate
                  ? "An account with this email address already exists."
                  : error.message,
              },
              { status: isDuplicate ? 409 : 400 }
            );
          }

          authUserId = data.user?.id || null;
          authSource = "supabase_auth";
        }
      } catch (authErr: any) {
        console.warn("[Auth Registration] Supabase Auth connection skipped/failed:", authErr.message);
      }
    }

    // 2. Prisma Database Profile Persistence (public.users & public.organizations)
    if (authUserId && process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
      try {
        const slug = `${input.organizationName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .slice(0, 25)}-${Date.now().toString(36).slice(-4)}`;

        const organization = await prisma.organization.create({
          data: {
            name: input.organizationName.trim(),
            slug,
          },
        });

        await prisma.user.upsert({
          where: { id: authUserId },
          update: {
            fullName: input.fullName.trim(),
            email: input.email.toLowerCase().trim(),
          },
          create: {
            id: authUserId,
            email: input.email.toLowerCase().trim(),
            fullName: input.fullName.trim(),
            role: "ADMIN",
            organizationId: organization.id,
          },
        });
      } catch (dbErr: any) {
        console.warn(
          "[Auth Registration] Prisma user profile creation warning (continuing session sync):",
          dbErr.message
        );
      }
    }

    // 3. Application Session & Workspace State Sync
    const result = authUserId
      ? await registerUserWithId(input, authUserId)
      : await registerUser(input);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const response = NextResponse.json({
      success: true,
      authSource,
      user: result.user,
      token: result.token,
      message: `Account created successfully for ${result.user?.fullName}.`,
    });

    response.cookies.set("pulsepilot_session", result.token || "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
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
