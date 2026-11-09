import { NextResponse } from "next/server";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";

export async function GET() {
  const isMock = !process.env.FLAGSMITH_MANAGEMENT_KEY || process.env.FLAGSMITH_MANAGEMENT_KEY === "mock";
  const flags = flagsmithMockStore.getAllFlags();

  return NextResponse.json({
    status: "healthy",
    engine: isMock ? "Flagsmith Mock Adapter (Offline Resilience)" : "Flagsmith Cloud Edge",
    environment: "production",
    activeFlagsCount: flags.filter((f) => f.enabled).length,
    flags,
    lastSyncedAt: new Date().toISOString(),
  });
}

