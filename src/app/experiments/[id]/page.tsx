"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

interface Variant {
  variantKey: string;
  variantName: string;
  isControl: boolean;
  exposures: number;
  conversions: number;
  conversionRate: number;
  expectedLiftPercent?: number;
  chanceToWin?: number;
  pValue?: number;
  sampleRatioPValue?: number;
  configuredAllocationPercent?: number;
}

interface Scorecard {
  name: string;
  featureFlagName: string;
  status: string;
  sampleSizeTarget?: number;
  sampleSizeCurrent?: number;
  lastRefreshedAt: string;
  primaryMetric: { name: string; key: string };
  summary: {
    totalExposures: number;
    totalConversions: number;
    leadingVariationKey: string | null;
    statisticalCertaintyReached: boolean;
  };
  variations: Variant[];
}

export default function ExperimentDetailPage({ params }: { params: { id: string } }) {
  const featureName = decodeURIComponent(params.id);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/flagsmith/experiment?flag=${encodeURIComponent(featureName)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `Scorecard request failed (HTTP ${response.status}).`);
      if (!Array.isArray(payload.variations) || !payload.summary) throw new Error("No valid persisted experiment scorecard was returned.");
      setScorecard(payload as Scorecard);
    } catch (err: any) {
      setScorecard(null);
      setError(err?.message || "Persisted experiment scorecard unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [featureName]);

  useEffect(() => { void load(); }, [load]);

  const control = scorecard?.variations.find((variant) => variant.isControl);
  const treatments = scorecard?.variations.filter((variant) => !variant.isControl) ?? [];
  const leader = treatments.find((variant) => variant.variantKey === scorecard?.summary.leadingVariationKey)
    || [...treatments].sort((a, b) => (b.chanceToWin ?? 0) - (a.chanceToWin ?? 0))[0];
  const hasStatisticalEvidence = Boolean(
    scorecard &&
    scorecard.summary.totalExposures >= (scorecard.sampleSizeTarget ?? Number.POSITIVE_INFINITY) &&
    leader &&
    (leader.pValue ?? 1) < 0.05 &&
    (leader.chanceToWin ?? 0) >= 0.95 &&
    (leader.sampleRatioPValue ?? 0) > 0.01 &&
    (leader.expectedLiftPercent ?? 0) > 0
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="Experiment Detail"
        description={`Persisted scorecard for Flagsmith feature '${featureName}'. All displayed metrics are loaded from the authenticated workspace scorecard API.`}
        badge={
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${scorecard ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {scorecard ? "PERSISTED SCORECARD" : "NO VERIFIED SCORECARD"}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/experiments" className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary"><span className="inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Experiments</span></Link>
            <button onClick={() => void load()} disabled={refreshing} className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text disabled:opacity-50"><span className="inline-flex items-center gap-1"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh</span></button>
          </div>
        }
      />

      {loading && <div className="rounded-lg border border-border bg-surface p-5 text-sm text-text-secondary">Loading workspace experiment scorecard…</div>}
      {!loading && error && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Experiment evidence unavailable</div>
          <p className="text-sm">{error}</p>
          <p className="text-xs">No sample conversion rates, traffic volumes, winning variants or guardrail results are substituted.</p>
          <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold underline">Open Analytics <ArrowRight className="h-3 w-3" /></Link>
        </div>
      )}

      {scorecard && (
        <>
          <section className="rounded-lg border border-border bg-surface p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-text">{scorecard.name}</h2>
                <p className="mt-1 text-xs font-mono text-text-secondary">{scorecard.featureFlagName}</p>
              </div>
              <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase">{scorecard.status}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Exposures", scorecard.summary.totalExposures.toLocaleString()],
                ["Conversions", scorecard.summary.totalConversions.toLocaleString()],
                ["Target", scorecard.sampleSizeTarget?.toLocaleString() ?? "Not configured"],
                ["Metric", scorecard.primaryMetric.name],
              ].map(([label, value]) => <div key={label} className="rounded-md border border-border bg-surface-subtle p-3"><p className="text-[10px] uppercase text-text-muted">{label}</p><p className="mt-1 text-sm font-bold text-text">{value}</p></div>)}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5 space-y-3">
            <h3 className="text-sm font-bold text-text">Persisted variant performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-subtle text-text-secondary"><tr><th className="p-2.5">Variant</th><th className="p-2.5 text-right">Allocation</th><th className="p-2.5 text-right">Exposures</th><th className="p-2.5 text-right">Conversions</th><th className="p-2.5 text-right">Rate</th></tr></thead>
                <tbody>
                  {scorecard.variations.map((variant) => <tr key={variant.variantKey} className="border-t border-border">
                    <td className="p-2.5 font-semibold">{variant.variantName}{variant.isControl ? " · Control" : ""}<span className="block font-mono text-[10px] text-text-muted">{variant.variantKey}</span></td>
                    <td className="p-2.5 text-right font-mono">{variant.configuredAllocationPercent == null ? "Unknown" : `${variant.configuredAllocationPercent}%`}</td>
                    <td className="p-2.5 text-right font-mono">{variant.exposures.toLocaleString()}</td>
                    <td className="p-2.5 text-right font-mono">{variant.conversions.toLocaleString()}</td>
                    <td className="p-2.5 text-right font-mono">{(variant.conversionRate * 100).toFixed(2)}%</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            {control && leader && <div className="rounded-md border border-border p-3 text-xs space-y-1">
              <p>Leading treatment: <strong>{leader.variantName}</strong></p>
              <p>Relative uplift: <strong>{leader.expectedLiftPercent == null ? "Not calculated" : `${leader.expectedLiftPercent.toFixed(1)}%`}</strong></p>
              <p>p-value: <strong>{leader.pValue == null ? "Not calculated" : leader.pValue.toFixed(4)}</strong> · Bayesian probability: <strong>{leader.chanceToWin == null ? "Not calculated" : `${(leader.chanceToWin * 100).toFixed(1)}%`}</strong></p>
            </div>}
          </section>

          <section className={`rounded-lg border p-4 ${hasStatisticalEvidence ? "border-amber-300 bg-amber-50 text-amber-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> Statistical evidence does not authorize release by itself</div>
            <p className="mt-1 text-xs leading-relaxed">{hasStatisticalEvidence ? "The persisted scorecard meets the statistical checks, but operational guardrails and the live Flagsmith Management API must still be verified by the Release Guardian." : "This experiment has not met every required statistical gate. Keep collecting data and do not declare a winner. The Release Guardian also requires verified operational guardrails and a live Management API state."}</p>
            <Link href="/release-center" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline">Open Release Guardian <ArrowRight className="h-3 w-3" /></Link>
          </section>
        </>
      )}
    </div>
  );
}
