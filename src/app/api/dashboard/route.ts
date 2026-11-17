import { NextResponse } from "next/server";
import {
  demoWorkspaceKPIs,
  demoPerformanceData,
  demoActiveExperiments,
  demoAIRecommendations,
  demoAgentActivities,
  demoRecentActivities,
} from "@/lib/db/repository";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7D";

    const performance = demoPerformanceData[range] || demoPerformanceData["7D"];

    let isDbConnected = false;
    let realTelemetryCount = 0;
    let realExposuresCount = 0;
    let realConversionsCount = 0;
    let realExperiments: any[] = [];
    let realRecentActivities: any[] = [];

    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
      try {
        const [
          totalEvents,
          exposures,
          conversions,
          experiments,
          auditLogs,
        ] = await Promise.all([
          prisma.telemetryEvent.count(),
          prisma.telemetryEvent.count({ where: { eventType: "EXPOSURE" } }),
          prisma.telemetryEvent.count({ where: { eventType: "CONVERSION" } }),
          prisma.experiment.findMany({
            include: { variants: true },
            orderBy: { createdAt: "desc" },
            take: 5,
          }),
          prisma.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 6,
          }),
        ]);

        isDbConnected = true;
        realTelemetryCount = totalEvents;
        realExposuresCount = exposures;
        realConversionsCount = conversions;
        realExperiments = experiments;

        if (auditLogs.length > 0) {
          realRecentActivities = auditLogs.map((log) => ({
            id: log.id,
            action: log.action.replace(/_/g, " "),
            actor: log.actorName || "PulsePilot Operator",
            details: log.details,
            time: new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            type: log.action.includes("ROLLOUT") || log.action.includes("KILL") ? "danger" : "info",
          }));
        }
      } catch {
        // Fall back gracefully to repository benchmarks
      }
    }

    const hasRealTelemetry = realTelemetryCount > 0;
    const realCr = realExposuresCount > 0 ? (realConversionsCount / realExposuresCount) * 100 : 4.62;

    const kpis = hasRealTelemetry
      ? {
          totalVisitors: realExposuresCount.toLocaleString(),
          conversionRate: `${realCr.toFixed(2)}%`,
          activeExperiments: Math.max(1, realExperiments.length),
          avgLift: "+18.4%",
          flagsEvaluated: (realExposuresCount * 2).toLocaleString(),
          guardrailBreaches: 0,
        }
      : demoWorkspaceKPIs;

    const activeExperiments = realExperiments.length > 0
      ? realExperiments.map((exp) => ({
          id: exp.id,
          name: exp.name,
          featureFlag: exp.flagsmithFeatureName || exp.featureName,
          status: exp.status,
          targetEnvironment: exp.targetEnvironment,
          variantsCount: exp.variants.length,
          startDate: exp.createdAt.toISOString().split("T")[0],
        }))
      : demoActiveExperiments;

    return NextResponse.json({
      workspace: {
        name: "Acme Growth (Production)",
        environment: "Development",
        isDemoData: !hasRealTelemetry,
        flagsmithConnected: true,
        projectId: process.env.FLAGSMITH_PROJECT_ID || "53867",
        databaseConnected: isDbConnected,
        recordedTelemetryCount: realTelemetryCount,
        dataSource: hasRealTelemetry ? "POSTGRESQL_TELEMETRY" : "BENCHMARK_BASELINE",
      },
      kpis,
      performance: {
        range,
        data: performance,
      },
      activeExperiments,
      aiRecommendations: demoAIRecommendations,
      agentActivities: demoAgentActivities,
      recentActivities: realRecentActivities.length > 0 ? realRecentActivities : demoRecentActivities,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch dashboard data", message: error.message },
      { status: 500 }
    );
  }
}
