import { NextResponse } from "next/server";
import { logoutUser } from "@/lib/auth/auth-service";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")?.replace("Bearer ", "") || "";
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieToken = cookieHeader
    .split("; ")
    .find((c) => c.startsWith("pulsepilot_session="))
    ?.split("=")[1];

  const token = authHeader || cookieToken;
  if (token) {
    await logoutUser(token);
  }

  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully.",
  });

  response.cookies.set("pulsepilot_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

