import { NextResponse } from "next/server";
import { ExperimentStrategySchema } from "@/lib/ai/schemas";
import { getUserFromToken } from "@/lib/auth/auth-service";
import { createExperimentProposal } from "@/lib/flagsmith/proposal-service";

function getSession(request: Request): { token: string | null; cookieAuth: boolean } {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  const cookie = (request.headers.get("cookie") || "").split("; ").find((p) => p.startsWith("pulsepilot_session="))?.split("=")[1];
  return { token: bearer || cookie || null, cookieAuth: Boolean(!bearer && cookie) };
}

function csrfFailure(request: Request): boolean {
  const session = getSession(request);
  if (!session.cookieAuth) return false;
  const source = request.headers.get("origin") || request.headers.get("referer");
  const host = request.headers.get("host");
  if (!source || !host) return true;
  try { return new URL(source).host !== host; } catch { return true; }
}

export async function POST(request: Request) {
  try {
    if (csrfFailure(request)) return NextResponse.json({ success: false, error: "CSRF_DETECTED" }, { status: 403 });
    const session = getSession(request);
    const databaseConfigured = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock"));
    const previewDemoMode = process.env.VERCEL_ENV === "preview" && process.env.NEXT_PUBLIC_APP_ENV === "preview";
    let user = session.token
      ? await getUserFromToken(session.token, { checkRevocation: true, failClosed: databaseConfigured })
      : null;

    // Guest proposals exist only in isolated offline demo mode.
    if (!user && (databaseConfigured || (process.env.NODE_ENV === "production" && !previewDemoMode))) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (!user) {
      user = {
        id: "usr_guest", email: "guest@pulsepilot.demo", fullName: "Demo Guest",
        role: "VIEWER" as const, organizationId: "org_acme_growth",
        organizationName: "PulsePilot Demo", activeWorkspaceId: "ws_demo",
        activeWorkspaceName: "Demo Workspace", createdAt: new Date().toISOString(),
      };
    }
    if (databaseConfigured && user.role === "VIEWER") {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await request.json();
    const strategy = ExperimentStrategySchema.parse(body.strategy);
    const targetEnvironment = body.targetEnvironment || "development";
    const proposal = await createExperimentProposal(strategy, user, targetEnvironment);
    return NextResponse.json({
      success: true, proposal,
      message: "Experiment proposal '" + proposal.proposalId + "' generated. Awaiting authenticated human approval.",
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false, error: "Failed to generate experiment proposal", details: error.message,
    }, { status: error.statusCode || 400 });
  }
}
