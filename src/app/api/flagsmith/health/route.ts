import { NextResponse } from "next/server";
import { getLiveRemoteFeatureState } from "@/lib/flagsmith/flagsmith-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getApiUrl = () =>
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");

export async function GET() {
  const apiUrl = getApiUrl();
  const projectId = process.env.FLAGSMITH_PROJECT_ID || "";
  const environmentKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY ||
    process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID ||
    "";

  let edgeConnected = false;
  let edgeLatencyMs: number | null = null;
  let liveFlagsCount = 0;

  if (environmentKey && environmentKey !== "mock") {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${apiUrl}/flags/`, {
        headers: {
          "X-Environment-Key": environmentKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      edgeLatencyMs = Date.now() - startedAt;
      if (response.ok) {
        const flags = await response.json();
        edgeConnected = true;
        liveFlagsCount = Array.isArray(flags) ? flags.length : 0;
      }
    } catch {
      edgeConnected = false;
    }
  }

  // Management state is separate from edge evaluation: it is the only safe
  // source for editable multivariate allocation records.
  const management = projectId
    ? await getLiveRemoteFeatureSta¶»§q«^