import { NextResponse } from "next/server";
import { getAccessTokenFromRequest, getRefreshTokenFromRequest, getSupabasePublicClient } from "@/lib/auth/server-auth";

export async function POST(request: Request) {
  const accessToken = getAccessTokenFromRequest(request);
  const refreshToken = getRefreshTokenFromRequest(request);

  if (accessToken && refreshToken) {
    try {
      const supabase = getSupabasePublicClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!sessionError) {
        // Revoke refresh sessions at Supabase, not only the current process cookie.
        await supabase.auth.signOut({ scope: "global" });
      }
    } catch (error) {
      console.warn("[Auth Logout] Supabase session revocation failed:", error);
    }
  }

  const response = NextResponse.json({ success: true, message: "Signed out." });
  response.cookies.delete("pulsepilot_session");
  response.cookies.delete("pulsepilot_refresh_token");
  return response;
}
