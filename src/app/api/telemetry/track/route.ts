import { NextResponse } from "next/server";
import { z } from "zod";
import { inMemoryTelemetryLogs } from "@/lib/telemetry/store";
import { getUserFromToken } from "@/lib/auth/auth-service";
import { withTenantContext } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

const TelemetryEventSchema = z.object({
  experimentFlag: z.string().min(1),
  distinctUserId: z.string().min(1),
  eventType: z.enum(["EXPOSURE", "CONVERSION", "experiment_exposure", "checkout_started", "checkout_completed", "checkout_abandoned"]),
  variantKey: z.string().optional(),
  metricKey: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
  idempotencyKey: z.string().optional(),
  requirePersistence: z.boolean().optional(),
});

function getToken(request: Request): string | null {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  const cookie = (request.headers.get("cookie") || "").split("; ").find((p) => p.startsWith("pulsepilot_session="))?.split("=")[1];
  return bearer || cookie || null;
}

export async function POST(request: Request) {
  try {
    const event = TelemetryEventSchema.parse(await request.json());
    const eventType: "EXPOSURE" | "CONVERSION" =
      event.eventType === "EXPOSURE" || event.eventType === "experiment_exposure" ? "EXPOSURE" : "CONVERSION";
    const databaseConfigured = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock") && process.env.DATABASE_URL.startsWith("postgres"));

    if (process.env.NODE_ENV === "production" && !databaseConfigured) {
      return NextResponse.json({ success: false, status: "FAILED", error: "PERSISTENT_STORAGE_UNAVAILABLE" }, { status: 503 });
    }

    if (databaseConfigured) {
      const token = getToken(request);
      if (!token) return NextResponse.json({ success: false, status: "FAILED", error: "UNAUTHORIZED" }, { status: 401 });
      const user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
      if (!user) return NextResponse.json({ success: false, status: "FAILED", error: "INVALID_SESSION" }, { status: 401 });

      // Persisted identity is derived from the signed-in user, never caller-supplied.
      const distinctUserId = user.id;
      const metricKey = event.metricKey || (eventType === "EXPOSURE" ? "exposure" : event.eventType);
      const variantKey = event.variantKey || "control";
      const conversionId = event.properties?.orderId || event.properties?.transactionId || event.properties?.eventId || event.idempotencyKey;
      const dedupKey = eventType === "EXPOSURE"
        ? user.organizationId + ":" + event.experimentFlag + ":" + distinctUserId + ":EXPOSURE"
        : user.organizationId + ":" + event.experimentFlag + ":" + distinctUserId + ":CONVERSION:" + String(conversionId || metricKey);

      try {
        const saved = await withTenantContext(user.organizationId, async (tx) => {
          const experiment = await tx.experiment.findUnique({
            where: { flagsmithFeatureName: event.experimentFlag },
            include: { variants: true },
          });
          if (!experiment) {
            const error: any = new Error("EXPERIMENT_NOT_FOUND_FOR_TENANT");
            error.statusCode = 404;
            throw error;
          }
          const variant = experiment.variants.find((item) => item.key === variantKey);
          if (!variant) {
            const error: any = new Error("VARIANT_NOT_FOUND_FOR_EXPERIMENT");
            error.statusCode = 400;
            throw error;
          }
          const record = await tx.telemetryEvent.create({
            data: {
              experimentId: experiment.id,
              variantId: variant.id,
              distinctUserId,
              eventType,
              metricKey,
              dedupKey,
              properties: (event.properties || {}) as Prisma.InputJsonValue,
            },
          });
          if (eventType === "EXPOSURE") {
            await tx.experiment.update({
              where: { id: experiment.id },
              data: { sampleSizeCurrent: { increment: 1 } },
            });
          }
          return record;
        });

        return NextResponse.json({
          success: true, status: "PERSISTED", persisted: true, duplicate: false,
          eventId: saved.id, recordedAt: saved.timestamp.toISOString(), mode: "POSTGRESQL_TENANT_SCOPED",
        });
      } catch (error: any) {
        if (error.code === "P2002") {
          return NextResponse.json({ success: true, status: "DUPLICATE", persisted: true, duplicate: true });
        }
        return NextResponse.json({
          success: false, status: "FAILED", error: error.message || "PERSISTENT_STORAGE_ERROR",
        }, { status: error.statusCode || 503 });
      }
    }

    // Explicit offline demo mode, never used in production.
    const record = {
      id: "evt_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      experimentFlag: event.experimentFlag,
      distinctUserId: event.distinctUserId,
      eventType,
      rawEventType: event.eventType,
      variantKey: event.variantKey || "control",
      metricKey: event.metricKey || (eventType === "EXPOSURE" ? "exposure" : event.eventType),
      properties: event.properties || {},
    };
    inMemoryTelemetryLogs.unshift(record);
    if (inMemoryTelemetryLogs.length > 500) inMemoryTelemetryLogs.pop();
    return NextResponse.json({
      success: true, status: "ACCEPTED_IN_MEMORY", persisted: false, duplicate: false,
      eventId: record.id, recordedAt: record.timestamp, mode: "SANDBOX_MOCK_MODE",
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false, status: "FAILED", error: "Invalid telemetry payload", details: error.message,
    }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const databaseConfigured = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock") && process.env.DATABASE_URL.startsWith("postgres"));
  if (process.env.NODE_ENV === "production" && !databaseConfigured) {
    return NextResponse.json({ success: false, error: "PERSISTENT_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  if (databaseConfigured) {
    const token = getToken(request);
    if (!token) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    const user = await getUserFromToken(token, { checkRevocation: true, failClosed: true });
    if (!user) return NextResponse.json({ success: false, error: "INVALID_SESSION" }, { status: 401 });
    try {
      const events = await withTenantContext(user.organizationId, (tx) =>
        tx.telemetryEvent.findMany({
          take: 100,
          orderBy: { timestamp: "desc" },
          include: {
            experiment: { select: { flagsmithFeatureName: true, title: true } },
            variant: { select: { key: true, isControl: true } },
          },
        })
      );
      return NextResponse.json({
        total: events.length,
        source: "POSTGRESQL_TENANT_SCOPED",
        events: events.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp.toISOString(),
          experimentFlag: entry.experiment.flagsmithFeatureName,
          experimentTitle: entry.experiment.title,
          distinctUserId: entry.distinctUserId,
          eventType: entry.eventType,
          variantKey: entry.variant.key,
          isControl: entry.variant.isControl,
          metricKey: entry.metricKey,
          properties: entry.properties,
        })),
      });
    } catch {
      return NextResponse.json({ success: false, error: "PERSISTENT_STORAGE_ERROR" }, { status: 503 });
    }
  }
  return NextResponse.json({ total: inMemoryTelemetryLogs.length, source: "IN_MEMORY_MOCK", events: inMemoryTelemetryLogs });
}
