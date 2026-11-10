import { NextResponse } from "next/server";
import { logoutUser } from "@/lib/auth/auth-service";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "") || "";
  if (token) {
    await logoutUser(token);
  }

  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully.",
  });

  response.cookies.delete("pulsepilot_session");
  return response;
}
