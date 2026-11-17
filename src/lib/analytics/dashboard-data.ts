import { prisma } from "@/lib/db/prisma";
import { compareVariants } from "@/lib/analytics/stats";
import type {
  ActiveExperimentItem,
  AgentActivityItem,
  DashboardKPIData,
  PerformanceDataPoint,
  RecentActivityItem,
} from "@/lib/db/repository";

type DashboardRange = "7D" | "14D" | "30D" | "90D";

function rangeDays(range: string): number {
  if (range === "14D") return 14;
  if (range === "30D") return 30;
  if (range === "90D") return 90;
  return 7;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function isSynthetic(properties: unknown): boolean {
  return Boolean(properties && typeof properties === "object" &&
    (properties as Record<string, unknown>).isSynthetic === true);
}

export interface ProductionDashboardData {
  workspace: {
    name: string;
    environment: string;
    isDemoData: false;
    flagsmithConnected: boolean;
  };
  kpis: DashboardKPIData;
  performance: { range: DashboardRange; data: PerformanceDataPoint[] };
  activeExperiments: ActiveExperimentItem[];
  aiRecommendations: [];
  agentActivities: AgentActivityItem[];
  recentActivities: RecentActivityItem[];
}

/**
 * Build dashboard metrics only from persisted experiment/telemetry records.
 * This intentionally does not import or fall back to seeded demonstration KPIs.
 */
export async function getProductionDashboardData(range: string): Promise<ProductionDashboardData> {
  const selectedRange = (["7D", "14D", "30D", "90D"].includes(range) ? range : "7D") as DashboardRange;
  const days = rangeDays(selectedRange);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);

  const [experiments, events, auditLogs, agentRuns, project] = await Promise.all([
    prisma.experiment.findMany({
      where: { status: { in: ["ACTIVE", "RUNNING"] } },
      include: { variants: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.telemetryEvent.findMany({
      where: { timestamp: { gte: start } },
      include: {
        experiment: { select: { id: true, flagsmithFeatureName: true } },
        variant: { select: { id: true, key: true, isControl: true } },
      },
      orderBy: { timestamp: "asc" },
      take: 20000,
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, entityId: true, actorName: true, actorType: true, details: true, createdAt: true },
    }),
    prisma.agentRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, agentType: true, modelName: true, createdAt: true, structuredOutput: true },
    }),
    prisma.project.findFirst({
      include: { organization: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const persistedEvents = events.filter((event) => !isSynthetic(event.properties));
  const experimentById = new Map(experiments.map((experiment) => [experiment.id, experiment]));
  const exposureVariantByIdentity = new Map<string, string>();
  const exposuresByVariant = new Map<string, Set<string>>();
  const conversionsByVariant = new Map<string, Set<string>>();
  const daily = new Map<string, {
    exposures: Set<string>;
    conversions: Set<string>;
    controlExposures: Set<string>;
    controlConversions: Set<string>;
    treatmentExposures: Set<string>;
    treatmentConversions: Set<string>;
  }>();

  // First-touch assignments are established from exposures before any conversions
  // are considered. Conversion events without a prior experiment exposure are ignored.
  for (const event of persistedEvents) {
    if (event.eventType !== "EXPOSURE") continue;
    const day = dayKey(event.timestamp);
    if (!daily.has(day)) {
      daily.set(day, {
        exposures: new Set(),
        conversions: new Set(),
        controlExposures: new Set(),
        controlConversions: new Set(),
        treatmentExposures: new Set(),
        treatmentConversions: new Set(),
      });
    }
    const bucket = daily.get(day)!;
    const identityKey = `${event.experimentId}:${event.distinctUserId}`;
    const experiment = experimentById.get(event.experimentId);
    const variant = experiment?.variants.find((item) => item.id === event.variantId);
    if (!variant) continue;

    if (!exposuresByVariant.has(event.variantId)) exposuresByVariant.set(event.variantId, new Set());
    exposuresByVariant.get(event.variantId)!.add(identityKey);
    exposureVariantByIdentity.set(identityKey, event.variantId);
    bucket.exposures.add(identityKey);
    if (variant.isControl) bucket.controlExposures.add(identityKey);
    else bucket.treatmentExposures.add(identityKey);
  }

  for (const event of persistedEvents) {
    if (event.eventType !== "CONVERSION") continue;
    const identityKey = `${event.experimentId}:${event.distinctUserId}`;
    const assignedVariantId = exposureVariantByIdentity.get(identityKey);
    if (!assignedVariantId) continue;

    const variant = experimentById.get(event.experimentId)?.variants.find((item) => item.id === assignedVariantId);
    if (!variant) continue;

    const day = dayKey(event.timestamp);
    if (!daily.has(day)) {
      daily.set(day, {
        exposures: new Set(),
        conversions: new Set(),
        controlExposures: new Set(),
        controlConversions: new Set(),
        treatmentExposures: new Set(),
        treatmentConversions: new Set(),
      });
    }
    const bucket = daily.get(day)!;
    if (!conversionsByVariant.has(assignedVariantId)) conversionsByVariant.set(assignedVariantId, new Set());
    conversionsByVariant.get(assignedVariantId)!.add(identityKey);
    bucket.conversions.add(identityKey);
    if (variant.isControl) bucket.controlConversions.add(identityKey);
    else bucket.treatmentConversions.add(identityKey);
  }

  const activeExperiments: ActiveExperimentItem[] = [];
  let successfulExperiments = 0;
  let readyForRollout = 0;
  const lifts: number[] = [];

  for (const experiment of experiments) {
    const control = experiment.variants.find((variant) => variant.isControl) || experiment.variants[0];
    if (!control) continue;

    const controlExposures = exposuresByVariant.get(control.id)?.size || 0;
    const controlConversions = conversionsByVariant.get(control.id)?.size || 0;
    const comparisons = experiment.variants
      .filter((variant) => variant.id !== control.id)
      .map((variant) => {
        const exposures = exposuresByVariant.get(variant.id)?.size || 0;
        const conversions = conversionsByVariant.get(variant.id)?.size || 0;
        if (exposures === 0 || controlExposures === 0) return null;
        return {
          variant,
          exposures,
          conversions,
          result: compareVariants(
            { key: control.key, name: control.name, isControl: true, exposures: controlExposures, conversions: controlConversions },
            { key: variant.key, name: variant.name, isControl: false, exposures, conversions }
          ),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const leading = [...comparisons].sort((a, b) => b.result.bayesianProbabilityToBeatControl - a.result.bayesianProbabilityToBeatControl)[0];
    const controlTraffic = Number(control.trafficAllocation || 0);
    const treatmentTraffic = experiment.variants
      .filter((variant) => variant.id !== control.id)
      .reduce((sum, variant) => sum + Number(variant.trafficAllocation || 0), 0);

    if (leading && leading.result.isSignificant && leading.result.relativeUpliftPercent > 0) {
      successfulExperiments++;
      lifts.push(leading.result.relativeUpliftPercent);
    }
    const totalExperimentExposures = experiment.variants.reduce(
      (sum, variant) => sum + (exposuresByVariant.get(variant.id)?.size || 0), 0
    );
    const isReadyForRollout = Boolean(
      totalExperimentExposures >= experiment.sampleSizeTarget &&
      leading?.result.isSignificant &&
      leading.result.bayesianProbabilityToBeatControl >= 0.95
    );
    if (isReadyForRollout) readyForRollout++;

    activeExperiments.push({
      id: experiment.id,
      name: experiment.title,
      flagsmithFeature: experiment.flagsmithFeatureName,
      controlVariant: control.name,
      winningCandidate: leading?.variant.name || null,
      trafficAllocation: {
        control: controlTraffic,
        treatment: treatmentTraffic,
      },
      status: isReadyForRollout
        ? "ready_for_rollout"
        : experiment.status === "RUNNING" ? "running" : "active",
      liftPercent: leading ? Number(leading.result.relativeUpliftPercent.toFixed(1)) : null,
      confidencePercent: leading ? Number((leading.result.bayesianProbabilityToBeatControl * 100).toFixed(1)) : null,
      lastUpdated: experiment.updatedAt.toISOString(),
    });
  }

  const exposureIdentities = new Set<string>();
  const conversionIdentities = new Set<string>();
  for (const event of persistedEvents) {
    const identityKey = `${event.experimentId}:${event.distinctUserId}`;
    if (event.eventType === "EXPOSURE") exposureIdentities.add(identityKey);
    else conversionIdentities.add(identityKey);
  }

  const totalExposures = exposureIdentities.size;
  const totalConversions = conversionIdentities.size;
  const conversionRate = totalExposures > 0 ? totalConversions / totalExposures : 0;
  const averageLift = lifts.length > 0 ? lifts.reduce((sum, item) => sum + item, 0) / lifts.length : 0;

  const performance: PerformanceDataPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const key = dayKey(date);
    const bucket = daily.get(key);
    const exposureCount = bucket?.exposures.size || 0;
    const conversionCount = bucket?.conversions.size || 0;
    const controlRate = bucket && bucket.controlExposures.size > 0
      ? (bucket.controlConversions.size / bucket.controlExposures.size) * 100
      : 0;
    const treatmentRate = bucket && bucket.treatmentExposures.size > 0
      ? (bucket.treatmentConversions.size / bucket.treatmentExposures.size) * 100
      : 0;
    performance.push({
      date: dateLabel(date),
      exposures: exposureCount,
      conversions: conversionCount,
      conversionRate: exposureCount > 0 ? Number(((conversionCount / exposureCount) * 100).toFixed(2)) : 0,
      controlRate: Number(controlRate.toFixed(2)),
      treatmentRate: Number(treatmentRate.toFixed(2)),
    });
  }

  const kpis: DashboardKPIData = {
    activeExperiments: {
      value: experiments.length,
      change: "Current persisted status",
      trend: "neutral",
      tooltip: "Experiments with ACTIVE or RUNNING status in PostgreSQL.",
    },
    totalExposures: {
      value: totalExposures,
      displayValue: totalExposures.toLocaleString("en-US"),
      change: `${totalExposures.toLocaleString("en-US")} unique experiment-user exposures in the selected range`,
      trend: "neutral",
      tooltip: "Distinct user exposures persisted in PostgreSQL, excluding events explicitly marked synthetic.",
    },
    overallConversionRate: {
      value: conversionRate,
      displayValue: `${(conversionRate * 100).toFixed(2)}%`,
      change: `${totalConversions.toLocaleString("en-US")} unique converted experiment-user pairs`,
      trend: "neutral",
      tooltip: "Unique converted experiment-user pairs divided by unique exposures in the selected range.",
    },
    averageExpectedLift: {
      value: averageLift,
      displayValue: `${averageLift >= 0 ? "+" : ""}${averageLift.toFixed(1)}%`,
      change: lifts.length ? `Across ${lifts.length} statistically significant positive test(s)` : "No statistically significant positive tests yet",
      trend: lifts.length ? "positive" : "neutral",
      tooltip: "Mean relative uplift only across experiments with positive frequentist significance.",
    },
    successfulExperiments: {
      value: successfulExperiments,
      change: "Positive uplift with p < 0.05",
      trend: successfulExperiments ? "positive" : "neutral",
      tooltip: "Experiments whose persisted telemetry shows positive treatment uplift at p < 0.05.",
    },
    featuresReadyForRollout: {
      value: readyForRollout,
      change: "Requires sample target, significance and 95% Bayesian probability",
      trend: "neutral",
      tooltip: "Experiments meeting configured sample size, p-value, and Bayesian rollout thresholds.",
    },
  };

  const recentActivities: RecentActivityItem[] = auditLogs.map((log) => ({
    id: log.id,
    type: (["EXPERIMENT_CREATED", "FLAG_ACTIVATED", "CONVERSION_RECORDED", "EXPERIMENT_COMPLETED", "ROLLOUT_APPROVED", "ROLLBACK_PERFORMED"].includes(log.action)
      ? log.action
      : "EXPERIMENT_CREATED") as RecentActivityItem["type"],
    title: log.action.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
    actor: log.actorName || "System",
    actorType: log.actorType === "human" || log.actorType === "agent" ? log.actorType : "system",
    timestamp: log.createdAt.toISOString(),
    details: log.details || log.entityId,
  }));

  const agentActivities: AgentActivityItem[] = agentRuns.map((run) => ({
    id: run.id,
    name: run.agentType.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
    role: run.agentType,
    avatarIcon: "bot",
    status: "ready",
    latestActivity: "Persisted agent run",
    timestamp: run.createdAt.toISOString(),
    model: run.modelName,
  }));

  return {
    workspace: {
      name: project?.organization?.name || project?.name || "PulsePilot Workspace",
      environment: process.env.NEXT_PUBLIC_APP_ENV || "production",
      isDemoData: false,
      flagsmithConnected: Boolean(process.env.FLAGSMITH_SERVER_SIDE_API_KEY || process.env.FLAGSMITH_ENVIRONMENT_KEY),
    },
    kpis,
    performance: { range: selectedRange, data: performance },
    activeExperiments,
    aiRecommendations: [],
    agentActivities,
    recentActivities,
  };
}
