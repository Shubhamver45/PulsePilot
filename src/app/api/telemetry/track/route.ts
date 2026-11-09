import { NextResponse } from "next/server";
import { z } from "zod";
import { inMemoryTelemetryLogs } from "@/lib/telemetry/store";

const TelemetryEventSchema = z.object({
  experimentFlag: z.string().min(1),
  distinctUserId: z.string().min(1),
  eventType: z.enum(["EXPOSURE", "CONVERSION"]),
  variantKey: z.string().optional(),
  metricKey: z.string().optional(),
  properties: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = TelemetryEventSchema.parse(body);

    const record = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };

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
