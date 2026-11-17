import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { prisma } from "@/lib/db/prisma";
import {
  getFlagsmithIdentityTraitsAndFlags,
  setFlagsmithIdentityTraits,
} from "@/lib/flagsmith/flagsmith-admin";
import { simulateTestTraffic } from "@/lib/flagsmith/experimentation-service";

const PUBLIC_DEMO_EXPERIMENTS = new Set(["exp_checkout_layout_v2", "checkout_experience"]);
const PUBLIC_DEMO_ORGANIZATION_ID = "org_acme_growth";

const SimulationSchema = z.object({
  featureFlagName: z.string().min(1).max(120),
  count: z.number().int().min(1).max(100).default(20),
  scenario: z.enum(["SINGLE_PAGE_WINS", "EXPRESS_WINS", "FLAT"]).default("SINGLE_PAGE_WINS"),
});

function normaliseFeatureValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function readEvaluatedFlag(flags: any[], featureName: string) {
  const flag = flags.find((item: any) =>
    item?.feature?.name === featureName || item?.name === featureName
  );
  if (!flag) return null;

  const option =
    flag.multivariate_feature_option ??
    flag.multivariate_feature_state_value?.multivariate_feature_option ??
    null;
  const rawValue = flag.feature_state_value ?? flag.value ?? option?.string_value ?? null;
  // The generic `variant` field can describe the default state rather
  // than the evaluated multivariate choice. Prefer the option key, then the
  // actual evaluated feature value, and use generic metadata only as a fallback.
  const variantKey = option?.key ?? (
    typeof rawValue === "string" ? rawValue : flag.variant ?? null
  );
  return { rawValue, variantKey };
}

function scenarioConversionProbability(
  scenario: "SINGLE_PAGE_WINS" | "EXPRESS_WINS" | "FLAT",
  variant: { key: string; name: string; isControl: boolean },
  winnerKey: string | null
): number {
  if (scenario === "FLAT") return 0.045;
  if (variant.key === winnerKey) return 0.095;
  if (variant.isControl) return 0.04;
  return 0.035;
}

async function simulateAgainstLiveFlagsmith(
  featureName: string,
  count: number,
  scenario: "SINGLE_PAGE_WINS" | "EXPRESS_WINS" | "FLAT"
) {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock")) {
    throw new Error("PERSISTENT_STORAGE_REQUIRED: synthetic events are persisted separately and are not generated in hosted memory-only mode.");
  }

  const experiment = await prisma.experiment.findFirst({
    where: {
      flagsmithFeatureName: featureName,
      project: { organizationId: PUBLIC_DEMO_ORGANIZATION_ID },
    },
    include: { variants: true },
  });

  if (!experiment || experiment.variants.length < 2) {
    throw new Error("The requested feature is not a configured public demo experiment.");
  }

  const winner = scenario === "SINGLE_PAGE_WINS"
    ? experiment.variants.find((variant) =>
        /single|treatment|variant_a/i.test(`${variant.key} ${variant.name} ${normaliseFeatureValue(variant.featureValue)}`)
      )
    : scenario === "EXPRESS_WINS"
    ? experiment.variants.find((variant) =>
        /express|variant_b/i.test(`${variant.key} ${variant.name} ${normaliseFeatureValue(variant.featureValue)}`)
      )
    : null;

  if (scenario !== "FLAT" && !winner) {
    throw new Error(`The ${scenario} scenario is not compatible with the configured variants for '${featureName}'.`);
  }

  const simulationId = randomUUID();
  const simulatedUsers: string[] = [];
  const eventRows: any[] = [];
  const perVariant = new Map<string, { key: string; name: string; isControl: boolean; exposures: number; conversions: number }>();
  for (const variant of experiment.variants) {
    perVariant.set(variant.id, {
      key: variant.key,
      name: variant.name,
      isControl: variant.isControl,
      exposures: 0,
      conversions: 0,
    });
  }
  let conversions = 0;

  // Evaluate each synthetic identity through the real Flagsmith identity API.
  // Event rows are explicitly tagged synthetic and are excluded from scorecards.
  for (let offset = 0; offset < count; offset += 5) {
    const batch = Array.from({ length: Math.min(5, count - offset) }, (_, index) => offset + index);
    const results = await Promise.all(batch.map(async (index) => {
      const identity = `pp_synth_${simulationId.replaceAll("-", "").slice(0, 12)}_${index + 1}`;
      const traitsResult = await setFlagsmithIdentityTraits(identity, [
        { trait_key: "is_synthetic", trait_value: true },
        { trait_key: "simulation_id", trait_value: simulationId },
      ]);
      if (!traitsResult.success) {
        throw new Error(`Flagsmith could not evaluate synthetic identity '${identity}': ${traitsResult.error || "unknown error"}`);
      }

      let evaluated = readEvaluatedFlag(traitsResult.flags || [], featureName);
      if (!evaluated || evaluated.rawValue === null) {
        const refreshedIdentity = await getFlagsmithIdentityTraitsAndFlags(identity);
        if (!refreshedIdentity.success) {
          throw new Error(`Flagsmith identity lookup failed for '${identity}': ${refreshedIdentity.error || "unknown error"}`);
        }
        evaluated = readEvaluatedFlag(refreshedIdentity.flags || [], featureName);
      }

      if (!evaluated) {
        throw new Error(`Flagsmith did not return feature '${featureName}' for synthetic identity '${identity}'.`);
      }

      const assignedVariant =
        experiment.variants.find((variant) => variant.key === evaluated!.variantKey) ||
        experiment.variants.find((variant) =>
          normaliseFeatureValue(variant.featureValue) === normaliseFeatureValue(evaluated!.rawValue)
        );

      if (!assignedVariant) {
        throw new Error(`Remote Flagsmith value '${String(evaluated.rawValue)}' could not be mapped to a persisted experiment variant.`);
      }

      const converted = Math.random() < scenarioConversionProbability(
        scenario,
        assignedVariant,
        winner?.key ?? null
      );

      return {
        identity,
        assignedVariant,
        evaluatedValue: evaluated.rawValue,
        converted,
        index,
      };
    }));

    for (const result of results) {
      simulatedUsers.push(result.identity);
      const variantStats = perVariant.get(result.assignedVariant.id)!;
      variantStats.exposures++;
      eventRows.push({
        experimentId: experiment.id,
        variantId: result.assignedVariant.id,
        distinctUserId: result.identity,
        eventType: "EXPOSURE",
        metricKey: "exposure",
        dedupKey: `${experiment.id}:${result.identity}:EXPOSURE`,
        properties: {
          isSynthetic: true,
          simulationId,
          scenario,
          source: "flagsmith_remote_identity",
          flagsmithValue: result.evaluatedValue,
        },
      });

      if (result.converted) {
        conversions++;
        variantStats.conversions++;
        eventRows.push({
          experimentId: experiment.id,
          variantId: result.assignedVariant.id,
          distinctUserId: result.identity,
          eventType: "CONVERSION",
          metricKey: experiment.primaryMetric,
          dedupKey: `${experiment.id}:${result.identity}:CONVERSION:SIM-${simulationId}-${result.index + 1}`,
          properties: {
            isSynthetic: true,
            simulationId,
            scenario,
            source: "flagsmith_remote_identity",
            simulatedOrderId: `SIM-${simulationId}-${result.index + 1}`,
          },
        });
      }
    }
  }

  const inserted = await prisma.telemetryEvent.createMany({
    data: eventRows,
    skipDuplicates: true,
  });

  const controlStats = [...perVariant.values()].find((variant) => variant.isControl);
  const winnerStats = winner ? perVariant.get(winner.id) : null;
  const controlRate = controlStats && controlStats.exposures > 0
    ? controlStats.conversions / controlStats.exposures
    : 0;
  const winnerRate = winnerStats && winnerStats.exposures > 0
    ? winnerStats.conversions / winnerStats.exposures
    : 0;
  const observedLiftPercent = winnerStats && controlRate > 0
    ? Number((((winnerRate - controlRate) / controlRate) * 100).toFixed(1))
    : null;

  return {
    syntheticVisitorsGenerated: count,
    exposures: count,
    conversions,
    persistedEvents: inserted.count,
    simulationId,
    simulatedUsers,
    scenario,
    winnerVariantKey: winner?.key ?? null,
    observedLiftPercent,
    variantResults: [...perVariant.values()],
    isSynthetic: true,
  };
}

export async function POST(request: Request) {
  try {
    const body = SimulationSchema.parse(await request.json());
    if (!PUBLIC_DEMO_EXPERIMENTS.has(body.featureFlagName)) {
      return NextResponse.json({
        success: false,
        error: "SIMULATION_FEATURE_NOT_ALLOWED",
        message: "Only the two seeded PulsePilot demo experiments accept public synthetic-traffic runs.",
      }, { status: 403 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const rateCheck = checkRateLimit(`sim_${ip}`, { maxRequests: 3, windowMs: 60000 });
    if (!rateCheck.allowed) {
      return NextResponse.json({
        success: false,
        error: "SIMULATION_RATE_LIMITED",
        message: "Synthetic traffic is limited to three runs per minute.",
      }, { status: 429 });
    }

    if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
      const result = await simulateAgainstLiveFlagsmith(
        body.featureFlagName,
        body.count,
        body.scenario
      );
      return NextResponse.json({
        success: true,
        isSynthetic: true,
        trafficLabel: "Synthetic QA traffic — excluded from real experiment evidence",
        result,
        notice: "Every visitor was evaluated by Flagsmith. Persisted events are marked isSynthetic=true and are excluded from real scorecards and release gates.",
      });
    }

    const localResult = await simulateTestTraffic(body.featureFlagName, body.count);
    return NextResponse.json({
      success: true,
      isSynthetic: true,
      trafficLabel: "Local synthetic sandbox traffic",
      result: localResult,
      notice: "This local-only traffic is synthetic and is not production telemetry.",
    });
  } catch (error: any) {
    console.error("[Flagsmith Simulation] Failed to generate synthetic traffic:", error?.message || error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Synthetic traffic simulation failed.",
    }, { status: 400 });
  }
}
