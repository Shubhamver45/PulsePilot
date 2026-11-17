import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth/auth-service";
import {
  getFlagsmithExperimentResults,
  createRealFlagsmithExperiment,
  CreateExperimentPayload,
} from "@/lib/flagsmith/experimentation-service";

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


export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const flag = searchParams.get("flag") || "checkout_experience";
    const databaseConfigured = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock"));
    let organizationId: string | undefined;

    if (databaseConfigured) {
      const { token } = getSession(request);
      if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      const user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
      if (!user) return NextResponse.json({ error: "INVALID_SESSION" }, { status: 401 });
      organizationId = user.organizationId;
    }

    const results = await getFlagsmithExperimentResults(flag, undefined, organizationId);
    if (!results) {
      return NextResponse.json({ error: "Experiment not found for this organization." }, { status: 404 });
    }
    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "EXPERIMENT_READ_FAILED" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireMutationUser(request);
    if (!auth.user) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const body: CreateExperimentPayload = await request.json();
    const result = await createRealFlagsmithExperiment(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to create experiment." }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      experiment: result.experiment,
      message: "Experiment '" + body.name + "' created in Flagsmith with feature flag '" + body.featureFlagName + "'.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Invalid experiment payload", details: error.message }, { status: 400 });
  }
}
