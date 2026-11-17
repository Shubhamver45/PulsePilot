"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Flag,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  Cpu,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info,
  Clock,
  Terminal,
  Activity,
  Check,
  Sliders,
  Code2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface HealthData {
  connected: boolean;
  edgeConnected: boolean;
  managementApiConnected: boolean;
  apiKeyConfigured: boolean;
  environmentKeyConfigured: boolean;
  environmentName: string;
  environmentId: number | string | null;
  projectId: string | null;
  apiBaseUrl: string;
  sdkStatus: string;
  experimentationReadiness: string;
  measuredLatencyMs: number | null;
  lastSynchronizedAt: string;
  liveFlagsCount: number;
  activeExperimentFlag?: {
    featureId: number | null;
    stateId: number | null;
    name: string;
    type: string | null;
    enabled: boolean | null;
    defaultValue: unknown;
    variants: Array<{ optionId: number | null; value: string | null; allocationPercent: number | null }>;
    allocationTotalPercent: number | null;
  } | null;
  managementError?: string | null;
  cliAndMcpEvaluation?: { cliSupport: string; mcpSupport: string; runtimeArchitecture: string; architecturalRationale: string };
}

export default function FlagsmithIntegrationPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchHealth = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/flagsmith/health");
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error("Health check error:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const flag = health?.activeExperimentFlag;
  const latency = health?.measuredLatencyMs || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="Flagsmith Remote Actuation & Edge Engine"
        description="Live telemetry, real-time edge latency, remote feature state verification, and architectural evaluation of Flagsmith Cloud integration."
        badge={
          <StatusBadge
            status={health?.connected ? "active" : "warning"}
            label={health?.edgeConnected && health?.managementApiConnected
              ? `EDGE + MANAGEMENT READY (${latency}ms)`
              : health?.edgeConnected
                ? `EDGE ONLY · MANAGEMENT API UNAVAILABLE (${latency}ms)`
                : "FLAGSMITH EDGE UNAVAILABLE"}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchHealth}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-md bg-surface border border-border hover:bg-surface-subtle text-xs font-semibold text-text flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : "text-text-secondary"}`} />
              Ping Flagsmith Edge
            </button>
            <a
              href="https://app.flagsmith.com/project/53867"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              Flagsmith Console (53867) <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        }
      />

      {/* TOP SUMMARY BANNER */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center text-primary">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text">Flagsmith Cloud Edge Runtime</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-100 text-violet-800 border border-violet-200">
                  Track 02 Core Actuation Plane
                </span>
              </div>
              <span className="text-xs text-text-secondary">
                Project ID: <strong className="text-text font-mono">{health?.projectId || "Not configured"}</strong> • Environment:{" "}
                <strong className="text-text">{health?.environmentName || "Environment not verified"} (ID: {health?.environmentId ?? "Not returned"})</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 border ${
                latency < 300
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> Edge Latency: {latency}ms
            </span>
            <StatusBadge
              status={health?.sdkStatus === "READY" ? "active" : "draft"}
              label={`SDK ${health?.sdkStatus || "READY"}`}
            />
          </div>
        </div>

        {/* 6 Grid Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-1">
            <span className="text-text-secondary font-medium">Remote Project & Environment</span>
            <p className="font-bold text-text text-sm font-mono">
              Project {health?.projectId || "53867"} / Env {health?.environmentId || "115953"}
            </p>
            <span className="text-[11px] text-text-muted">Target Flagsmith Cloud Org</span>
          </div>

          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-1">
            <span className="text-text-secondary font-medium">Live Edge Feature Flags</span>
            <p className="font-bold text-primary text-sm font-mono flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> {health?.liveFlagsCount ?? 0} Remote Flags Active
            </p>
            <span className="text-[11px] text-text-muted">Retrieved via GET /api/v1/flags/</span>
          </div>

          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-1">
            <span className="text-text-secondary font-medium">Management API</span>
            <p className={`font-bold text-sm flex items-center gap-1.5 ${health?.managementApiConnected ? "text-emerald-700" : "text-amber-700"}`}>
              {health?.managementApiConnected ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {health?.managementApiConnected ? "Connected" : "Not configured"}
            </p>
            <span className="text-[11px] text-text-muted">Edge reads do not verify feature writes or allocations</span>
          </div>

          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-1">
            <span className="text-text-secondary font-medium">Edge API Base URL</span>
            <p className="font-mono text-text text-xs truncate">{health?.apiBaseUrl || "https://api.flagsmith.com/api/v1"}</p>
            <span className="text-[11px] text-text-muted">Read-only Flagsmith Edge and Management API base</span>
          </div>

          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-1">
            <span className="text-text-secondary font-medium">Organisation API Token</span>
            <p className="font-mono text-text text-xs truncate">{health?.apiKeyConfigured ? "Configured" : "Missing"}</p>
            <span className="text-[11px] text-text-muted">Required for feature creation and remote mutations</span>
          </div>

          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-1">
            <span className="text-text-secondary font-medium">Last Synchronized</span>
            <p className="font-mono text-text text-xs">{health?.lastSynchronizedAt ? new Date(health.lastSynchronizedAt).toLocaleTimeString() : "Not available"}</p>
            <span className="text-[11px] text-text-muted">Live edge response ping</span>
          </div>
        </div>
      </div>

      {/* TASK 1 SHOWCASE: LIVE REMOTE FEATURE DEEP-DIVE */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text">Active Remote Flagsmith Experiment Feature</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                {flag ? `Remote ID #${flag.featureId ?? "Unknown"}` : "Management state not verified"}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Authoritative feature metadata and allocations appear only when the Flagsmith Management API can be read.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/demo-store"
              className="px-3 py-1.5 rounded bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              Test in Demo Store <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded bg-surface-subtle border border-border">
            <span className="text-[11px] text-text-secondary font-semibold uppercase block">Feature Key</span>
            <p className="font-mono font-bold text-text text-sm mt-0.5">{flag?.name || "No authoritative feature state"}</p>
            <span className="text-[10px] text-text-muted">Type: {flag?.type || "Unknown"}</span>
          </div>

          <div className="p-3.5 rounded bg-surface-subtle border border-border">
            <span className="text-[11px] text-text-secondary font-semibold uppercase block">Feature State ID</span>
            <p className="font-mono font-bold text-text text-sm mt-0.5">{flag?.stateId ?? "Not returned"}</p>
            <span className="text-[10px] text-emerald-700 font-semibold">Enabled: {String(flag?.enabled ?? "Unknown")}</span>
          </div>

          <div className="p-3.5 rounded bg-surface-subtle border border-border">
            <span className="text-[11px] text-text-secondary font-semibold uppercase block">Remote Allocation</span>
             {flag?.variants?.length ? (
               <div className="mt-1 space-y-1 font-mono text-[11px]">
                 {flag.variants.map((variant, index) => (
                   <div key={variant.optionId ?? variant.value ?? index} className="flex justify-between gap-2">
                     <span className="truncate">{variant.value ?? "Unnamed option"}</span>
                     <strong>{variant.allocationPercent === null ? "Unknown" : `${variant.allocationPercent}%`}</strong>
                   </div>
                 ))}
               </div>
             ) : (
               <p className="text-xs text-amber-700 font-semibold mt-1">Allocation unavailable</p>
             )}
             <span className="text-[10px] text-text-muted mt-0.5 block">Authoritative Management API state</span>
          </div>

          <div className="p-3.5 rounded bg-surface-subtle border border-border">
            <span className="text-[11px] text-text-secondary font-semibold uppercase block">Remote State Verification</span>
             <p className={`font-semibold flex items-center gap-1 mt-0.5 text-xs ${flag ? "text-emerald-700" : "text-amber-700"}`}>
               {flag ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
               {flag ? "Management state retrieved" : "Not verified"}
             </p>
             <span className="text-[10px] text-text-muted">An Edge read is not a mutation read-back</span>
          </div>
        </div>

        {/* Live connection and mutation prerequisites */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-violet-600" /> Live Identity Evaluation
            </span>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              The Edge API is connected. Test a stable identity in the Demo Store to inspect the current evaluated value.
              This page does not assume that separate identities are receiving different variants.
            </p>
            <Link href="/demo-store" className="text-violet-700 underline font-semibold">Open live Demo Store</Link>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Remote Mutation Prerequisite
              </span>
              <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${health?.managementApiConnected ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {health?.managementApiConnected ? "AVAILABLE" : "BLOCKED"}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {health?.managementApiConnected
                ? "The Organisation Management API is configured and the authoritative feature state can be read."
                : health?.managementError || "Add a scoped Flagsmith Organisation API token to enable authoritative feature state reads and mutations."}
            </p>
          </div>
        </div>
      </div>

      {/* TASK 1 INVESTIGATION: FLAGSMITH CLI & MCP EVALUATION */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Terminal className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-text">
            Flagsmith CLI & MCP Integration Investigation (Track 02 Evaluation)
          </h3>
        </div>

        <div className="p-4 rounded-lg bg-violet-50/60 border border-violet-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-violet-950 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-violet-700" /> Architectural Decision: Direct REST API v2 vs. CLI/MCP Subprocesses
            </span>
            <span className="px-2 py-0.5 rounded bg-violet-200 text-violet-900 font-mono font-bold text-[10px]">
              ENGINEERING JUSTIFICATION
            </span>
          </div>
          <p className="text-violet-900 leading-relaxed">
            {health?.cliAndMcpEvaluation?.architecturalRationale ||
              "The project uses a typed server-side REST client to avoid spawning CLI/MCP subprocesses in serverless route handlers. Live Management API operations remain disabled until a scoped Organisation API token is configured and authoritative remote state can be verified."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded bg-surface-subtle border border-border space-y-1">
            <span className="font-bold text-text block">1. Flagsmith REST API v2 (Chosen)</span>
            <p className="text-text-secondary text-[11px] leading-relaxed">
              Typed HTTPS client and versioned draft/publish flow. A real Management API credential is still required before remote mutations can be verified.
            </p>
            <span className="text-[10px] text-amber-700 font-bold block pt-1">Implemented &bull; Management credential pending</span>
          </div>

          <div className="p-3.5 rounded bg-surface-subtle border border-border space-y-1">
            <span className="font-bold text-text block">2. Flagsmith CLI (flagsmith-cli)</span>
            <p className="text-text-secondary text-[11px] leading-relaxed">
              Excellent for developer shell workflows and CI/CD pipelines, but subprocess execution in web route handlers adds latency and error parsing overhead.
            </p>
            <span className="text-[10px] text-text-muted font-bold block pt-1">Evaluated &bull; Best for CI/CD</span>
          </div>

          <div className="p-3.5 rounded bg-surface-subtle border border-border space-y-1">
            <span className="font-bold text-text block">3. Flagsmith MCP (@flagsmith/mcp)</span>
            <p className="text-text-secondary text-[11px] leading-relaxed">
              Designed for desktop IDEs (Cursor/Claude Desktop). Since PulsePilot itself is the autonomous multi-agent platform, native server-side API calls are superior.
            </p>
            <span className="text-[10px] text-text-muted font-bold block pt-1">Evaluated &bull; Best for IDE Tooling</span>
          </div>
        </div>
      </div>
    </div>
  );
}
