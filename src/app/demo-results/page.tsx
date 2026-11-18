import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  FlaskConical,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getFlagsmithExperimentResults } from "@/lib/flagsmith/experimentation-service";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FEATURE_NAME = "exp_pulsepilot_judge_checkout_v1";

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function uplift(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export default async function DemoResultsPage() {
  let scorecard: Awaited<ReturnType<typeof getFlagsmithExperimentResults>> = null;
  let experiment: (NonNullable<Awaited<ReturnType<typeof prisma.experiment.findUnique>>> & { variants: any[] }) | null = null;
  let syntheticEvents: any[] = [];
  let unavailable = false;

  try {
    [scorecard, experiment] = await Promise.all([
      getFlagsmithExperimentResults(FEATURE_NAME),
      prisma.experiment.findUnique({
        where: { flagsmithFeatureName: FEATURE_NAME },
        include: { variants: true },
      }),
    ]);

    if (experiment) {
      syntheticEvents = await prisma.telemetryEvent.findMany({
        where: { experimentId: experiment.id },
        select: { eventType: true, variantId: true, properties: true },
      });
    }
  } catch (error) {
    console.error("[Public demo scorecard] Failed to read persisted evidence:", error);
    unavailable = true;
  }

  const isSynthetic = (properties: unknown) =>
    Boolean(properties && typeof properties === "object" &&
      (properties as Record<string, unknown>).isSynthetic === true);
  const syntheticOnly = syntheticEvents.filter((event) => isSynthetic(event.properties));
  const syntheticExposures = syntheticOnly.filter((event) => event.eventType === "EXPOSURE").length;
  const syntheticConversions = syntheticOnly.filter((event) => event.eventType === "CONVERSION").length;

  const totalExposures = scorecard?.summary.totalExposures ?? 0;
  const totalConversions = scorecard?.summary.totalConversions ?? 0;
  const sampleTarget = scorecard?.sampleSizeTarget ?? experiment?.sampleSizeTarget ?? 500;
  const sampleProgress = sampleTarget > 0
    ? Math.min(100, Math.round((totalExposures / sampleTarget) * 100))
    : 0;
  const hasRealEvidence = totalExposures > 0;
  const certaintyReached = Boolean(scorecard?.summary.statisticalCertaintyReached);

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-950">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/demo-store" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700">
            <ArrowLeft className="h-4 w-4" /> Back to live checkout
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-800">
            <Activity className="h-3.5 w-3.5" /> LIVE PERSISTED SCORECARD
          </span>
        </div>

        <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-violet-700">Experiment evidence</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Checkout experience scorecard</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Real visitor assignments and conversions are read from Preview PostgreSQL. Synthetic QA traffic is counted separately and never included in conversion rates, statistical tests or release gates.
            </p>
            <p className="mt-3 font-mono text-xs text-slate-500">{FEATURE_NAME}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/demo-store" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">
              Run checkout demo <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {unavailable || !scorecard || !experiment ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Persisted scorecard unavailable</div>
            <p className="mt-2 leading-6">The Preview database could not provide this experiment's evidence. No sample metrics have been substituted.</p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Users className="h-4 w-4" /> Real unique exposures</div>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{totalExposures.toLocaleString("en-IN")}</p>
                <p className="mt-1 text-xs text-slate-500">First-touch assignments from Flagsmith</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><CheckCircle2 className="h-4 w-4" /> Real converted visitors</div>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{totalConversions.toLocaleString("en-IN")}</p>
                <p className="mt-1 text-xs text-slate-500">Attributed only after a persisted exposure</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><FlaskConical className="h-4 w-4" /> Sample target</div>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{sampleTarget.toLocaleString("en-IN")}</p>
                <p className="mt-1 text-xs text-slate-500">{sampleProgress}% of target reached</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><ShieldCheck className="h-4 w-4" /> Evidence state</div>
                <p className="mt-3 text-xl font-semibold">{certaintyReached ? "Statistical criteria reached" : "Collecting evidence"}</p>
                <p className="mt-1 text-xs text-slate-500">A rollout still requires authorized human approval</p>
              </article>
            </div>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Real experiment sample</h2>
                  <p className="mt-1 text-xs text-slate-500">Target: {sampleTarget.toLocaleString("en-IN")} unique exposures</p>
                </div>
                <span className="font-mono text-sm font-semibold">{totalExposures.toLocaleString("en-IN")} / {sampleTarget.toLocaleString("en-IN")}</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${sampleProgress}%` }} />
              </div>
              {!hasRealEvidence && (
                <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
                  <strong>No real visitor evidence has been recorded yet.</strong> Open the live checkout demo, proceed to checkout and complete the simulated purchase. Flagsmith will assign the variant and PulsePilot will persist the exposure and conversion. Synthetic QA events below do not count toward this sample.
                </div>
              )}
            </section>

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <h2 className="text-base font-semibold">Variant performance</h2>
                <p className="mt-1 text-xs text-slate-500">Conversion rates use real, persisted first-touch assignments only.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Variant</th>
                      <th className="px-5 py-3 font-semibold">Allocation</th>
                      <th className="px-5 py-3 font-semibold">Exposures</th>
                      <th className="px-5 py-3 font-semibold">Conversions</th>
                      <th className="px-5 py-3 font-semibold">Conversion rate</th>
                      <th className="px-5 py-3 font-semibold">Chance to beat control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {experiment.variants.map((variant) => {
                      const outcome = scorecard.variations.find((item) => item.variantKey === variant.key);
                      return (
                        <tr key={variant.id}>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">{variant.name}</div>
                            <div className="mt-1 font-mono text-[11px] text-slate-500">{variant.key}{variant.isControl ? " · Control" : ""}</div>
                          </td>
                          <td className="px-5 py-4 font-mono tabular-nums">{variant.trafficAllocation}%</td>
                          <td className="px-5 py-4 font-mono tabular-nums">{outcome?.exposures ?? 0}</td>
                          <td className="px-5 py-4 font-mono tabular-nums">{outcome?.conversions ?? 0}</td>
                          <td className="px-5 py-4 font-mono tabular-nums">{percent(outcome?.conversionRate ?? 0)}</td>
                          <td className="px-5 py-4 font-mono tabular-nums">{variant.isControl || outcome?.chanceToWin === undefined ? "—" : percent(outcome.chanceToWin)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
                Primary metric: <span className="font-mono text-slate-700">{scorecard.primaryMetric.key}</span> · Last refreshed: {new Date(scorecard.lastRefreshedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-950"><FlaskConical className="h-4 w-4" /> Synthetic QA traffic — excluded from real evidence</div>
                  <p className="mt-1 text-xs leading-5 text-amber-900">Each synthetic visitor is evaluated by Flagsmith and its QA event is persisted with isSynthetic=true. These counts are displayed separately and never affect conversion-rate calculations or rollout gates.</p>
                </div>
                <Link href="/demo-store" className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100">Run simulator <ArrowUpRight className="h-3.5 w-3.5" /></Link>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-amber-200 bg-white/80 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-amber-800">QA exposures</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">{syntheticExposures}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-white/80 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-amber-800">QA conversions</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">{syntheticConversions}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-white/80 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-amber-800">QA total events</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">{syntheticOnly.length}</div>
                </div>
              </div>
            </section>
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>PulsePilot · Live Flagsmith assignment + persisted PostgreSQL evidence</span>
          <Link href="/" className="font-semibold text-violet-700 hover:text-violet-900">Back to PulsePilot</Link>
        </div>
      </div>
    </div>
  );
}
