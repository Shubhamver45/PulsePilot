import { NextResponse } from "next/server";
import { getFlagsmithIntegrationHealth } from "@/lib/flagsmith/experimentation-service";

export async function GET() {
  const health = await getFlagsmithIntegrationHealth();
  return NextResponse.json(health);
}

