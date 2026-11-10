import { NextResponse } from "next/server";
import { z } from "zod";
import { orchestrateAgentRequest } from "@/lib/agents/orchestrator";
import { sanitizeUserInput, assertZeroSecretLeakage } from "@/lib/security/input-sanitizer";
import { checkRateLimit } from "@/lib/security/rate-limiter";

const OrchestrateRequestSchema = z.object({
  prompt: z.string().min(2),
  context: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  try {
    // Rate Limiting by client IP or header
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateCheck = checkRateLimit(`agent_${ip}`, { maxRequests: 60, windowMs: 60000 });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          status: "ERROR",
          error: "Rate limit exceeded. Please wait before submitting more agent prompts.",
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { prompt, context } = OrchestrateRequestSchema.parse(body);

    // Sanitize Prompt & Neutralize Prompt Injection / XSS
    const sanitized = sanitizeUserInput(prompt);
    const effectivePrompt = sanitized.sanitized;

    const response = await orchestrateAgentRequest(effectivePrompt, context);

    // Ensure zero secret leakage in agent output
    assertZeroSecretLeakage(response);

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "ERROR",
        error: "Orchestration request failed",
        details: err.message,
      },
      { status: 400 }
    );
  }
}

