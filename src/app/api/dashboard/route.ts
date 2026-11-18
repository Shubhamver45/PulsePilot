import { NextResponse } from "next/server";
import { getProductionDashboardData } from "@/lib/analytics/dashboard-data";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedApplicationUser(request);
    if (!user) {
      return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7D";
    const dashboard = await getProductionDashboardData(range, user.organizationId);
    const geminiConfigured = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock"
    );
    return NextResponse.json({
      ...dashboard,
      aiCopilot: {
        configured: geminiConfigured,
        provider: "Google Gemini",
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      },
    });
  } catch (error: any) {
    console.error("[Dashboard] Failed to read persisted experiment telemetry:", error?.message || error);
    return NextResponse.json({
      error: "PERSISTENT_DASHBOARD_UNAVAILABLE",
      message: "The live dashboard could not read persisted experiment telemetry. No sample metrics were substituted.",
    }, { status: 503 });
  }
}
