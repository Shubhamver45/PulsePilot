import { NextResponse } from "next/server";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";

const getApiUrl = () =>
  (process.env.FLAGSMITH_API_URL || "https://api.flagsmith.com/api/v1").replace(/\/$/, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const flag = searchParams.get("flag") || "exp_checkout_layout_v2";
  const identity = searchParams.get("identity") || "demo_visitor_1";

  const envKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY;

  // 1. Live Remote Evaluation via Flagsmith Identities Endpoint
  if (envKey && envKey !== "mock") {
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(
        `${apiUrl}/identities/?identifier=${encodeURIComponent(identity)}`,
        {
          method: "GET",
          headers: {
            "X-Environment-Key": envKey,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      if (res.ok) {
        const data = await res.json();
        const matched = Array.isArray(data.flags)
          ? data.flags.find((f: any) => f.feature?.name === flag || f.name === flag)
          : null;

        if (matched) {
          let parsedValue: any = matched.feature_state_value;
          try {
            if (typeof parsedValue === "string" && (parsedValue.startsWith("{") || parsedValue.startsWith("["))) {
              parsedValue = JSON.parse(parsedValue);
            }
          } catch {
            // Keep as string
          }

          return NextResponse.json({
            flag,
            identity,
            enabled: matched.enabled,
            variantKey: typeof parsedValue === "object" && parsedValue?.layout ? parsedValue.layout : (matched.feature_state_value || "control"),
            value: matched.feature_state_value,
            parsedValue,
            source: "flagsmith_remote_api",
          });
        }
      }
    } catch (err: any) {
      console.warn("[Flagsmith Remote Evaluation Error]:", err.message);
    }
  }

  // 2. Local Fallback with Deterministic MurmurHash3
  const result = flagsmithMockStore.evaluateForIdentity(flag, identity);

  return NextResponse.json({
    flag,
    identity,
    enabled: result.enabled,
    variantKey: result.variantKey,
    value: result.value,
    source: "local_deterministic_fallback",
  });
}
