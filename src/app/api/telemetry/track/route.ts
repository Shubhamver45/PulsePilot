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
      return Next¶»§q«^