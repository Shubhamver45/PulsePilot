import { NextResponse } from "next/server";
import { z } from "zod";
import {
  setFlagsmithIdentityTraits,
  getFlagsmithIdentityTraitsAndFlags,
  evaluateBetaTesterSegment,
} from "@/lib/flagsmith/flagsmith-admin";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { checkProductionEvaluationGuard } from "@/lib/flagsmith/production-guards";

export interface TraitItem {
  trait_key: string;
  trait_value: string | number | boolean | null;
}

const TraitItemSchema = z.object({
  trait_key: z.string().min(1).max(80),
  trait_value: z.union([z.string().max(200), z.number(), z.boolean(), z.null()]),
});

const SetTraitsSchema = z.object({
  identity: z.string().min(1).max(120),
  traits: z.array(TraitItemSchema).max(20),
});

const PUBLIC_DEMO_IDENTITIES = new Set(["user_alex_dev", "user_elena_ai"]);
const PUBLIC_DEMO_TRAITS = new Set(["plan", "beta_tester", "device"]);

function isHosted(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function getEnvironmentKey(): string {
  return process.env.FLAGSMITH_SERVER_SIDE_API_KEY || process.env.FLAGSMITH_ENVIRONMENT_KEY || "";
}

export async function GET(request: Request) {
  const user = await getAuthenticatedApplicationUser(request);
  const { searchParams } = new URL(request.url);
  const identity = searchParams.get("identity") || (user?.id ?? "user_alex_dev");

  if (!user && !PUBLIC_DEMO_IDENTITIES.has(identity)) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  if (user && user.role !== "ADMIN" && identity !== user.id) {
    return NextResponse.json({ error: "INSUFFICIENT_PERMISSIONS" }, { status: 403 });
  }

  const envKey = getEnvironmentKey();
  const remote = await getFlagsmithIdentityTraitsAndFlags(identity);
  if (remote.success) {
    const traits = remote.traits || [];
    const isBeta = evaluateBetaTesterSegment(traits);
    return NextResponse.json({
      identity,
      traits,
      segments: isBeta ? ["Beta Testers"] : ["Standard Users"],
      isBetaTester: isBeta,
      source: "flagsmith_remote_api",
    });
  }

  if (isHosted()) {
    const guard = checkProductionEvaluationGuard(envKey);
    return NextResponse.json({
      error: remote.error || guard.error || "Flagsmith identity lookup failed.",
      code: guard.code || "FLAGSMITH_IDENTITY_LOOKUP_FAILED",
      source: "error",
    }, { status: guard.allowed ? 502 : (guard.statusCode || 503) });
  }

  const traits = flagsmithMockStore.getTraits(identity);
  const segments = flagsmithMockStore.getSegmentsForIdentity(identity);
  const isBeta = segments.includes("Beta Testers");
  return NextResponse.json({
    identity,
    traits,
    segments,
    isBetaTester: isBeta,
    source: "local_deterministic_fallback",
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SetTraitsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const user = await getAuthenticatedApplicationUser(request);
  const { identity, traits } = parsed.data;

  if (!user && !PUBLIC_DEMO_IDENTITIES.has(identity)) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  if (user && user.role === "VIEWER") {
    return NextResponse.json({ error: "INSUFFICIENT_PERMISSIONS" }, { status: 403 });
  }
  if (user && user.role !== "ADMIN" && identity !== user.id) {
    return NextResponse.json({ error: "INSUFFICIENT_PERMISSIONS" }, { status: 403 });
  }
  if (!user && traits.some((trait) => !PUBLIC_DEMO_TRAITS.has(trait.trait_key))) {
    return NextResponse.json({
      error: "PUBLIC_DEMO_TRAIT_NOT_ALLOWED",
      message: "Anonymous storefront users can only change the plan, beta_tester, and device demonstration traits.",
    }, { status: 403 });
  }

  const envKey = getEnvironmentKey();
  const guard = checkProductionEvaluationGuard(envKey);
  if (isHosted() && !guard.allowed) {
    return NextResponse.json({
      error: guard.error,
      code: guard.code,
      source: "error",
    }, { status: guard.statusCode || 503 });
  }

  let updatedTraits = traits;
  let source = "local_deterministic_fallback";
  if (envKey && envKey !== "mock") {
    const remoteResult = await setFlagsmithIdentityTraits(identity, traits);
    if (!remoteResult.success) {
      if (isHosted()) {
        return NextResponse.json({
          success: false,
          error: remoteResult.error || "Flagsmith rejected the identity trait update.",
          source: "error",
        }, { status: 502 });
      }
    } else {
      updatedTraits = remoteResult.traits || traits;
      source = "flagsmith_remote_api";
    }
  } else if (isHosted()) {
    return NextResponse.json({ success: false, error: "FLAGSMITH_ENVIRONMENT_KEY is not configured." }, { status: 503 });
  }

  if (!isHosted()) {
    flagsmithMockStore.setTraits(identity, traits);
  }

  const isBeta = evaluateBetaTesterSegment(updatedTraits);
  const segments = isBeta ? ["Beta Testers"] : ["Standard Users"];

  if (user) {
    await recordAuditLog({
      organizationId: user.organizationId,
      action: "IDENTITY_TRAITS_UPDATED",
      actor: { name: user.fullName, type: "human" },
      entityType: "FLAGSMITH_IDENTITY",
      entityId: identity,
      details: `Updated Flagsmith identity traits for '${identity}': ${traits.map((trait) => `${trait.trait_key}=${String(trait.trait_value)}`).join(", ")}`,
      metadata: {
        traitsCount: traits.length,
        isBetaTester: isBeta,
        segments,
        source,
      },
    });
  }

  return NextResponse.json({
    success: true,
    identity,
    traits: updatedTraits,
    segments,
    isBetaTester: isBeta,
    source,
  });
}
