import { NextResponse } from "next/server";
import {
  createWorkspace,
  listWorkspaces,
  WorkspaceInputSchema,
  getUserFromToken,
} from "@/lib/auth/auth-service";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieToken = cookieHeader
    .split("; ")
    .find((c) => c.startsWith("pulsepilot_session="))
    ?.split("=")[1];

  const token = authHeader || cookieToken;
  const user = token ? await getUserFromToken(token).catch(() => null) : null;

  const { searchParams } = new URL(request.url);
  const requestedOrg = searchParams.get("organizationId");

  // Multi-tenant boundary: user is strictly bound to their own organization
  const organizationId = user ? user.organizationId : (requestedOrg || "org_acme_growth");

  if (user && requestedOrg && requestedOrg !== user.organizationId) {
    return NextResponse.json(
      { success: false, error: "FORBIDDEN", message: "Cross-organization workspace access is denied." },
      { status: 403 }
    );
  }

  const workspaces = await listWorkspaces(organizationId);

  return NextResponse.json({
    success: true,
    total: workspaces.length,
    workspaces,
  });
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieToken = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("pulsepilot_session="))
      ?.split("=")[1];

    const token = authHeader || cookieToken;
    const user = token ? await getUserFromToken(token).catch(() => null) : null;

    if (user && user.role === "VIEWER") {
      return NextResponse.json(
        { success: false, error: "FORBIDDEN", message: "VIEWER role is not authorized to create workspaces." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const input = WorkspaceInputSchema.parse(body);
    const orgId = user ? user.organizationId : (body.organizationId || "org_acme_growth");

    const workspace = await createWorkspace(orgId, input.name, input.description);

    return NextResponse.json({
      success: true,
      workspace,
      message: `Workspace '${workspace.name}' created successfully with isolated flag scope.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.errors ? err.errors[0].message : err.message },
      { status: 400 }
    );
  }
}
