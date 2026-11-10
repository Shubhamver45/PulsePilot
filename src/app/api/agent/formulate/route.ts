import { NextResponse } from "next/server";
import { z } from "zod";
import { formulateExperimentStrategy } from "@/lib/ai/gemini-client";
import { ExperimentStrategySchema } from "@/lib/ai/schemas";
import { sanitizeUserInput, assertZeroSecretLeakage } from "@/lib/security/input-sanitizer";
import { checkRateLimit } from "@/lib/security/rate-limiter";

const FormulateRequestSchema = z.object({
  objective: z.string().min(2),
  prompt: z.string().min(5),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateCheck = checkRateLimit(`formulate_${ip}`, { maxRequests: 60, windowMs: 60000 });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Please wait before submitting more prompts." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { objective, prompt } = FormulateRequestSchema.parse(body);

    const cleanObjective = sanitizeUserInput(objective).sanitized;
    const cleanPrompt = sanitizeUserInput(prompt).sanitized;

    const strategy = await formulateExperimentStrategy(cleanObjective, cleanPrompt);
    const validatedStrategy = ExperimentStrategySchema.parse(strategy);

    assertZeroSecretLeakage(validatedStrategy);

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

