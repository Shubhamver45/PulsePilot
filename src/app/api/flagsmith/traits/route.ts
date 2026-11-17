import { NextResponse } from "next/server";
import { z } from "zod";
import {
  setFlagsmithIdentityTraits,
  getFlagsmithIdentityTraitsAndFlags,
  evaluateBetaTesterSegment,
} from "@/lib/flagsmith/flagsmith-admin";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import { getUserFromToken } from "@/lib/auth/auth-service";
import {
  checkProductionEvaluationGuard,
  checkProductionRemoteFetchGuard,
} from "@/lib/flagsmith/production-guards";

function getSession(request: Request): { token: string | null; cookieAuth: boolean } {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  const cookie = (request.headers.get("cookie") || "").split("; ").find((p) => p.startsWith("pulsepilot_session="))?.split("=")[1];
  return { token: bearer || cookie || null, cookieAuth: Boolean(!bearer && cookie) };
}

async function requireTraitMutationUser(request: Request) {
  const { token, cookieAuth } = getSession(request);
  if (cookieAuth) {
    const source = request.headers.get("origin") || request.headers.get("referer");
    const host = request.headers.get("host");
    if (!source || !host) return { user: null, error: "CSRF_DETECTED", status: 403 };
    try {
      if (new URL(source).host !== host) return { user: null, error: "CSRF_DETECTED", status: 403 };
    } catch {
      return { user: null, error: "CSRF_DETECTED", status: 403 };
    }
  }
  if (!token) return { user: null, error: "UNAUTHORIZED", status: 401 };
  const user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
  if (!user) return { user: null, error: "INVALID_SESSION", status: 401 };
  if (user.role !== "ADMIN" && user.role !== "EDITOR") return { user: null, error: "FORBIDDEN", status: 403 };
  return { user, error: null, status: 200 };
}

export interface TraitItem {
  trait_key: string;
  trait_value: string | number | boolean | null;
}

const TraitItemSchema = z.object({
  trait_key: z.string().min(1),
  trait_value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const SetTraitsSchema = z.object({
  identity: z.string().min(1),
  traits: z.array(TraitItemSchema),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const identity = searchParams.get("identity") || "user_alex_dev";

  const envKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY;

  // 1. Live Remote Query via Flagsmith Identities Endpoint
  if (envKey && envKey !== "mock") {
    const { token } = getSession(request);
    if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const viewer = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
    if (!viewer) return NextResponse.json({ error: "INVALID_SESSION" }, { status: 401 });
    try {
      const result = await getFlagsmithIdentityTraitsAndFlags(identity);
      if (result.success) {
        const traits = result.traits || [];
        const isBeta = evaluateBetaTesterSegment(traits);
        const segments = isBeta ? ["Beta Testers"] : ["Standard Users"];

        return NextResponse.json({
          identity,
          traits,
          segments,
          isBetaTester: isBeta,
          source: "flagsmith_remote_api",
        });
      }
    } catch (err: any) {
      console.warn("[Flagsmith Traits Query Error]:", err.message);
      const fetchGuard = checkProductionRemoteFetchGuard(err);
      if (!fetchGuard.allowed) {
        return NextResponse.json(
          {
            error: fetchGuard.error,
            code: fetchGuard.code,
            source: "error",
          },
          { status: fetchGuard.statusCode || 502 }
        );
      }
    }
  }

  // Production check: reject missing credentials without falling back to mock
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

  // 2. Local Fallback (Development / Sandbox / Testing)
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
  const auth = await requireTraitMutationUser(request);
  if (!auth.user) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  let body: any;
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

  const { identity, traits } = parsed.data;
  const envKey =
    process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
    process.env.FLAGSMITH_ENVIRONMENT_KEY;

  let updatedTraits = traits;
  let source = "local_deterministic_fallback";

  // 1. Remote update on Flagsmith Cloud if credentials exist
  if (envKey && envKey !== "mock") {
    const remoteResult = await setFlagsmithIdentityTraits(identity, traits);
    if (remoteResult.success) {
      updatedTraits = remoteResult.traits || traits;
      source = "flagsmith_remote_api";
    } else {
      console.warn("[Flagsmith Remote Trait Update Failed]:", remoteResult.error);
    }
  }

  // Always sync local mock store as well
  flagsmithMockStore.setTraits(identity, traits);

  const isBeta = evaluateBetaTesterSegment(updatedTraits);
  const segments = isBeta ? ["Beta Testers"] : ["Standard Users"];

  // 2. Record Cryptographic Audit Log
  await recordAuditLog({
    action: "IDENTITY_TRAITS_UPDATED",
    actor: { name: "System Operator", type: "human" },
    entityType: "FLAGSMITH_IDENTITY",
    entityId: identity,
    details: `Updated traits for identity '${identity}': ${traits.map((t) => `${t.trait_key}=${t.trait_value}`).join(", ")}`,
    metadata: {
      traitsCount: traits.length,
      isBetaTester: isBeta,
      segments,
      source,
    },
  });

  return NextResponse.json({
    success: true,
    identity,
    traits: updatedTraits,
    segments,
    isBetaTester: isBeta,
    source,
  });
}
