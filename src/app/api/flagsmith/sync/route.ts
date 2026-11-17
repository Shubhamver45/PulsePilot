import { NextResponse } from "next/server";

const API_URL = (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");

export async function GET() {
  const environmentKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY ||
    process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID ||
    "";

  if (!environmentKey || environmentKey === "mock") {
    return NextResponse.json({
      status: "unavailable",
      source: "flagsmith_remote_api",
      error: "A Flagsmith environment evaluation key is not configured.",
      flags: [],
      activeFlagsCount: 0,
      lastSyncedAt: new Date().toISOString(),
    }, { status: 503 });
  }

  try {
    const response = await fetch(`${API_URL}/flags/`, {
      method: "GET",
      headers: {
        "X-Environment-Key": environmentKey,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({
        status: "unavailable",
        source: "flagsmith_remote_api",
        error: `Flagsmith edge returned HTTP ${response.status}.`,
        detail: detail.slice(0, 300),
        flags: [],
        activeFlagsCount: 0,
        lastSyncedAt: new Date().toISOString(),
      }, { status: 502 });
    }

    const payload = await response.json();
    const remoteFlags = Array.isArray(payload) ? payload : [];
    const flags = remoteFlags.map((flag: any) => ({
      name: flag.feature?.name || flag.name || "unknown",
      enabled: Boolean(flag.enabled),
      value: flag.feature_state_value ?? flag.value ?? null,
      type: flag.feature?.type ?? null,
    }));

    return NextResponse.json({
      status: "healthy",
      source: "flagsmith_remote_api",
      engine: "Flagsmith Cloud Edge",
      environment: "configured",
      activeFlagsCount: flags.filter((flag: any) => flag.enabled).length,
      totalFlagsCount: flags.length,
      flags,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Flagsmith Sync] Remote edge fetch failed:", error?.message || error);
    return NextResponse.json({
      status: "unavailable",
      source: "flagsmith_remote_api",
      error: "Flagsmith edge could not be reached.",
      flags: [],
      activeFlagsCount: 0,
      lastSyncedAt: new Date().toISOString(),
    }, { status: 502 });
  }
}
