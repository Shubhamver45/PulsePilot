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
  properties: z.record(z.any()).optional(),
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

    const isDbConfigured = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock");

    // Check if persistence is explicitly required or configured
    if (event.requirePersistence && !isDbConfigured) {
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
          include: { variants: true },
        });

        if (experiment) {
          const matchedVariant =
            experiment.variants.find((v) => v.key === event.variantKey) ||
            experiment.variants.find((v) => v.isControl) ||
            experiment.variants[0];

          if (matchedVariant) {
            // Deduplication key construction:
            // Exposures: 1 per user per experiment
            // Conversions: 1 per user per transaction/order
            const dedupKey =
              normalizedEventType === "EXPOSURE"
                ? `${experiment.id}:${event.distinctUserId}:EXPOSURE`
                : `${experiment.id}:${event.distinctUserId}:CONVERSION:${
                    event.properties?.orderId ||
                    event.properties?.transactionId ||
                    event.properties?.eventId ||
                    `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
                  }`;

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
        if (event.requirePersistence) {
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

export async function GET() {
  const isDbConfigured = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock");

  if (isDbConfigured) {
    try {
      const dbCount = await prisma.telemetryEvent.count();
      const recentDbEvents = await prisma.telemetryEvent.findMany({
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
    } catch {
      // Fall through to in-memory
    }
  }

  return NextResponse.json({
    source: "SANDBOX MOCK MODE",
    totalEvents: inMemoryTelemetryLogs.length,
    recentEvents: inMemoryTelemetryLogs.slice(0, 50),
  });
}
