import { NextResponse } from "next/server";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const flag = searchParams.get("flag") || "exp_checkout_social_proof";
  const identity = searchParams.get("identity") || "demo_visitor_1";

  const result = flagsmithMockStore.evaluateForIdentity(flag, identity);

  return NextResponse.json({
    flag,
    identity,
    enabled: result.enabled,
    variantKey: result.variantKey,
    value: result.value,
  });
}

