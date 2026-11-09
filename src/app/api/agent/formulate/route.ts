import { NextResponse } from "next/server";
import { z } from "zod";
import { formulateExperimentStrategy } from "@/lib/ai/gemini-client";
import { ExperimentStrategySchema } from "@/lib/ai/schemas";

const FormulateRequestSchema = z.object({
  objective: z.string().min(2),
  prompt: z.string().min(5),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { objective, prompt } = FormulateRequestSchema.parse(body);

    const strategy = await formulateExperimentStrategy(objective, prompt);
    const validatedStrategy = ExperimentStrategySchema.parse(strategy);

    return NextResponse.json({
      success: true,
      strategy: validatedStrategy,
    });
  } catch (error: any) {
    console.error("Agent formulate error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to formulate experiment strategy",
        details: error.message || error.errors,
      },
      { status: 400 }
    );
  }
}

