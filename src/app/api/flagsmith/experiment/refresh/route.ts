import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth/auth-service";
import { refreshFlagsmithExperimentResults } from "@/lib/flagsmith/experimentation-service";

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

async function requireMutationUser(request: Request) {
  if (csrfFailure(request)) return { user: null, error: "CSRF_DETECTED", status: 403 as const };
  const { token } = getSession(request);
  if (!token) return { user: null, error: "UNAUTHORIZED", status: 401 as const };
  const user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
  if (!user) return { user: null, error: "INVALID_SESSION", status: 401 as const };
  if (user.role !== "ADMIN" && user.role !== "EDITOR") {
    return { user: null, error: "FORBIDDEN", status: 403 as const };
  }
  return { user, error: null, status: 200 as const };
}


export async function POST(request: Request) {
  try {
    const auth = await requireMutationUser(request);
    if (!auth.user) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const body = await request.json();
    const flag = body.featureFlagName || "checkout_experience";
    const refreshed = await refreshFlagsmithExperimentResults(flag, auth.user.organizationId);
    if (!refreshed) return NextResponse.json({ success: false, error: "EXPERIMENT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true, refreshedAt: new Date().toISOString(), experiment: refreshed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "EXPERIMENT_REFRESH_FAILED" }, { status: 503 });
  }
}
