import { NextResponse } from "next/server";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { z } from "zod";
import { formulateExperimentStrategyWithMetadata } from "@/lib/ai/gemini-client";
import { ExperimentStrategySchema, validateExperimentStrategy } from "@/lib/ai/schemas";
import { sanitizeUserInput, assertZeroSecretLeakage } from "@/lib/security/input-sanitizer";
import { checkRateLimit } from "@/lib/security/rate-limiter";

const FormulateRequestSchema = z.object({
  objective: z.string().min(2),
  prompt: z.string().min(5),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedApplicationUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    }
    if (user.role === "VIEWER") {
      return NextResponse.json({ success: false, error: "INSUFFICIENT_PERMISSIONS" }, { status: 403 });
    }
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

    const generated = await formulateExperimentStrategyWithMetadata(cleanObjective, cleanPrompt);
    const validatedStrategy = ExperimentStrategySchema.parse(generated.strategy);
    const validation = validateExperimentStrategy(validatedStrategy);

    assertZeroSecretLeakage(validatedStrategy);

    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: "GENERATED_STRATEGY_INVALID",
        message: "The generated experiment plan failed deterministic validation. Review the errors and regenerate the plan.",
        validation,
        generation: {
          provider: generated.provider,
          model: generated.model,
          fallbackUsed: generated.fallbackUsed,
          fallbackReason: generated.fallbackReason,
        },
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      strategy: validatedStrategy,
      validation,
      generation: {
        provider: generated.provider,
        model: generated.model,
        fallbackUsed: generated.fallbackUsed,
        fallbackReason: generated.fallbackReason,
      },
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

