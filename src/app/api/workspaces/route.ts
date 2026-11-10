import { NextResponse } from "next/server";
import {
  createWorkspace,
  listWorkspaces,
  WorkspaceInputSchema,
} from "@/lib/auth/auth-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId") || "org_acme_growth";
  const workspaces = await listWorkspaces(organizationId);

  return NextResponse.json({
    success: true,
    total: workspaces.length,
    workspaces,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = WorkspaceInputSchema.parse(body);
    const orgId = body.organizationId || "org_acme_growth";

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
