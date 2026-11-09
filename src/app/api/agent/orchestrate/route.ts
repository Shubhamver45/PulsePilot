import { NextResponse } from "next/server";
import { z } from "zod";
import { orchestrateAgentRequest } from "@/lib/agents/orchestrator";

const OrchestrateRequestSchema = z.object({
  prompt: z.string().min(2),
  context: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, context } = OrchestrateRequestSchema.parse(body);

    const response = await orchestrateAgentRequest(prompt, context);

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

