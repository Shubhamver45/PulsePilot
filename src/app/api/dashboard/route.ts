import { NextResponse } from "next/server";
import {
  demoWorkspaceKPIs,
  demoPerformanceData,
  demoActiveExperiments,
  demoAIRecommendations,
  demoAgentActivities,
  demoRecentActivities,
} from "@/lib/db/repository";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7D";

    const performance = demoPerformanceData[range] || demoPerformanceData["7D"];

    return NextResponse.json({
      workspace: {
        name: "Acme Growth (Production)",
        environment: "production",
        isDemoData: true,
        flagsmithConnected: true,
      },
      kpis: demoWorkspaceKPIs,
      performance: {
        range,
        data: performance,
      },
      activeExperiments: demoActiveExperiments,
      aiRecommendations: demoAIRecommendations,
      agentActivities: demoAgentActivities,
      recentActivities: demoRecentActivities,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch dashboard data", message: error.message },
      { status: 500 }
    );
  }
}

