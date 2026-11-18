import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { WorkspaceInputSchema } from "@/lib/auth/auth-service";

export async function GET(request: Request) {
  const user = await getAuthenticatedApplicationUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  try {
    const projects = await prisma.project.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      total: projects.length,
      workspaces: projects.map((project) => ({
        id: project.id,
        organizationId: project.organizationId,
        name: project.name,
        slug: project.id,
        description: project.description || "",
        createdAt: project.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("[Workspace API] Failed to list workspace projects:", error?.message || error);
    return NextResponse.json({ success: false, error: "WORKSPACE_LIST_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedApplicationUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Only workspace administrators can create projects." }, { status: 403 });
    }

    const input = WorkspaceInputSchema.parse(await request.json());
    const project = await prisma.project.create({
      data: {
        name: input.name.trim(),
        description: input.description || null,
        organizationId: user.organizationId,
        flagsmithProjectId: process.env.FLAGSMITH_PROJECT_ID || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      workspace: {
        id: project.id,
        organizationId: project.organizationId,
        name: project.name,
        slug: project.id,
        description: project.description || "",
        createdAt: project.createdAt.toISOString(),
      },
      message: `Workspace '${project.name}' created successfully.`,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.issues?.[0]?.message || error?.message || "WORKSPACE_CREATE_FAILED",
    }, { status: 400 });
  }
}
