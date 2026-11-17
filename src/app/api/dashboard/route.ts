import { NextResponse } from "next/server";
import { getProductionDashboardData } from "@/lib/analytics/dashboard-data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7D";
    const dashboard = await getProductionDashboardData(range);
    return NextResponse.json(dashboard);
  } catch (error: any) {
    console.error("[Dashboard] Failed to read persisted experiment telemetry:", error?.message || error);
    return NextResponse.json({
      error: "PERSISTENT_DASHBOARD_UNAVAILABLE",
      message: "The live dashboard could not read persisted experiment telemetry. No sample metrics were substituted.",
    }, { status: 503 });
  }
}
