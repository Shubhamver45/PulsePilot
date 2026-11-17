"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BrainCircuit, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

interface DashboardData {
  workspace?: { isDemoData: boolean; name: string };
  kpis?: {
    activeExperiments: { value: number };
    totalExposures: { displayValue?: string; value: number };
    overallConversionRate: { displayValue?: string; value: number };
    successfulExperiments: { value: number };
    featuresReadyForRollout: { value: number };
  };
  activeExperiments?: Array<{
    id: string;
    name: string;
    flagsmithFeature: string;
    status: string;
    liftPercent: number | null;
    confidencePercent: number | null;
  }>;
}

export default function InsightsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard?range=7D", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Persisted experiment analytics are unavailable.");
      }
      if (payload.workspace?.isDemoData) {
        throw new Error("The dashboard API identified this workspace as demonstration data. It cannot be used as a live AI insight.");
      }
      setData(payload as DashboardData);
    } catch (err: any) {
      setData(null);
      setError(err?.message || "No verified telemetry is available for insight generation.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="AI Growth Insights"
        description="Insights are grounded in persisted, non-synthetic experiment telemetry. No sample winner, confidence score, uplift or guardrail status is presented as a live finding."
        badge={
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${data ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {data ? "PERSISTED DATA LOADED" : "WAITING FOR VERIFIED DATA"}
          </span>
        }
        actions={
          <button onClick={() => void load()} disabled={refreshing} className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-surface-subtle disabled:opacity-50">
            <span className="inline-flex items-center gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh</span>
          </button>
        }
      />

      {loading && <div className="rounded-lg border border-border bg-surface p-5 text-sm text-text-secondary">Loading persisted experiment evidence…</div>}

      {!loading && error && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> No live insight can be certified</div>
          <p className="text-sm leading-relaxed">{error}</p>
          <p className="text-xs leading-relaxed">Connect the persistent workspace database and record real Flagsmith exposures/conversions before generating business recommendations. Unknown guardrails are not treated as healthy.</p>
          <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold underline">Open analytics scorecard <ArrowRight className="h-3 w-3" /></Link>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              ["Active experiments", String(data.kpis?.activeExperiments.value ?? 0)],
              ["Persisted exposures", data.kpis?.totalExposures.displayValue ?? String(data.kpis?.totalExposures.value ?? 0)],
              ["Observed conversion rate", data.kpis?.overallConversionRate.displayValue ?? "Not available"],
              ["Rollout-ready experiments", String(data.kpis?.featuresReadyForRollout.value ?? 0)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs text-text-secondary">{label}</p>
                <p className="mt-2 font-mono text-2xl font-bold text-text">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-bold text-text">Evidence-backed experiment review</h2>
            </div>
            {data.activeExperiments?.length ? (
              <div className="space-y-3">
                {data.activeExperiments.map((experiment) => (
                  <div key={experiment.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div>
                      <p className="text-sm font-semibold text-text">{experiment.name}</p>
                      <p className="mt-0.5 text-[11px] font-mono text-text-muted">{experiment.flagsmithFeature}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {experiment.liftPercent == null ? "Uplift not established" : `Observed relative uplift: ${experiment.liftPercent.toFixed(1)}%`}
                        {" · "}
                        {experiment.confidencePercent == null ? "Confidence unavailable" : `Bayesian probability: ${experiment.confidencePercent.toFixed(1)}%`}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[10px] font-semibold uppercase text-text-secondary">{experiment.status.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No active persisted experiments are available for review.</p>
            )}
            <p className="text-xs text-text-secondary leading-relaxed">
              The deterministic scorecard is the authority for statistical claims. AI agents may explain the evidence, but must not create metrics, infer successful guardrails or declare a winner without a qualifying sample.
            </p>
            <Link href="/analytics" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline">Open full analytics <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>

          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> Release policy</div>
            <p className="mt-1 text-xs leading-relaxed">A statistical winner is not automatically a safe release. The Release Guardian also requires verified operational guardrail values and a real Flagsmith Management API connection.</p>
          </section>
        </>
      )}
    </div>
  );
}
