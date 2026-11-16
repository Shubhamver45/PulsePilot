import { NextResponse } from "next/server";
import { ExperimentStrategySchema } from "@/lib/ai/schemas";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";
import { getUserFromToken } from "@/lib/auth/auth-service";
import {
  createExperimentProposal,
  approveAndExecuteProposal,
} from "@/lib/flagsmith/proposal-service";

export async function POST(request: Request) {
  try {
    // 1. Session Token Extraction
    const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieToken = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("pulsepilot_session="))
      ?.split("=")[1];

    const isCookieAuth = Boolean(!authHeader && cookieToken);
    const token = authHeader || cookieToken;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHORIZED",
          message:
            "Authentication required to create experiments. Please provide a valid session cookie or Bearer token.",
        },
        { status: 401 }
      );
    }

    // 2. CSRF Protection for Cookie-Authenticated Requests
    if (isCookieAuth) {
      const origin = request.headers.get("origin");
      const referer = request.headers.get("referer");
      const host = request.headers.get("host");

      if (!origin && !referer) {
        return NextResponse.json(
          {
            success: false,
            error: "CSRF_DETECTED",
            message: "Missing Origin or Referer header on cookie-authenticated request.",
          },
          { status: 403 }
        );
      }

      const source = origin || referer || "";
      if (source && host) {
        try {
          const sourceUrl = new URL(source.startsWith("http") ? source : `https://${source}`);
          const sourceHost = sourceUrl.host;
          const isLocal = (h: string) => h.startsWith("localhost") || h.startsWith("127.0.0.1");

          if (sourceHost !== host && !(isLocal(sourceHost) && isLocal(host))) {
            return NextResponse.json(
              {
                success: false,
                error: "CSRF_DETECTED",
                message: "Cross-site request forgery protection triggered: origin mismatch.",
              },
              { status: 403 }
            );
          }
        } catch {
          return NextResponse.json(
            {
              success: false,
              error: "CSRF_DETECTED",
              message: "Invalid Origin or Referer header format.",
            },
            { status: 403 }
          );
        }
      }
    }

    // 3. Authenticate User & Validate Revocation (Fail-Closed)
    let user;
    try {
      user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
    } catch (err: any) {
      if (err.message?.includes("PERSISTENT_REVOCATION_UNAVAILABLE")) {
        return NextResponse.json(
          {
            success: false,
            error: "AUTH_PERSISTENCE_ERROR",
            message:
              "Experiment creation blocked: session revocation status cannot be verified against persistent storage.",
          },
          { status: 500 }
        );
      }
      throw err;
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_SESSION",
          message: "Session is invalid, expired, or has been revoked. Please sign in again.",
        },
        { status: 401 }
      );
    }

    // 4. Enforce Strict RBAC (Only ADMIN and EDITOR roles can create experiments)
    if (user.role !== "ADMIN" && user.role !== "EDITOR") {
      return NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN",
          message: `Role '${user.role}' is not authorized to create experiments or provision feature flags. Only ADMIN and EDITOR roles have write access.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    let proposalId = body.proposalId;
    let configurationHash = body.configurationHash;
    let targetEnvironment = body.targetEnvironment || "development";

    // 5. If called directly with a strategy, generate proposal on-the-fly
    if (!proposalId && body.strategy) {
      const parsedStrategy = ExperimentStrategySchema.parse(body.strategy);
      const proposal = await createExperimentProposal(parsedStrategy, user, targetEnvironment);
      proposalId = proposal.proposalId;
      configurationHash = proposal.configurationHash;
    }

    if (!proposalId || !configurationHash) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_PROPOSAL_PAYLOAD",
          message: "A valid proposalId and configurationHash (or strategy) is required for execution.",
        },
        { status: 400 }
      );
    }

    // 6. Execute Human-Approved Proposal against Flagsmith with Read-After-Write Verification
    const executionResult = await approveAndExecuteProposal(
      proposalId,
      configurationHash,
      user,
      {
        confirmedProductionTarget: body.confirmedProductionTarget,
      }
    );

    // 7. Mirror to local fallback store for offline tests
    if (body.strategy) {
      const allVariants = [
        body.strategy.control_variant,
        ...body.strategy.treatment_variants,
      ];
      flagsmithMockStore.setFlag({
        name: executionResult.flagsmithFeatureName,
        enabled: true,
        type: "MULTIVARIATE",
        value: JSON.stringify(body.strategy.control_variant.featureValue),
        multivariateOptions: allVariants.map((v: any) => ({
          key: v.key,
          trafficAllocation: v.trafficAllocation,
          value: JSON.stringify(v.featureValue),
        })),
      });
    }

    return NextResponse.json({
      ...executionResult,
      success: true,
    });
  } catch (error: any) {
    console.error("Experiment creation/execution failed:", error);
    const isAuthOrForbidden =
      error.message?.includes("not authorized") || error.message?.includes("expired");
    const isTamper = error.message?.includes("SECURITY VIOLATION");

    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute experiment proposal",
        details: error.message,
      },
      { status: isTamper ? 409 : isAuthOrForbidden ? 403 : 400 }
    );
  }
}
