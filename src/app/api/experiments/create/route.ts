import { NextResponse } from "next/server";
import { ExperimentStrategySchema, validateExperimentStrategy } from "@/lib/ai/schemas";
import { createFlagsmithMultivariateFeature } from "@/lib/flagsmith/flagsmith-admin";
import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { reviewExperimentReadinessWithMetadata } from "@/lib/ai/gemini-client";

export async function POST(request: Request) {
  const user = await getAuthenticatedApplicationUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "EDITOR") {
    return NextResponse.json({ success: false, error: "INSUFFICIENT_PERMISSIONS" }, { status: 403 });
  }
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock")) {
    return NextResponse.json({ success: false, error: "PERSISTENT_DATABASE_REQUIRED" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const strategy = ExperimentStrategySchema.parse(body.strategy);
    const validation = validateExperimentStrategy(strategy);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: "EXPERIMENT_PLAN_INVALID",
        message: "The strategy must pass deterministic validation before provisioning.",
        validation,
      }, { status: 422 });
 ¶»§q«^