import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { RegisterInputSchema } from "@/lib/auth/auth-service";
import { getSupabasePublicClient } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/db/prisma";

const secureCookie = process.env.NODE_ENV === "production";

function setSessionCookies(response: NextResponse, accessToken: string, refreshToken: string, expiresIn: number) {
  response.cookies.set("pulsepilot_session", accessToken, {
    httpOnly: true, secure: secureCookie, sameSite: "lax",
    maxAge: Math.max(60, expiresIn), path: "/",
  });
  response.cookies.set("pulsepilot_refresh_token", refreshToken, {
    httpOnly: true, secure: secureCookie, sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, path: "/",
  });
}

export async function POST(request: Request) {
  try {
    const input = RegisterInputSchema.parse(await request.json());
    const supabase = getSupabasePublicClient();
    const normalizedEmail = input.email.trim().toLowerCase();

    let authUserId: string | null = null;
    let session: { access_token: string; refresh_token: string; expires_in: number } | null = null;

    // When a server-only service key is configured, create a confirmed account
    // and then establish a normal user session with the public Auth client.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey && serviceRoleKey !== "mock") {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { data, error } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          fullName: input.fullName.trim(),
          organizationName: input.organizationName.trim(),
        },
      });
      if (error || !data.user) {
        const duplicate = /already|exists|registered/i.test(error?.message || "");
        return NextResponse.json({
          success: false,
          error: duplicate ? "An account with this email address already exists." : (error?.message || "Supabase could not create the account."),
        }, { status: duplicate ? 409 : 400 });
      }

      authUserId = data.user.id;
      const signedIn = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: input.password,
      });
      if (signedIn.error || !signedIn.data.session) {
        // Do not return a fake application session if Supabase did not issue one.
        return NextResponse.json({
          success: false,
          error: "Account created but a Supabase session could not be established. Sign in from the login page.",
          accountCreated: true,
        }, { status: 503 });
      }
      session = signedIn.data.session;
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: input.password,
        options: {
          data: {
            fullName: input.fullName.trim(),
            organizationName: input.organizationName.trim(),
          },
        },
      });

      if (error || !data.user) {
        const duplicate = /already|exists|registered/i.test(error?.message || "");
        return NextResponse.json({
          success: false,
          error: duplicate ? "An account with this email address already exists." : (error?.message || "Supabase could not create the account."),
        }, { status: duplicate ? 409 : 400 });
      }
      authUserId = data.user.id;
      session = data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
          }
        : null;
    }

    if (!authUserId) {
      return NextResponse.json({ success: false, error: "Supabase did not return a user identifier." }, { status: 502 });
    }

    let profile;
    try {
      profile = await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { id: authUserId! },
          include: { organization: true },
        });
        if (existing?.organization) {
          const existingProject = await tx.project.findFirst({
            where: { organizationId: existing.organizationId },
          });
          if (!existingProject) {
            await tx.project.create({
              data: {
                name: `${existing.organization.name} Main Project`,
                organizationId: existing.organizationId,
                flagsmithProjectId: process.env.FLAGSMITH_PROJECT_ID || undefined,
              },
            });
          }
          return existing;
        }

        const slugBase = input.organizationName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 32) || "workspace";
        const organization = await tx.organization.create({
          data: {
            name: input.organizationName.trim(),
            slug: `${slugBase}-${randomUUID().slice(0, 8)}`,
          },
        });

        await tx.project.create({
          data: {
            name: `${input.organizationName.trim()} Main Project`,
            organizationId: organization.id,
            flagsmithProjectId: process.env.FLAGSMITH_PROJECT_ID || undefined,
          },
        });

        return tx.user.create({
          data: {
            id: authUserId!,
            email: normalizedEmail,
            fullName: input.fullName.trim(),
            role: "ADMIN",
            organizationId: organization.id,
          },
          include: { organization: true },
        });
      });
    } catch (dbError: any) {
      console.error("[Auth Registration] Profile persistence failed:", dbError?.message || dbError);
      return NextResponse.json({
        success: false,
        error: "Your Supabase account was created, but the PulsePilot workspace profile could not be saved. Contact support before attempting another registration.",
        accountCreated: true,
      }, { status: 503 });
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
      authenticated: Boolean(session),
      requiresEmailConfirmation: !session,
      message: session
        ? `Workspace created for ${user.fullName}.`
        : "Account created. Confirm your email address, then sign in to open your workspace.",
    }, { status: session ? 201 : 202 });

    if (session) {
      setSessionCookies(response, session.access_token, session.refresh_token, session.expires_in);
    }
    return response;
  } catch (error: any) {
    const message = error?.issues?.[0]?.message || error?.message || "Registration failed.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
