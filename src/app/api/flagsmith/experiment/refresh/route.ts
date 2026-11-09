import { NextResponse } from "next/server";
import { refreshFlagsmithExperimentResults } from "@/lib/flagsmith/experimentation-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const flag = body.featureFlagName || "checkout_experience";

    const refreshed = await refreshFlagsmithExperimentResults(flag);
    return NextResponse.json({
      success: true,
      refreshedAt: new Date().toISOString(),
      experiment: refreshed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

