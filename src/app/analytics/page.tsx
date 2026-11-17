"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  FlagsmithExperimentResults,
  ExperimentVariationResult,
} from "@/lib/flagsmith/experimentation-service";

const EXPERIMENT_OPTIONS = [
  { value: "checkout_experience", label: "Checkout Conversion Optimization" },
  { value: "exp_checkout_layout_v2", label: "Checkout Layout Experiment" },
];

function percent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  return `${(value * 100).toFixed(digits)}%`;
}

function signedPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function pValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not calculated";
  return value < 0.0001 ? value.toExponential(2) : value.toFixed(4);
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "success" | "warning" | "danger" | "neutral" }) {
  const tones = {
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-red-50 text-red-800 border-red-200",
    neutral: "bg-surface-subtle text-text-secondary border-border",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="text-text-muted">{icon}</span>
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-text">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{detail}</p>
    </div>
  );
}

export default function AnalyticsIntelligencePage() {
  const [selectedFlag, setSelectedFlag] = useState("checkout_experience");
  const [results, setResults] = useState<FlagsmithExperimentResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const fetchResults = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    setAiSummary(null);
    setAiError(null);
    try {
      const response = await fetch(
        `/api/flagsmith/experiment?flag=${encodeURIComponent(selectedFlag)}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.message ||
          payload.error ||
          `Scorecard request failed with HTTP ${response.status}.`
        );
      }
      if (!Array.isArray(payload.variations) || !payload.summary) {
        throw new Error("The API response did not contain a valid persisted experiment scorecard.");
      }
      setResults(payload as FlagsmithExperimentResults);
    } catch (error: any) {
      setResults(null);
      setLoadError(error?.message || "Persistent experiment telemetry is unavailable.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedFlag]);

  useEffect(() => {
    void fetchResults();
  }, [fetchResults]);

  const control = useMemo(
    () => results?.variations.find((variant) => variant.isControl) ?? null,
    [results]
  );
  const treatments = useMemo(
    () => results?.variations.filter((variant) => !variant.isControl) ?? [],
    [results]
  );
  const leadingTreatment = useMemo<ExperimentVariationResult | null>(() => {
    if (!treatments.length) return null;
    const leadingKey = results?.summary.leadingVariationKey;
    return treatments.find((variant) => variant.variantKey === leadingKey)
      || [...treatments].sort((a, b) => (b.chanceToWin ?? 0) - (a.chanceToWin ?? 0))[0];
  }, [results, treatments]);

  const totalExposures = results?.summary.totalExposures ?? 0;
  const totalConversions = results?.summary.totalConversions ?? 0;
  const aggregateConversionRate = totalExposures > 0 ? totalConversions / totalExposures : null;
  const sampleTarget = results?.sampleSizeTarget ?? null;
  const sampleSizeMet = sampleTarget !== null && totalExposures >= sampleTarget;
  const significant = leadingTreatment?.pValue !== undefined && leadingTreatment.pValue < 0.05;
  const bayesianReady = leadingTreatment?.chanceToWin !== undefined && leadingTreatment.chanceToWin >= 0.95;
  const srmKnown = leadingTreatment?.sampleRatioPValue !== undefined;
  const srmClear = srmKnown && (leadingTreatment?.sampleRatioPValue ?? 0) > 0.01;
  const positiveLift = (leadingTreatment?.expectedLiftPercent ?? 0) > 0;
  const statisticalEvidenceReady = Boolean(sampleSizeMet && significant && bayesianReady && srmClear && positiveLift);
  const operationalGuardrailsVerified = false; // The scorecard API does not include measured guardrail values and thresholds.
  const releaseReady = Boolean(statisticalEvidenceReady && operationalGuardrailsVerified);
  const conversionChartData = (results?.variations ?? []).map((variant) => ({
    name: variant.variantName.length > 22 ? `${variant.variantName.slice(0, 19)}…` : variant.variantName,
    rate: Number((variant.conversionRate * 100).toFixed(3)),
    control: variant.isControl,
  }));

  const runAIAnalysis = async () => {
    if (!results) return;
    setIsGeneratingAI(true);
    setAiSummary(null);
    setAiError(null);
    try {
      const response = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Analyze this persisted experiment scorecard. Explain the observed effects, statistical uncertainty, sample adequacy and what evidence is still missing before release. Do not invent metric values or claim operational guardrails passed unless they are present in the data.",
          context: { experiment: results },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.status !== "SUCCESS") {
        throw new Error(payload.message || payload.error || `Analytics agent failed with HTTP ${response.status}.`);
      }
      setAiSummary(
        payload.data?.executive_summary ||
        payload.data?.executiveSummary ||
        "The analytics agent completed, but did not return an executive summary."
      );
    } catch (error: any) {
      setAiError(error?.message || "AI analysis is unavailable.");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const certaintyTone = releaseReady
    ? "success"
    : statisticalEvidenceReady
      ? "warning"
      : "warning";

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="Experiment Analytics & Intelligence"
        description="A deterministic scorecard built from authenticated, persisted, non-synthetic Flagsmith experiment telemetry. No seeded demo totals are substituted for missing evidence."
        badge={
          <Chip tone={results ? "success" : "warning"}>
            {results ? "PERSISTED SCORECARD" : "WAITING FOR PERSISTED DATA"}
          </Chip>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              disabled={!results}
              className="px-3 py-1.5 rounded-md border border-border bg-surface text-xs font-semibold text-text-secondary hover:bg-surface-subtle disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Print report</span>
            </button>
            <button
              onClick={() => void fetchResults()}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-md border border-border bg-surface text-xs font-semibold text-text hover:bg-surface-subtle disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1.5"><RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh</span>
            </button>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="space-y-1">
          <label htmlFor="experiment-select" className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Workspace experiment
          </label>
          <select
            id="experiment-select"
            value={selectedFlag}
            onChange={(event) => setSelectedFlag(event.target.value)}
            className="min-w-64 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
          >
            {EXPERIMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label} ({option.value})</option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-text-muted">
          {results ? `Last refreshed ${new Date(results.lastRefreshedAt).toLocaleString()}` : "No verified scorecard is currently loaded"}
        </p>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          Loading persisted exposure and conversion events…
        </div>
      )}

      {!isLoading && loadError && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Persisted experiment scorecard unavailable
          </div>
          <p className="text-sm leading-relaxed">{loadError}</p>
          <p className="text-xs leading-relaxed">
            No seeded exposure totals, conversion rates or guardrail values are being shown as live results. Configure the workspace database and record real Flagsmith-assigned exposures before evaluating this experiment.
          </p>
          <button onClick={() => void fetchResults()} className="text-xs font-semibold underline">Retry scorecard</button>
        </div>
      )}

      {results && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-text">{results.name}</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Flag: <span className="font-mono">{results.featureFlagName}</span> · Primary metric: {results.primaryMetric.name}
              </p>
            </div>
            <Chip tone={releaseReady ? "success" : certaintyTone}>
              {releaseReady ? "RELEASE EVIDENCE COMPLETE" : statisticalEvidenceReady ? "STATISTICAL EVIDENCE ONLY" : "EVIDENCE INCOMPLETE"}
            </Chip>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            <MetricCard
              label="Persisted exposures"
              value={totalExposures.toLocaleString()}
              detail={sampleTarget === null ? "Sample-size target not configured in this scorecard" : `Sample target: ${sampleTarget.toLocaleString()}`}
              icon={<Users className="h-4 w-4" />}
            />
            <MetricCard
              label="Unique conversions"
              value={totalConversions.toLocaleString()}
              detail={results.primaryMetric.key}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <MetricCard
              label="Observed conversion rate"
              value={aggregateConversionRate === null ? "—" : percent(aggregateConversionRate)}
              detail="Unique converted experiment identities / exposed identities"
              icon={<Activity className="h-4 w-4" />}
            />
            <MetricCard
              label="Sample target progress"
              value={sampleTarget === null ? "—" : percent(Math.min(1, totalExposures / Math.max(1, sampleTarget)))}
              detail={sampleTarget === null ? "No target supplied" : `${Math.min(totalExposures, sampleTarget).toLocaleString()} / ${sampleTarget.toLocaleString()} exposures`}
              icon={<BarChart3 className="h-4 w-4" />}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className="rounded-lg border border-border bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-text">Variant conversion comparison</h3>
                <Chip>Observed data</Chip>
              </div>
              {conversionChartData.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={conversionChartData} layout="vertical" margin={{ top: 8, right: 14, left: 12, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => `${value}%`} />
                      <YAxis type="category" dataKey="name" width={120} />
                      <Tooltip formatter={(value: number) => [`${value}%`, "Conversion rate"]} />
                      <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                        {conversionChartData.map((entry, index) => (
                          <Cell key={`variant-${index}`} fill={entry.control ? "#777D8D" : "#7565F5"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No variant exposure records are available.</p>
              )}
              <div className="overflow-x-auto border border-border rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-text-secondary">
                    <tr>
                      <th className="p-2.5">Variant</th>
                      <th className="p-2.5 text-right">Exposures</th>
                      <th className="p-2.5 text-right">Conversions</th>
                      <th className="p-2.5 text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.variations.map((variant) => (
                      <tr key={variant.variantKey} className="border-t border-border">
                        <td className="p-2.5">
                          <span className="font-medium text-text">{variant.variantName}</span>
                          <span className="block text-[10px] text-text-muted">{variant.variantKey}{variant.isControl ? " · Control" : ""}</span>
                        </td>
                        <td className="p-2.5 text-right font-mono">{variant.exposures.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-mono">{variant.conversions.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-mono">{percent(variant.conversionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-text">Deterministic statistical evidence</h3>
                <Chip tone={statisticalEvidenceReady ? "success" : "warning"}>
                  {statisticalEvidenceReady ? "Statistical gates met" : "Not yet conclusive"}
                </Chip>
              </div>

              {control && leadingTreatment ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-border bg-surface-subtle p-3">
                      <p className="text-[10px] uppercase font-semibold text-text-secondary">Leading treatment</p>
                      <p className="mt-1 text-sm font-bold text-text">{leadingTreatment.variantName}</p>
                      <p className="mt-1 font-mono text-lg font-bold text-primary">{signedPercent(leadingTreatment.expectedLiftPercent)}</p>
                      <p className="text-[10px] text-text-muted">Relative uplift vs control</p>
                    </div>
                    <div className="rounded-md border border-border bg-surface-subtle p-3">
                      <p className="text-[10px] uppercase font-semibold text-text-secondary">Bayesian win probability</p>
                      <p className="mt-1 font-mono text-lg font-bold text-text">{percent(leadingTreatment.chanceToWin)}</p>
                      <p className="text-[10px] text-text-muted">Required: 95%</p>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between gap-3 border-b border-border pb-2">
                      <span className="text-text-secondary">Two-tailed Z-test p-value</span>
                      <strong className="font-mono text-text">{pValue(leadingTreatment.pValue)}</strong>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-border pb-2">
                      <span className="text-text-secondary">95% confidence interval (absolute difference)</span>
                      <strong className="font-mono text-text">
                        {leadingTreatment.credibleInterval95
                          ? `[${percent(leadingTreatment.credibleInterval95[0])}, ${percent(leadingTreatment.credibleInterval95[1])}]`
                          : "Not calculated"}
                      </strong>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-border pb-2">
                      <span className="text-text-secondary">Sample ratio mismatch p-value</span>
                      <strong className="font-mono text-text">{pValue(leadingTreatment.sampleRatioPValue)}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-text-secondary">Configured traffic weight</span>
                      <strong className="font-mono text-text">
                        {leadingTreatment.configuredAllocationPercent === undefined
                          ? "Not supplied"
                          : `${leadingTreatment.configuredAllocationPercent}%`}
                      </strong>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-muted">Both control and treatment exposure data are required for a statistical comparison.</p>
              )}

              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <AlertTriangle className="h-4 w-4" /> Operational guardrails not verified
                </div>
                <p className="text-xs leading-relaxed">
                  This scorecard does not include measured payment-failure or application-error rates with configured safety thresholds. They must not be represented as healthy; the Release Guardian blocks rollout while this evidence is missing.
                </p>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-text flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Release evidence assessment
                </h3>
                <p className="mt-1 text-xs text-text-secondary">
                  Statistical evidence is necessary but not sufficient. Operational guardrails must also be verified.
                </p>
              </div>
              <Chip tone={releaseReady ? "success" : "warning"}>{releaseReady ? "Eligible for human review" : "Rollout blocked"}</Chip>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
              {[
                { name: "Sample target", pass: sampleSizeMet, detail: sampleTarget === null ? "No target" : `${totalExposures}/${sampleTarget}` },
                { name: "p-value", pass: significant, detail: pValue(leadingTreatment?.pValue) },
                { name: "Bayesian", pass: bayesianReady, detail: percent(leadingTreatment?.chanceToWin) },
                { name: "SRM", pass: srmClear, detail: pValue(leadingTreatment?.sampleRatioPValue) },
                { name: "Guardrails", pass: operationalGuardrailsVerified, detail: "Not verified" },
              ].map((item) => (
                <div key={item.name} className="rounded-md border border-border p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {item.pass
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                    <span className="font-semibold text-text">{item.name}</span>
                  </div>
                  <p className="font-mono text-[11px] text-text-muted">{item.detail}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {releaseReady
                ? "The available scorecard meets statistical criteria. A workspace admin must still review and approve the release."
                : "Continue collecting and validating evidence. Missing or unavailable telemetry is treated as a blocker, never as a healthy metric."}
            </p>
            <Link href="/release-center" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline">
              Open Release Guardian <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-text flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Analytics interpretation
                </h3>
                <p className="mt-1 text-xs text-text-secondary">Gemini may explain the observed evidence; all metric values above are computed by the deterministic engine.</p>
              </div>
              <button
                onClick={() => void runAIAnalysis()}
                disabled={isGeneratingAI}
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-surface-subtle disabled:opacity-50"
              >
                {isGeneratingAI ? "Analyzing…" : "Analyze this scorecard"}
              </button>
            </div>
            {aiSummary && <p className="rounded-md bg-surface-subtle p-3 text-sm leading-relaxed text-text">{aiSummary}</p>}
            {aiError && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">{aiError}</p>}
            {!aiSummary && !aiError && <p className="text-xs text-text-muted">No AI interpretation has been generated for this scorecard yet.</p>}
          </section>
        </>
      )}

      <div className="text-[11px] text-text-muted flex items-center gap-1.5">
        <Clock3 className="h-3.5 w-3.5" />
        {results ? `Persisted scorecard refreshed ${new Date(results.lastRefreshedAt).toLocaleString()}` : "No scorecard has been verified in this session"}
      </div>
    </div>
  );
}
