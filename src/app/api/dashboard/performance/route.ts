import { NextResponse } from "next/server";
import { getProductionDashboardData } from "@/lib/analytics/dashboard-data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dashboard = await getProductionDashboardData(searchParams.get("range") || "7D");
    const data = dashboard.performance.data;
    return NextResponse.json({
      range: dashboard.performance.range,
      data,
      totalExposures: data.reduce((sum, point) => sum + point.exposures, 0),
      totalConversions: data.reduce((sum, point) => sum + point.conversions, 0),
      averageConversionRate: data.length
        ? data.reduce((sum, point) => sum + point.conversionRate, 0) / data.length
        : 0,
      isDemoData: false,
    });
  } catch (error: any) {
    console.error("[Dashboard Performance] Failed to read persisted telemetry:", error?.message || error);
    return NextResponse.json({
      error: "PERSISTENT_PERFORMANCE_UNAVAILABLE",
      message: "The performance chart could not read persisted telemetry. No sample chart data was substituted.",
    }, { status: 503 });
  }
}
