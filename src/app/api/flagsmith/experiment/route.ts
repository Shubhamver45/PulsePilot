import { NextResponse } from "next/server";
import { getFlagsmithExperimentResults } from "@/lib/flagsmith/experimentation-service";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const user = await getAuthenticatedApplicationUser(request);
  if (!user) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const flag = searchParams.get("flag") || "checkout_experience";

  const experiment = await prisma.experiment.findFirst({
    where: {
      flagsmithFeatureName: flag,
      project: { organizationId: user.organizationId },
    },
  });
  if (!experiment) {
    return NextResponse.json({ error: "EXPERIMENT_NOT_FOUND" }, { status: 404 });
  }

  const results = await getFlagsmithExperimentResults(flag);
  if (!results) {
    return NextResponse.json(
      { error: "EXPERIMENT_SCORECARD_UNAVAILABLE", message: "The experiment scorecard could not be read from persisted telemetry." },
      { status: 503 }
    );
  }

  return NextResponse.json(results);
}

/**
 * Experiment creation has one canonical path so Flagsmith keyed MV options,
 * PostgreSQL variants, and the audit record are created as a single governed
 * workflow. The older in-memory experiment creator is intentionally disabled.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedApplicationUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "EDITOR") {
    return NextResponse.json({ success: false, error: "INSUFFICIENT_PERMISSIONS" }, { status: 403 });
  }

  return NextResponse.json({
    success: false,
    error: "CANONICAL_PROVISIONING_ENDPOINT_REQUIRED",
    message: "Use POST /api/experiments/create. That endpoint creates keyed multivariate options in Flagsmith, persists the experiment and variants transactionally, and records the verified operator in the audit log.",
    canonicalEndpoint: "/api/experiments/create",
  }, { status: 410 });
}
