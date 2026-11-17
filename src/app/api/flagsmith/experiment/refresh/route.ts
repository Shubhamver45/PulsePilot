import { NextResponse } from "next/server";
import { refreshFlagsmithExperimentResults } from "@/lib/flagsmith/experimentation-service";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedApplicationUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    }
    if (user.role === "VIEWER") {
      return NextResponse.json({ success: false, error: "INSUFFICIENT_PERMISSIONS" }, { status: 403 });
    }

    const body = await request.json();
    const flag = typeof body.featureFlagName === "string" ? body.featureFlagName : "checkout_experience";
    const experiment = await prisma.experiment.findFirst({
      where: {
        flagsmithFeatureName: flag,
        project: { organizationId: user.organizationId },
      },
    });
    if (!experiment) {
      return NextResponse.json({ success: false, error: "EXPERIMENT_NOT_FOUND" }, { status: 404 });
    }

    const refreshed = await refreshFlagsmithExperimentResults(flag);
    if (!refreshed) {
      return NextResponse.json({
        success: false,
        error: "EXPERIMENT_REFRESH_UNAVAILABLE",
        message: "The experiment scorecard could not be refreshed from persisted telemetry.",
      }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      refreshedAt: new Date().toISOString(),
      experiment: refreshed,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Experiment refresh failed." }, { status: 400 });
  }
}
