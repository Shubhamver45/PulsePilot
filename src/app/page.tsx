"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, BarChart3, Flag, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

interface OverviewData {
  workspace?: { name: string; environment: string; isDemoData: boolean; flagsmithConnected: boolean };
  kpis?: Record<string, { value: number; displayValue?: string; change?: string }>;
  activeExperiments?: Array<{
    id: string; name: string; flagsmithFeature: string; status: string;
    liftPercent: number | null; confidencePercent: number | null;
    winningCandidate: string | null;
  }>;
  recentActivities?: Array<{ id: string; title: string; actor: string; timestamp: string; details: string }>;
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard?range=7D", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Persisted workspace data is unavailable.");
      if (payload.workspace?.isDemoData) throw new Error("Demo workspace data is not eligible to be presented as live business evidence.");
      setData(payload as OverviewData);
    } catch (err: any) {
      setData(null);
      setError(err?.message || "Unable to load persisted workspace evidence.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const kpi = data?.kpis;
  const cards = [
    { label: "Active experiments", value: kpi?.activeExperiments?.value ?? 0, detail: kpi?.activeExperiments?.change ?? "No persisted status data", icon: <Flag className="h-4 w-4" /> },
    { label: "Unique exposures", value: kpi?.totalExposures?.displayValue ?? String(kpi?.totalExposures?.value ?? 0), detail: kpi?.totalExposures?.change ?? "No persisted event data", icon: <Users className="h-4 w-4" /> },
    { label: "Conversion rate", value: kpi?.overallConversionRate?.displayValue ?? "0.00%", detail: kpi?.overallConversionRate?.change ?? "No conversion evidence", icon: <Activity className="h-4 w-4" /> },
    { label: "Rollout-ready", value: kpi?.featuresReadyForRollout?.value ?? 0, detail: kpi?.featuresReadyForRollout?.change ?? "No experiment meets the evidence gate", icon: <ShieldCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="Experimentation & Growth Overview"
        description="PulsePilot helps product teams run Flagsmith-controlled experiments, evaluate persisted telemetry and govern feature releases."
        badge={
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${data ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {data ? "PERSISTED WORKSPACE DATA" : "LIVE DATA UNAVAILABLE"}
          </span>
        }
        actions={<button onClick={() => void load()} disabled={refreshing} className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text disabled:opacity-50"><span className="inline-flex items-center gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh</span></button>}
      />

      {loading && <div className="rounded-lg border border-border bg-surface p-5 text-sm text-text-secondary">Loading persisted workspace analytics…</div>}

      {!loading && error && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Live workspace data unavailable</div>
          <p className="text-sm">{error}</p>
          <p className="text-xs">No seeded sample metrics, active experiment winners or synthetic activity are displayed as real workspace performance. Configure persistent PostgreSQL connectivity and Flagsmith before evaluating production evidence.</p>
          <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold underline">Open analytics <ArrowRight className="h-3 w-3" /></Link>
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {cards.map((card) => <div key={card.label} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-text-secondary"><span className="text-xs font-medium">{card.label}</span>{card.icon}</div>
              <p className="mt-2 font-mono text-2xl font-bold text-text">{card.value}</p>
              <p className="mt-1 text-[11px] text-text-muted">{card.detail}</p>
            </div>)}
          </section>

          <section className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-sm font-bold text-text">Workspace experiments</h2><p className="mt-1 text-xs text-text-secondary">{data.workspace?.name || "Workspace"} · {data.workspace?.environment || "Environment"}</p></div>
              <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase text-text-secondary">{data.workspace?.flagsmithConnected ? "FLAGSMITH EDGE CONFIGURED" : "FLAGSMITH STATUS UNKNOWN"}</span>
            </div>
            {data.activeExperiments?.length ? <div className="space-y-2">
              {data.activeExperiments.map((experiment) => <div key={experiment.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-border p-3">
                <div><p className="text-sm font-semibold text-text">{experiment.name}</p><p className="mt-0.5 text-[11px] font-mono text-text-muted">{experiment.flagsmithFeature}</p><p className="mt-1 text-xs text-text-secondary">{experiment.liftPercent == null ? "No significant uplift established" : `Observed relative uplift: ${experiment.liftPercent.toFixed(1)}%`}{experiment.confidencePercent == null ? "" : ` · Bayesian probability: ${experiment.confidencePercent.toFixed(1)}%`}</p></div>
                <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[10px] font-semibold uppercase text-text-secondary">{experiment.status.replaceAll("_", " ")}</span>
              </div>)}
            </div> : <p className="text-sm text-text-muted">No active persisted experiments in this workspace.</p>}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link href="/analytics" className="rounded-lg border border-border bg-surface p-4 hover:bg-surface-subtle"><BarChart3 className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-semibold text-text">Analytics scorecards</p><p className="mt-1 text-xs text-text-secondary">Review variant-level exposure, conversion and statistical evidence.</p></Link>
            <Link href="/integrations/flagsmith" className="rounded-lg border border-border bg-surface p-4 hover:bg-surface-subtle"><Flag className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-semibold text-text">Flagsmith integration</p><p className="mt-1 text-xs text-text-secondary">Check Edge connectivity and Management API readiness separately.</p></Link>
            <Link href="/release-center" className="rounded-lg border border-border bg-surface p-4 hover:bg-surface-subtle"><ShieldCheck className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-semibold text-text">Release Guardian</p><p className="mt-1 text-xs text-text-secondary">Require verified statistical evidence and operational guardrails before rollout.</p></Link>
          </section>
        </>
      )}
    </div>
  );
}
