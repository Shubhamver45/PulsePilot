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

    // 1. Prisma Persistence if Database is configured
    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock")) {
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
            // Idempotency check for EXPOSURE: avoid duplicate exposures for same user & experiment
            if (normalizedEventType === "EXPOSURE") {
              const existingExposure = await prisma.telemetryEvent.findFirst({
                where: {
                  experimentId: experiment.id,
                  distinctUserId: event.distinctUserId,
                  eventType: "EXPOSURE",
                },
              });

              if (existingExposure) {
                return NextResponse.json({
                  success: true,
                  duplicate: true,
                  eventId: existingExposure.id,
                  message: `User '${event.distinctUserId}' already has an exposure recorded for '${event.experimentFlag}'.`,
                });
              }
            }

            await prisma.telemetryEvent.create({
              data: {
                experimentId: experiment.id,
                variantId: matchedVariant.id,
                distinctUserId: event.distinctUserId,
                eventType: normalizedEventType,
                metricKey: record.metricKey,
                properties: record.properties,
              },
            });

            // Increment current sample size
            await prisma.experiment.update({
              where: { id: experiment.id },
              data: {
                sampleSizeCurrent: { increment: 1 },
              },
            });
          }
        }
      } catch (dbErr: any) {
        console.warn("[Telemetry Tracking DB Warning]:", dbErr.message);
      }
    }

    // 2. In-Memory Store for Real-Time UI Reactivity
    inMemoryTelemetryLogs.unshift(record);
    if (inMemoryTelemetryLogs.length > 500) {
      inMemoryTelemetryLogs.pop();
    }

    return NextResponse.json({
      success: true,
      eventId: record.id,
      recordedAt: record.timestamp,
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
  return NextResponse.json({
    totalEvents: inMemoryTelemetryLogs.length,
    recentEvents: inMemoryTelemetryLogs.slice(0, 50),
  });
}
