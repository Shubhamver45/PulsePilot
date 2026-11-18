"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Database,
  Flag,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

type FlagsmithHealth = {
  edgeConnected?: boolean;
  managementApiConnected?: boolean;
  liveFlagsCount?: number;
  experimentationReadiness?: string;
  measuredLatencyMs?: number | null;
  activeExperimentFlag?: {
    name?: string;
    controlPercent?: number | null;
    allocationTotalPercent?: number | null;
    variants?: Array<{ key?: string | null; allocationPercent?: number | null }>;
  } | null;
};

export default function HomePage() {
  const [health, setHealth] = useState<FlagsmithHealth | null>(null);
  const [healthState, setHealthState] = useState<"checking" | "connected" | "partial" | "unavailable">("checking");

  useEffect(() => {
    let cancelled = false;
    async function loadHealth() {
      try {
        const response = await fetch("/api/flagsmith/health", { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        setHealth(data);
        setHealthState(data.edgeConnected && data.managementApiConnected ? "connected" : "partial");
      } catch {
        if (!cancelled) setHealthState("unavailable");
      }
    }
    void loadHealth();
    return () => { cancelled = true; };
  }, []);

  const healthLabel = healthState === "connected"
    ? "Flagsmith APIs reachable"
    : healthState === "partial"
    ? "Partial connectivity"
    : healthState === "checking"
    ? "Checking live connection"
    : "Connection unavailable";

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="pointer-events-none absolute -right-36 -top-40 h-[34rem] w-[34rem] rounded-full bg-violet-100/80 blur-3xl" />
        <div className="pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-indigo-50 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-16 lg:py-24">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-violet-800">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
              AI AGENTS · FEATURE FLAGS · EXPERIMENT GOVERNANCE
            </div>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.8rem]">
                Ship better product decisions, not just more experiments.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                PulsePilot turns a product hypothesis into a governed Flagsmith experiment—then connects live assignments, persisted telemetry, statistical evidence and human-approved releases.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/demo-store" className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-800">
                Explore the live checkout demo <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-violet-300 hover:bg-violet-50">
                Create a workspace <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-violet-600" /> Flagsmith Cloud</span>
              <span className="inline-flex items-center gap-1.5"><BrainCircuit className="h-3.5 w-3.5 text-violet-600" /> AI experiment agents</span>
              <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-violet-600" /> PostgreSQL evidence</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-violet-600" /> Human approval</span>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-36px_rgba(36,31,80,0.35)] sm:p-7">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Live integration check</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">Flagsmith control plane</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${healthState === "connected" ? "bg-emerald-50 text-emerald-700" : healthState === "partial" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${healthState === "connected" ? "bg-emerald-500" : healthState === "partial" ? "bg-amber-500" : "bg-slate-400"}`} />
                  {healthLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 py-5">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-500"><Activity className="h-4 w-4" /><span className="text-xs font-medium">Edge evaluation</span></div>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{health?.edgeConnected ? "Reachable" : healthState === "checking" ? "Checking…" : "Unavailable"}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Identity and flag reads</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-500"><Workflow className="h-4 w-4" /><span className="text-xs font-medium">Management API</span></div>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{health?.managementApiConnected ? "Reachable" : healthState === "checking" ? "Checking…" : "Unavailable"}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Feature and environment state</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
                <span className="text-slate-500">Flags available in connected environment</span>
                <span className="font-mono font-semibold text-slate-900">{health?.liveFlagsCount ?? "—"}</span>
              </div>
              <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/70 p-3 text-[11px] leading-5 text-violet-950">
                {health?.experimentationReadiness === "READY" && health.activeExperimentFlag ? (
                  <>
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span>Live assignment configuration verified</span>
                      <span>{health.activeExperimentFlag.allocationTotalPercent}% allocated</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-md bg-white px-2 py-1">Control {health.activeExperimentFlag.controlPercent}%</span>
                      {health.activeExperimentFlag.variants?.map((variant) => (
                        <span key={variant.key} className="rounded-md bg-white px-2 py-1">
                          {variant.key} {variant.allocationPercent}%
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-violet-800">This verifies live allocation configuration, not statistical significance. Outcome evidence comes from persisted demo telemetry.</p>
                  </>
                ) : (
                  <>Live Flagsmith connectivity is available, but experiment allocation has not passed verification.</>
                )}
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><ShieldCheck className="h-5 w-5" /></span>
              <span><span className="block text-xs font-semibold text-slate-900">Human-in-the-loop releases</span><span className="block text-[10px] text-slate-500">Evidence before actuation</span></span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-violet-700">The operating model</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">One workflow from hypothesis to safe rollout.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Agents help with the work. Flagsmith controls the experience. Persisted evidence—not an LLM opinion—governs the release decision.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {[
            { n: "01", icon: <Sparkles className="h-5 w-5" />, title: "Design the experiment", body: "Translate a product goal into a hypothesis, variants, success metrics and guardrails. Validate the plan before it reaches Flagsmith." },
            { n: "02", icon: <Flag className="h-5 w-5" />, title: "Evaluate real assignments", body: "Use Flagsmith identity evaluation for stable control/treatment assignment and record exposure before accepting a conversion." },
            { n: "03", icon: <ShieldCheck className="h-5 w-5" />, title: "Release with evidence", body: "Calculate results from persisted telemetry, check rollout gates, and require an authorized human to approve live flag changes." },
          ].map((item) => (
            <article key={item.n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-violet-700">{item.n}</span>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">{item.icon}</span>
              </div>
              <h3 className="mt-6 text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-violet-700">Try the judge walkthrough</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">See a feature-flagged checkout before opening the workspace.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">The public storefront uses named demo personas and a simulated checkout. It is a product walkthrough, not real customer traffic or a payment flow.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link href="/demo-store" className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800">Run the storefront demo <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/demo-results" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">View live scorecard <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">Sign in to workspace <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-8 text-xs text-slate-500 sm:px-8 sm:flex-row sm:items-center sm:justify-between">
        <span>PulsePilot · AI experimentation and release governance</span>
        <span>Demo identities and checkout events are labelled as demonstration data.</span>
      </footer>
    </div>
  );
}
