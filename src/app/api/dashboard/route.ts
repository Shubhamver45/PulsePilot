import { NextResponse } from "next/server";
import {
  demoWorkspaceKPIs, demoPerformanceData, demoActiveExperiments,
  demoAIRecommendations, demoAgentActivities, demoRecentActivities,
} from "@/lib/db/repository";
import { getUserFromToken } from "@/lib/auth/auth-service";
import { withTenantContext } from "@/lib/db/prisma";

function getToken(request: Request): string | null {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  const cookie = (request.headers.get("cookie") || "").split("; ").find((p) => p.startsWith("pulsepilot_session="))?.split("=")[1];
  return bearer || cookie || null;
}

export async function GET(request: Request) {
  try {
    const range = new URL(request.url).searchParams.get("range") || "7D";
    const performance = demoPerformanceData[range] || demoPerformanceData["7D"];
    const databaseConfigured = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock"));

    if (databaseConfigured) {
      const token = getToken(request);
      if (!token) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
      const user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
      if (!user) return NextResponse.json({ success: false, error: "INVALID_SESSION" }, { status: 401 });

      const data = await withTenantContext(user.organizationId, async (tx) => {
        const [totalEvents, exposures, conversions, experiments, auditLogs] = await Promise.all([
          tx.telemetryEvent.count(),
          tx.telemetryEvent.count({ where: { eventType: "EXPOSURE" } }),
          tx.telemetryEvent.count({ where: { eventType: "CONVERSION" } }),
          tx.experiment.findMany({ include: { variants: true }, orderBy: { createdAt: "desc" }, take: 10 }),
          tx.auditLog.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 6 }),
        ]);
        return { totalEvents, exposures, conversions, experiments, auditLogs };
      });

      const conversionRate = data.exposures > 0 ? (data.conversions / data.exposures) * 100 : 0;
      return NextResponse.json({
        workspace: {
          name: user.organizationName,
          environment: process.env.VERCEL_ENV || "server",
          isDemoData: false,
          flagsmithConnected: Boolean(process.env.FLAGSMITH_SERVER_SIDE_API_KEY || process.env.FLAGSMITH_ENVIRONMENT_KEY),
          projectId: process.env.FLAGSMITH_PROJECT_ID || null,
          databaseConnected: true,
          recordedTelemetryCount: data.totalEvents,
          dataSource: "POSTGRESQL_TENANT_SCOPED",
        },
        kpis: {
          totalVisitors: data.exposures.toLocaleString(),
          conversionRate: conversionRate.toFixed(2) + "%",
          activeExperiments: data.experiments.length,
          avgLift: "—",
          flagsEvaluated: data.totalEvents.toLocaleString(),
          guardrailBreaches: null,
        },
        performance: { range, data: [] },
        activeExperiments: data.experiments.map((exp) => ({
          id: exp.id,
          name: exp.title,
          featureFlag: exp.flagsmithFeatureName,
          status: exp.status,
          variantsCount: exp.variants.length,
          startDate: exp.createdAt.toISOString().slice(0, 10),
        })),
        aiRecommendations: [],
        agentActivities: [],
        recentActivities: data.auditLogs.map((log) => ({
          id: log.id,
          action: log.action.replace(/_/g, " "),
          actor: log.actorName || "PulsePilot Operator",
          details: log.details || "",
          time: log.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          type: log.action.includes("ROLLOUT") || log.action.includes("KILL") ? "danger" : "info",
        })),
      });
    }

    // Explicit offline demo fixtures are used only when no database is configured.
    return NextResponse.json({
      workspace: {
        name: "PulsePilot Demo", environment: "Demo", isDemoData: true,
        flagsmithConnected: Boolean(process.env.FLAGSMITH_SERVER_SIDE_API_KEY || process.env.FLAGSMITH_ENVIRONMENT_KEY),
        projectId: process.env.FLAGSMITH_PROJECT_ID || "53867",
        databaseConnected: false, recordedTelemetryCount: 0, dataSource: "DEMO_FIXTURE",
      },
      kpis: demoWorkspaceKPIs,
      performance: { range, data: performance },
      activeExperiments: demoActiveExperiments,
      aiRecommendations: demoAIRecommendations,
      agentActivities: demoAgentActivities,
      recentActivities: demoRecentActivities,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch dashboard data", message: error.message },
      { status: error.message?.includes("PERSISTENT_REVOCATION_UNAVAILABLE") ? 503 : 500 }
    );
  }
}
