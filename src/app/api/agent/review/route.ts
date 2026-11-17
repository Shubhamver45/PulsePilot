import { NextResponse } from "next/server";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { reviewExperimentReadiness } from "@/lib/ai/gemini-client";
import { ExperimentStrategySchema, validateExperimentStrategy } from "@/lib/ai/schemas";

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
    const strategy = ExperimentStrategySchema.parse(body.strategy);
    const validation = validateExperimentStrategy(strategy);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: "EXPERIMENT_PLAN_INVALID",
        validation,
      }, { status: 422 });
    }

    const review = await reviewExperimentReadiness(strategy);

    return NextResponse.json({
      success: true,
      review,
      validation,
    });
  } catch (error: any) {
    console.error("Agent review error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to review experiment readiness",
        details: error.message || error.errors,
      },
      { status: 400 }
    );
  }
}

