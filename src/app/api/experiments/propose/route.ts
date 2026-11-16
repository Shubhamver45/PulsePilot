import { NextResponse } from "next/server";
import { ExperimentStrategySchema } from "@/lib/ai/schemas";
import { getUserFromToken } from "@/lib/auth/auth-service";
import { createExperimentProposal } from "@/lib/flagsmith/proposal-service";

export async function POST(request: Request) {
  try {
    // 1. Session Token Extraction
    const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieToken = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("pulsepilot_session="))
      ?.split("=")[1];

    const token = authHeader || cookieToken;

    // 2. Authenticate User (Fail-Closed Revocation Check) or Fallback to Demo Guest
    let user = null;
    if (token) {
      user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
    }

    if (!user) {
      // In unauthenticated demo/evaluation mode, generate proposal under Guest identity
      user = {
        id: "usr_guest",
        email: "guest@pulsepilot.demo",
        fullName: "Demo Guest",
        role: "VIEWER" as const,
        organizationId: "org_acme_growth",
        organizationName: "PulsePilot Demo",
        activeWorkspaceId: "ws_demo",
        activeWorkspaceName: "Demo Workspace",
        createdAt: new Date().toISOString(),
      };
    }

    const body = await request.json();
    const strategy = ExperimentStrategySchema.parse(body.strategy);
    const targetEnvironment = body.targetEnvironment || "development";

    // 3. Create Proposal with Live Flagsmith Inspection & Cryptographic Hashing
    const proposal = await createExperimentProposal(strategy, user, targetEnvironment);

    return NextResponse.json({
      success: true,
      proposal,
      message: `Experiment proposal '${proposal.proposalId}' generated. Awaiting authenticated human approval.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate experiment proposal",
        details: err.message,
      },
      { status: 400 }
    );
  }
}
