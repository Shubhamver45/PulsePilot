import { NextResponse } from "next/server";
import { z } from "zod";
import { inMemoryTelemetryLogs } from "@/lib/telemetry/store";
import { prisma } from "@/lib/db/prisma";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { getFlagsmithIdentityAssignment } from "@/lib/flagsmith/identity-evaluation";
import { resolveExposureVariant } from "@/lib/telemetry/variant-attribution";

const PUBLIC_DEMO_EXPERIMENTS = new Set(["exp_checkout_layout_v2", "checkout_experience"]);
const PUBLIC_DEMO_ORGANIZATION_ID = "org_acme_growth";

const TelemetryEventSchema = z.object({
  experimentFlag: z.string().min(1).max(120),
  distinctUserId: z.string().min(1).max(120),
  eventType: z.enum([
    "EXPOSURE",
    "CONVERSION",
    "experiment_exposure",
    "checkout_started",
    "checkout_completed",
    "checkout_abandoned",
  ]),
  variantKey: z.string().optional(),
  metricKey: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
  idempotencyKey: z.string().optional(),
  requirePersistence: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedApplicationUser(request);
    const body = await request.json();
    const event = TelemetryEventSchema.parse(body);
    const isPublicDemoExperiment = PUBLIC_DEMO_EXPERIMENTS.has(event.experimentFlag);

    if (!user && !isPublicDemoExperiment) {
      return NextResponse.json({ success: false, error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    }

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const rateLimit = checkRateLimit(`telemetry:${clientIp}`, { maxRequests: 120, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: "TELEMETRY_RATE_LIMITED" }, { status: 429 });
    }

    const normalizedEventType: "EXPOSURE" | "CONVERSION" =
      event.eventType === "experiment_exposure" || event.eventType === "EXPOSURE"
        ? "EXPOSURE"
        : "CONVERSION";

    const isDbConfigured = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock");
    const mustPersist = Boolean(event.requirePersistence || process.env.NODE_ENV === "production" || process.env.VERCEL === "1");

    // A persisted exposure is assigned by Flagsmith on the server. Never trust
    // the variantKey sent by the browser, because that would let a client
    // fabricate treatment/control attribution and contaminate experiment data.
    let authoritativeVariantKey: string | undefined;
    if (normalizedEventType === "EXPOSURE") {
      const environmentKey =
        process.env.FLAGSMITH_SERVER_SIDE_API_KEY ||
        process.env.FLAGSMITH_ENVIRONMENT_KEY;
      if (mustPersist || (environmentKey && environmentKey !== "mock")) {
        const assignment = await getFlagsmithIdentityAssignment(event.distinctUserId, event.experimentFlag);
        if (!assignment.success || !assignment.variantKey) {
          return NextResponse.json({
            success: false,
            error: "FLAGSMITH_ASSIGNMENT_UNVERIFIED",
            message: assignment.error || "Flagsmith did not return an authoritative variant assignment.",
          }, { status: assignment.status || 502 });
        }
        authoritativeVariantKey = assignment.variantKey;
      } else {
        // Local-only development mode may exercise the telemetry UI without
        // live Flagsmith credentials. This path is never accepted on Vercel.
        authoritativeVariantKey = event.variantKey || "control";
      }
    }

    const record = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      experimentFlag: event.experimentFlag,
      distinctUserId: event.distinctUserId,
      eventType: normalizedEventType,
      rawEventType: event.eventType,
      variantKey: normalizedEventType === "EXPOSURE"
        ? authoritativeVariantKey || "control"
        : event.variantKey || "control",
      metricKey: event.metricKey || (event.eventType === "EXPOSURE" ? "exposure" : event.eventType),
      // Clients cannot mark customer events synthetic to evade attribution or
      // mark synthetic rows as real. The server owns this classification.
      properties: { ...(event.properties || {}), isSynthetic: false },
    };

    // Hosted experiment telemetry must never silently degrade to an in-memory success.
    if (mustPersist && !isDbConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: "PERSISTENT_STORAGE_UNAVAILABLE",
          message: "Persistent PostgreSQL storage was requested but is not configured.",
        },
        { status: 503 }
      );
    }

    let persistedToDb = false;

    // 1. Prisma Persistence to PostgreSQL
    if (isDbConfigured) {
      try {
        const experiment = await prisma.experiment.findUnique({
          where: { flagsmithFeatureName: event.experimentFlag },
          include: { variants: true, project: true },
        });

        if (!experiment) {
          if (mustPersist) {
            return NextResponse.json(
              {
                success: false,
                error: "EXPERIMENT_NOT_FOUND",
                message: `Experiment for feature flag '${event.experimentFlag}' not found in database.`,
              },
              { status: 404 }
            );
          }
        } else {
          const allowedOrganizationId = user?.organizationId || PUBLIC_DEMO_ORGANIZATION_ID;
          if (experiment.project.organizationId !== allowedOrganizationId) {
            return NextResponse.json({
              success: false,
              error: "EXPERIMENT_WORKSPACE_MISMATCH",
              message: "This feature flag is not available for the current visitor or authenticated workspace.",
            }, { status: 403 });
          }

          let matchedVariant;
          if (normalizedEventType === "EXPOSURE") {
            // The browser's variantKey is informational only. Production and
            // hosted telemetry use the server-resolved Flagsmith assignment.
            matchedVariant = resolveExposureVariant(experiment.variants, authoritativeVariantKey);
            if (!matchedVariant) {
              return NextResponse.json({
                success: false,
                error: "FLAGSMITH_VARIANT_NOT_CONFIGURED",
                message: "The authoritative Flagsmith assignment does not match a configured experiment variant.",
              }, { status: 422 });
            }
          } else {
            // A conversion is attributed to the first persisted exposure for this
            // experiment/user pair. Ignore any client-supplied conversion variant.
            const priorExposure = await prisma.telemetryEvent.findFirst({
              where: {
                experimentId: experiment.id,
                distinctUserId: event.distinctUserId,
                eventType: "EXPOSURE",
              },
              orderBy: { timestamp: "asc" },
              select: { variantId: true },
            });

            if (!priorExposure) {
              return NextResponse.json({
                success: false,
                error: "EXPOSURE_REQUIRED",
                message: "A conversion cannot be recorded before this user has a persisted experiment exposure.",
              }, { status: 409 });
            }

            matchedVariant = experiment.variants.find((variant) => variant.id === priorExposure.variantId);
            if (!matchedVariant) {
              return NextResponse.json({
                success: false,
                error: "EXPOSURE_VARIANT_MISSING",
                message: "The first-touch exposure references a variant that is no longer configured.",
              }, { status: 409 });
            }
          }

          if (matchedVariant) {
            // Deterministic deduplication key:
            // Exposures: 1 per user per experiment
            // Conversions: 1 per user per transaction/order/event (no randomness)
            const conversionId =
              event.properties?.orderId ||
              event.properties?.transactionId ||
              event.properties?.eventId ||
              event.idempotencyKey;

            let dedupKey: string;
            if (normalizedEventType === "EXPOSURE") {
              dedupKey = `${experiment.id}:${event.distinctUserId}:EXPOSURE`;
            } else {
              if (conversionId) {
                dedupKey = `${experiment.id}:${event.distinctUserId}:CONVERSION:${conversionId}`;
              } else {
                return NextResponse.json(
                  {
                    success: false,
                    error: "MISSING_CONVERSION_IDENTIFIER",
                    message:
                      "Conversion telemetry requires an orderId, transactionId, eventId, or idempotencyKey to prevent duplicate attribution.",
                  },
                  { status: 422 }
                );
              }
            }

            try {
              const savedEvent = await prisma.telemetryEvent.create({
                data: {
                  experimentId: experiment.id,
                  variantId: matchedVariant.id,
                  distinctUserId: event.distinctUserId,
                  eventType: normalizedEventType,
                  metricKey: record.metricKey,
                  dedupKey,
                  properties: record.properties,
                },
              });

              persistedToDb = true;
              record.variantKey = matchedVariant.key;

              // Increment current sample size if exposure
              if (normalizedEventType === "EXPOSURE") {
                await prisma.experiment.update({
                  where: { id: experiment.id },
                  data: {
                    sampleSizeCurrent: { increment: 1 },
                  },
                });
              }

              record.id = savedEvent.id;
            } catch (createErr: any) {
              // Handle P2002 unique constraint violation for idempotent deduplication
              if (createErr.code === "P2002") {
                return NextResponse.json({
                  success: true,
                  duplicate: true,
                  persisted: true,
                  message: `Duplicate ${normalizedEventType} event safely ignored for user '${event.distinctUserId}'.`,
                });
              }
              throw createErr;
            }
          }
        }
      } catch (dbErr: any) {
        console.error("[Telemetry Tracking DB Error]:", dbErr.message);
        if (mustPersist) {
          return NextResponse.json(
            {
              success: false,
              error: "PERSISTENT_STORAGE_UNAVAILABLE",
              message: `Database failure persisting telemetry: ${dbErr.message}`,
            },
            { status: 503 }
          );
        }
      }
    }

    // 2. In-Memory Store for Real-Time UI Reactivity & Sandbox Mode
    inMemoryTelemetryLogs.unshift(record);
    if (inMemoryTelemetryLogs.length > 500) {
      inMemoryTelemetryLogs.pop();
    }

    return NextResponse.json({
      success: true,
      eventId: record.id,
      recordedAt: record.timestamp,
      persisted: persistedToDb,
      mode: isDbConfigured ? "POSTGRESQL_PRODUCTION" : "SANDBOX MOCK MODE",
      message: `Telemetry ${event.eventType} recorded for '${event.experimentFlag}' on user '${event.distinctUserId}'.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: "Invalid telemetry payload", details: err.message },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  const user = await getAuthenticatedApplicationUser(request);
  if (!user) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  const isDbConfigured = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock");

  if (isDbConfigured) {
    try {
      const scopedWhere = { experiment: { project: { organizationId: user.organizationId } } };
      const dbCount = await prisma.telemetryEvent.count({ where: scopedWhere });
      const recentDbEvents = await prisma.telemetryEvent.findMany({
        where: scopedWhere,
        take: 50,
        orderBy: { timestamp: "desc" },
        include: {
          experiment: { select: { flagsmithFeatureName: true } },
          variant: { select: { key: true } },
        },
      });

      return NextResponse.json({
        source: "POSTGRESQL_DATABASE",
        totalEvents: dbCount,
        recentEvents: recentDbEvents.map((evt) => ({
          id: evt.id,
          timestamp: evt.timestamp.toISOString(),
          experimentFlag: evt.experiment.flagsmithFeatureName,
          distinctUserId: evt.distinctUserId,
          eventType: evt.eventType,
          variantKey: evt.variant.key,
          metricKey: evt.metricKey,
          properties: evt.properties,
        })),
      });
    } catch (error: any) {
      console.error("[Telemetry GET] Database read failed:", error?.message || error);
      return NextResponse.json({ error: "PERSISTENT_TELEMETRY_UNAVAILABLE" }, { status: 503 });
    }
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    return NextResponse.json({ error: "PERSISTENT_STORAGE_REQUIRED" }, { status: 503 });
  }

  return NextResponse.json({
    source: "SANDBOX MOCK MODE",
    totalEvents: inMemoryTelemetryLogs.length,
    recentEvents: inMemoryTelemetryLogs.slice(0, 50),
  });
}
