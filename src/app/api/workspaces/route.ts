import { NextResponse } from "next/server";
import {
  createWorkspace,
  listWorkspaces,
  WorkspaceInputSchema,
  getUserFromToken,
} from "@/lib/auth/auth-service";

function getSession(request: Request): { token: string | null; cookieAuth: boolean } {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieToken = cookieHeader.split("; ").find((value) => value.startsWith("pulsepilot_session="))?.split("=")[1];
  return { token: bearer || cookieToken || null, cookieAuth: Boolean(!bearer && cookieToken) };
}

function csrfFailure(request: Request): boolean {
  const session = getSession(request);
  if (!session.cookieAuth) return false;
  const source = request.headers.get("origin") || request.headers.get("referer");
  const host = request.headers.get("host");
  if (!source || !host) return true;
  try { return new URL(source).host !== host; } catch { return true; }
}

async function authenticatedUser(request: Request) {
  const { token } = getSession(request);
  if (!token) return null;
  return getUserFromToken(token, {
    checkRevocation: true,
    failClosed: process.env.NODE_ENV === "production",
  }).catch(() => null);
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const databaseConfigured = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock"));
    if (databaseConfigured && !user) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const requestedOrg = new URL(request.url).searchParams.get("organizationId");
    if (user && requestedOrg && requestedOrg !== user.organizationId) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    const organizationId = user?.organizationId || "org_acme_growth";
    const workspaces = await listWorkspaces(organizationId);
    return NextResponse.json({ success: true, total: workspaces.length, workspaces });
  } catch {
    return NextResponse.json({ success: false, error: "SESSION_VALIDATION_FAILED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    if (csrfFailure(request)) {
      return NextResponse.json({ success: false, error: "CSRF_DETECTED" }, { status: 403 });
    }
    const user = await authenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (user.role === "VIEWER") {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }
    const input = WorkspaceInputSchema.parse(await request.json());
    const workspace = await createWorkspace(user.organizationId, input.name, input.description);
    return NextResponse.json({
      success: true,
      workspace,
      message: "Workspace '" + workspace.name + "' created successfully with isolated flag scope.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.errors?.[0]?.message || "INVALID_WORKSPACE_REQUEST" },
      { status: error.errors ? 400 : 500 }
    );
  }
}
