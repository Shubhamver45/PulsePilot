import { NextResponse } from "next/server";
import {
  getFlagsmithExperimentResults,
  createRealFlagsmithExperiment,
  CreateExperimentPayload,
} from "@/lib/flagsmith/experimentation-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const flag = searchParams.get("flag") || "checkout_experience";

  const results = await getFlagsmithExperimentResults(flag);
  if (!results) {
    return NextResponse.json(
      { error: `Experiment for flag '${flag}' not found.` },
      { status: 404 }
    );
  }

  return NextResponse.json(results);
}

export async function POST(request: Request) {
  try {
    const body: CreateExperimentPayload = await request.json();
    const result = await createRealFlagsmithExperiment(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to create experiment." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      experiment: result.experiment,
      message: `Experiment '${body.name}' created in Flagsmith with feature flag '${body.featureFlagName}'.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Invalid experiment payload", details: err.message },
      { status: 400 }
    );
  }
}

