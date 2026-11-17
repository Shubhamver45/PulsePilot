import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    pathname === "/demo-store" ||
    pathname.startsWith("/demo-store/") ||
    pathname === "/auth/callback"
  );
}

function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("pulsepilot_session", accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: Math.max(60, expiresIn),
    path: "/",
  });
  response.cookies.set("pulsepilot_refresh_token", refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/") || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseKey === "mock") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const accessToken = request.cookies.get("pulsepilot_session")?.value;
  const refreshToken = request.cookies.get("pulsepilot_refresh_token")?.value;
  let user = null;
  let refreshedSession: { access_token: string; refresh_token: string; expires_in: number } | null = null;

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error) user = data.user;
  }

  // Refresh the exact HTTP-only token pair issued by /api/auth/login.
  if (!user && refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.user && data.session) {
      user = data.user;
      refreshedSession = data.session;
    }
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("pulsepilot_session");
    response.cookies.delete("pulsepilot_refresh_token");
    return response;
  }

  const response = NextResponse.next();
  if (refreshedSession) {
    setAuthCookies(
      response,
      refreshedSession.access_token,
      refreshedSession.refresh_token,
      refreshedSession.expires_in
    );
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"],
};
