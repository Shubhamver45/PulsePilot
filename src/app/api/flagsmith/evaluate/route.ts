import { NextResponse } from "next/server";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";
import { evaluateBetaTesterSegment } from "@/lib/flagsmith/flagsmith-admin";
import { getFlagsmithIdentityAssignment } from "@/lib/flagsmith/identity-evaluation";
import { checkProductionEvaluationGuard } from "@/lib/flagsmith/production-guards";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const flag = searchParams.get("flag") || "exp_checkout_layout_v2";
  const identity = searchParams.get("identity") || "demo_visitor_1";

  const envKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY;

  // Share the assignment resolver with telemetry ingestion. It reads the
  // official Flagsmith variant key, not the remote-config JSON value.
  if (envKey && envKey !== "mock") {
    const assignment = await getFlagsmithIdentityAssignment(identity, flag);
    if (assignment.success) {
      const traits = assignment.traits || [];
      const isBeta = evaluateBetaTesterSegment(traits);
      const segments = isBeta ? ["Beta Testers"] : ["Standard Users"];

      return NextResponse.json({
        flag,
        identity,
        enabled: assignment.enabled,
        variantKey: assignment.variantKey,
        value: assignment.value,
        parsedValue: assignment.parsedValue,
        traits,
        segments,
        isBetaTester: isBeta,
        source: "flagsmith_remote_api",
      });
    }

    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      return NextResponse.json({
        error: assignment.status === 404
          ? "FLAG_NOT_PRESENT_IN_REMOTE_ENVIRONMENT"
          : "FLAGSMITH_REMOTE_EVALUATION_FAILED",
        message: assignment.error,
        source: "error",
      }, { status: assignment.status || 502 });
    }
  }

  // Development may use deterministic local evaluation. Hosted deployments
  // never disguise a failed remote evaluation as a successful mock result.
  const evalGuard = checkProductionEvaluationGuard(envKey);
  if (!evalGuard.allowed) {
    return NextResponse.json(
      {
        error: evalGuard.error,
        code: evalGuard.code,
        source: "error",
      },
      { status: evalGuard.statusCode || 503 }
    );
  }

  const result = flagsmithMockStore.evaluateForIdentity(flag, identity);
  return NextResponse.json({
    flag,
    identity,
    enabled: result.enabled,
    variantKey: result.variantKey,
    value: result.value,
    traits: result.traits,
    segments: result.segments,
    isBetaTester: result.segments.includes("Beta Testers"),
    source: "local_deterministic_fallback",
  });
}
