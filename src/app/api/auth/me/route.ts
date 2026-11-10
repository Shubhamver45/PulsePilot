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
    // Default to guest/demo product lead if no session is set
    return NextResponse.json({
      authenticated: false,
      user: {
        id: "usr_guest",
        fullName: "Sarah Lin (Demo)",
        email: "sarah@pulsepilot.ai",
        role: "ADMIN",
        organizationName: "Acme Growth Inc.",
        activeWorkspaceName: "Acme Growth (Production)",
      },
    });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user,
  });
}
