import { NextResponse } from "next/server";
import { reviewExperimentReadiness } from "@/lib/ai/gemini-client";
import { ExperimentStrategySchema } from "@/lib/ai/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const strategy = ExperimentStrategySchema.parse(body.strategy);

    const review = await reviewExperimentReadiness(strategy);

    return NextResponse.json({
      success: true,
      review,
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

