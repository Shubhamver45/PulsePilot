import { NextResponse } from "next/server";
import { z } from "zod";
import { inMemoryTelemetryLogs } from "@/lib/telemetry/store";
import { prisma } from "@/lib/db/prisma";

const TelemetryEventSchema = z.object({
  experimentFlag: z.string().min(1),
  distinctUserId: z.string().min(1),
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
    const body = await request.json();
    const event = TelemetryEventSchema.parse(body);

    const normalizedEventType: "EXPOSURE" | "CONVERSION" =
      event.eventType === "experiment_exposure" || event.eventType === "EXPOSURE"
        ? "EXPOSURE"
        : "CONVERSION";

    const record = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      experimentFlag: event.experimentFlag,
      distinctUserId: event.distinctUserId,
      eventType: normalizedEventType,
      rawEventType: event.eventType,
      variantKey: event.variantKey || "control",
      metricKey: event.metricKey || (event.eventType === "EXPOSURE" ? "exposure" : event.eventType),
      properties: event.properties || {},
    };

    const isDbConfigured =
      Boolean(process.env.DATABASE_URL) &&
      !process.env.DATABASE_URL?.includes("mock") &&
      process.env.DATABASE_URL?.startsWith("postgres");

    const isProduction = process.env.NODE_ENV === "production";

    // 1. Production Mode: Persistent PostgreSQL storage is strictly required
    if ((isProduction || event.requirePersistence) && !isDbConfigured) {
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          error: "PERSISTENT_STORAGE_UNAVAILABLE",
          message:
            "Production telemetry tracking requires persistent PostgreSQL storage, but no valid database is configured.",
        },
        { status: 503 }
      );
    }

    // 2. Persistent Database Write
    if (isDbConfigured) {
      try {
        let experiment = await prisma.experiment.findUnique({
          where: { flagsmithFeatureName: event.experimentFlag },
          include: { variants: true },
        });

        if (!experiment) {
          // Auto-provision experiment container in PostgreSQL for active Flagsmith feature
          let project = await prisma.project.findFirst();
          if (!project) {
            const org = await prisma.organization.findFirst();
            const orgId = org?.id || "org_acme_growth";
            project = await prisma.project.create({
              data: {
                id: "prj_flagsmith_main",
                name: "Acme Production App",
                organizationId: orgId,
                flagsmithProjectId: "53867",
              },
            });
          }

          const expId = `exp_${event.experimentFlag.replace(/[^a-zA-Z0-9]/g, "_")}`;
          const isCheckout = event.experimentFlag.includes("checkout");

          try {
            experiment = await prisma.experiment.create({
              data: {
                id: expId,
                projectId: project.id,
                title: isCheckout
                  ? "Checkout Conversion Optimization (Single-Page vs Multi-Step)"
                  : `Optimization: ${event.experimentFlag}`,
                hypothesis: isCheckout
                  ? "Switching from a 3-step checkout wizard to a single-page streamlined accordion will reduce drop-off and increase completed orders by +15%."
                  : `Optimizing experience via Flagsmith multivariate feature '${event.experimentFlag}'.`,
                status: "ACTIVE",
                flagsmithFeatureName: event.experimentFlag,
                primaryMetric: "checkout_completed",
                variants: {
                  create: [
                    {
                      id: `var_${expId}_ctrl`,
                      key: "control",
                      name: "Multi-Step Checkout (Control)",
                      isControl: true,
                      trafficAllocation: 50,
                      featureValue: { layout: "multi_step" },
                    },
                    {
                      id: `var_${expId}_treat`,
                      key: event.variantKey && event.variantKey !== "control" ? event.variantKey : "variant_single_page",
                      name: "Single-Page Checkout (Treatment)",
                      isControl: false,
                      trafficAllocation: 50,
                      featureValue: { layout: "single_page" },
                    },
                  ],
                },
              },
              include: { variants: true },
            });
          } catch {
            // Concurrency safe: fetch again if another request created it in parallel
            experiment = await prisma.experiment.findUnique({
              where: { flagsmithFeatureName: event.experimentFlag },
              include: { variants: true },
            });
          }
        }

        if (!experiment || !experiment.variants || experiment.variants.length === 0) {
          return NextResponse.json(
            {
              success: false,
              status: "FAILED",
              error: "EXPERIMENT_UNAVAILABLE",
              message: `Experiment container for feature flag '${event.experimentFlag}' is unavailable.`,
            },
            { status: 404 }
          );
        }

        const matchedVariant =
          experiment.variants.find((v) => v.key === event.variantKey) ||
          experiment.variants.find((v) => v.isControl) ||
          experiment.variants[0];

        if (!matchedVariant) {
          return NextResponse.json(
            {
              success: false,
              status: "FAILED",
              error: "VARIANT_NOT_FOUND",
              message: `Variant '${event.variantKey}' does not exist on experiment '${event.experimentFlag}'.`,
            },
            { status: 400 }
          );
        }

        // Deterministic deduplication key:
        // Exposures: 1 per user per experiment
        // Conversions: 1 per user per transaction/order/event
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
            dedupKey = `${experiment.id}:${event.distinctUserId}:CONVERSION:${record.metricKey}`;
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
              properties: record.properties as import("@prisma/client").Prisma.InputJsonValue,
            },
          });

          // Increment sample size if exposure
          if (normalizedEventType === "EXPOSURE") {
            await prisma.experiment.update({
              where: { id: experiment.id },
              data: {
                sampleSizeCurrent: { increment: 1 },
              },
            }).catch(() => {});
          }

          record.id = savedEvent.id;

          // Mirror to in-memory for real-time reactivity
          inMemoryTelemetryLogs.unshift(record);
          if (inMemoryTelemetryLogs.length > 500) inMemoryTelemetryLogs.pop();

          return NextResponse.json({
            success: true,
            status: "PERSISTED",
            persisted: true,
            duplicate: false,
            eventId: savedEvent.id,
            recordedAt: record.timestamp,
            mode: "POSTGRESQL_PRODUCTION",
            message: `Telemetry ${event.eventType} persistently recorded for '${event.experimentFlag}'.`,
          });
        } catch (createErr: any) {
          // P2002: Unique constraint violation on dedupKey -> Idempotent Duplicate
          if (createErr.code === "P2002") {
            return NextResponse.json({
              success: true,
              status: "DUPLICATE",
              duplicate: true,
              persisted: true,
              eventId: record.id,
              recordedAt: record.timestamp,
              message: `Duplicate ${normalizedEventType} event safely ignored for user '${event.distinctUserId}'.`,
            });
          }
          throw createErr;
        }
      } catch (dbErr: any) {
        console.error("[Telemetry Tracking DB Error]:", dbErr.message);
        return NextResponse.json(
          {
            success: false,
            status: "FAILED",
            error: "PERSISTENT_STORAGE_ERROR",
            message: `Database failure persisting telemetry: ${dbErr.message}`,
          },
          { status: 503 }
        );
      }
    }

    // 3. Fallback: In-Memory Sandbox Mock Mode (Permitted ONLY in test/demo mode when DB is not configured)
    inMemoryTelemetryLogs.unshift(record);
    if (inMemoryTelemetryLogs.length > 500) {
      inMemoryTelemetryLogs.pop();
    }

    return NextResponse.json({
      success: true,
      status: "ACCEPTED_IN_MEMORY",
      persisted: false,
      duplicate: false,
      eventId: record.id,
      recordedAt: record.timestamp,
      mode: "SANDBOX_MOCK_MODE",
      message: `Telemetry ${event.eventType} recorded in memory for '${event.experimentFlag}' (Sandbox Mock Mode).`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, status: "FAILED", error: "Invalid telemetry payload", details: err.message },
      { status: 400 }
    );
  }
}

export async function GET() {
  const isDbConfigured =
    Boolean(process.env.DATABASE_URL) &&
    !process.env.DATABASE_URL?.includes("mock") &&
    process.env.DATABASE_URL?.startsWith("postgres");

  if (isDbConfigured) {
    try {
      const liveEvents = await prisma.telemetryEvent.findMany({
        take: 100,
        orderBy: { timestamp: "desc" },
        include: {
          experiment: { select: { flagsmithFeatureName: true, title: true } },
          variant: { select: { key: true, isControl: true } },
        },
      });

      return NextResponse.json({
        total: liveEvents.length,
        source: "POSTGRESQL",
        events: liveEvents.map((e) => ({
          id: e.id,
          timestamp: e.timestamp.toISOString(),
          experimentFlag: e.experiment.flagsmithFeatureName,
          experimentTitle: e.experiment.title,
          distinctUserId: e.distinctUserId,
          eventType: e.eventType,
          variantKey: e.variant.key,
          isControl: e.variant.isControl,
          metricKey: e.metricKey,
          properties: e.properties,
        })),
      });
    } catch (err: any) {
      console.warn("[Telemetry Query DB Fallback]:", err.message);
    }
  }

  return NextResponse.json({
    total: inMemoryTelemetryLogs.length,
    source: "IN_MEMORY_MOCK",
    events: inMemoryTelemetryLogs,
  });
}
