import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth/auth-service";

export async function GET(request: Request) {
  // Check authorization header or cookie
  const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieToken = cookieHeader
    .split("; ")
    .find((c) => c.startsWith("pulsepilot_session="))
    ?.split("=")[1];

  const token = authHeader || cookieToken;

  if (!token) {
    // Explicit demo mode: Unauthenticated guest MUST NOT be represented as an authenticated ADMIN
    return NextResponse.json({
      authenticated: false,
      isDemoMode: true,
      user: null,
      guestInfo: {
        id: "usr_guest",
        displayName: "Demo Guest",
        role: "GUEST",
        notice: "Unauthenticated demo mode. Production feature flag mutations require signing in.",
      },
    });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json(
      {
        authenticated: false,
        isDemoMode: true,
        user: null,
        error: "INVALID_SESSION",
        message: "Session is invalid, expired, or has been revoked.",
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    isDemoMode: false,
    user,
  });
}

