import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth/auth-service";
import { executeApprovedProposal } from "@/lib/flagsmith/proposal-service";

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
            "Authentication required to execute experiment proposals. Please provide a valid session cookie or Bearer token.",
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
              "Proposal execution blocked: session revocation status cannot be verified against persistent storage.",
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

    // 4. Enforce Strict RBAC (Only ADMIN and EDITOR roles can execute)
    if (user.role !== "ADMIN" && user.role !== "EDITOR") {
      return NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN",
          message: `Role '${user.role}' is not authorized to execute experiment proposals. Only ADMIN and EDITOR roles have mutation authority.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { proposalId, configurationHash, idempotencyKey, confirmedProductionTarget } = body;

    if (!proposalId || !configurationHash) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_PROPOSAL_PAYLOAD",
          message:
            "A valid proposalId and configurationHash are required to execute an experiment proposal.",
        },
        { status: 400 }
      );
    }

    // 5. STEP 2: Execute Approved Proposal against Flagsmith with Lease & Read-After-Write Verification
    const executionResult = await executeApprovedProposal(
      proposalId,
      configurationHash,
      user,
      {
        idempotencyKey,
        confirmedProductionTarget,
      }
    );

    return NextResponse.json({
      ...executionResult,
      success: true,
    });
  } catch (error: any) {
    console.error("[Proposal Execution Error]:", error);
    const status = error.statusCode || (error.message?.includes("SECURITY VIOLATION") ? 409 : 400);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute experiment proposal",
        details: error.message,
      },
      { status }
    );
  }
}
