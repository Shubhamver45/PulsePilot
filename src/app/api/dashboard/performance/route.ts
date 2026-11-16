import { NextResponse } from "next/server";
import { demoPerformanceData, PerformanceDataPoint } from "@/lib/db/repository";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "7D";
  const mode = searchParams.get("mode");
  const isDemoExplicitlyRequested = mode === "demo" || searchParams.get("includeDemo") === "true";

  // 1. If demo mode is explicitly requested, return labeled sample fixture
  if (isDemoExplicitlyRequested) {
    const demoData = demoPerformanceData[range] || demoPerformanceData["7D"];
    const totalExposures = demoData.reduce((acc, d) => acc + d.exposures, 0);
    const totalConversions = demoData.reduce((acc, d) => acc + d.conversions, 0);
    const averageConversionRate =
      demoData.reduce((acc, d) => acc + d.conversionRate, 0) / (demoData.length || 1);

    return NextResponse.json({
      range,
      status: "DEMO_FIXTURE",
      provenance: "DEMO_FIXTURE",
      isDemoData: true,
      trafficLabel: "Interactive Demo Telemetry (Static Fixture)",
      notice:
        "This dataset is a static sample fixture for interface illustration and does not represent live organic user traffic.",
      data: demoData,
      totalExposures,
      totalConversions,
      averageConversionRate: Number(averageConversionRate.toFixed(2)),
    });
  }

  // 2. Query real live telemetry from PostgreSQL if database is available
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
    try {
      const days = range === "30D" ? 30 : range === "90D" ? 90 : 7;
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      const events = await prisma.telemetryEvent.findMany({
        where: {
          timestamp: { gte: sinceDate },
        },
        select: {
          eventType: true,
          timestamp: true,
          properties: true,
        },
        orderBy: { timestamp: "asc" },
      });

      // Filter out synthetic test simulator events from live metrics
      const organicEvents = events.filter((e) => (e.properties as any)?.isSynthetic !== true);

      if (organicEvents.length > 0) {
        // Group organic events by date
        const dateMap = new Map<string, { exposures: number; conversions: number }>();

        for (const ev of organicEvents) {
          const dateStr = ev.timestamp.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const current = dateMap.get(dateStr) || { exposures: 0, conversions: 0 };
          if (ev.eventType === "EXPOSURE") {
            current.exposures++;
          } else if (ev.eventType === "CONVERSION") {
            current.conversions++;
          }
          dateMap.set(dateStr, current);
        }

        const liveDataPoints: PerformanceDataPoint[] = Array.from(dateMap.entries()).map(([date, counts]) => {
          const conversionRate = counts.exposures > 0 ? (counts.conversions / counts.exposures) * 100 : 0;
          return {
            date,
            exposures: counts.exposures,
            conversions: counts.conversions,
            conversionRate: Number(conversionRate.toFixed(2)),
            controlRate: Number(conversionRate.toFixed(2)),
            treatmentRate: Number(conversionRate.toFixed(2)),
          };
        });

        const totalExposures = liveDataPoints.reduce((acc, d) => acc + d.exposures, 0);
        const totalConversions = liveDataPoints.reduce((acc, d) => acc + d.conversions, 0);
        const averageConversionRate =
          totalExposures > 0 ? (totalConversions / totalExposures) * 100 : 0;

        return NextResponse.json({
          range,
          status: "LIVE_DATA",
          provenance: "POSTGRESQL_TELEMETRY",
          isDemoData: false,
          data: liveDataPoints,
          totalExposures,
          totalConversions,
          averageConversionRate: Number(averageConversionRate.toFixed(2)),
        });
      }
    } catch (err: any) {
      console.warn("[Dashboard Performance Query Error]:", err.message);
    }
  }

  // 3. Fail honestly when real events are unavailable: Never invent or fabricate results
  return NextResponse.json({
    range,
    status: "NOT_ENOUGH_DATA",
    provenance: "EMPTY",
    isDemoData: false,
    message:
      "No live telemetry events have been recorded yet for this workspace. Stream exposure and conversion events to view live performance analytics.",
    data: [],
    totalExposures: 0,
    totalConversions: 0,
    averageConversionRate: 0,
  });
}

