"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flag,
  Layers,
  RefreshCw,
  ShieldCheck,
  Terminal,
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
  liveFlagsCount: number;
  lastSynchronizedAt: string;
  activeExperimentFlag: null | {
    featureId: number | null;
    stateId: number | null;
    name: string;
    type: string | null;
    enabled: boolean | null;
    defaultValue: unknown;
    variants: Array<{
      optionId: number | null;
      value: string | null;
      allocationPercent: number | null;
    }>;
    allocationTotalPercent: number | null;
  };
  managementError?: string | null;
}

export default function FlagsmithIntegrationPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/flagsmith/health", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Unable to read Flagsmith health.");
      }
      setHealth(data as HealthData);
    } catch (error: any) {
      setLoadError(error?.message || "Unable to read Flagsmith health.");
      setHealth(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const flag = health?.activeExperimentFlag ?? null;
  const edgeReady = health?.edgeConnected === true;
  const managementReady = health?.managementApiConnected === true;
  const formatValue = (value: unknown) => {
    if (value === undefined || value === null) return "Not returned";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="Flagsmith Integration Status"
        description="Live Edge evaluation and authoritative Management API state are shown independently. A successful Edge request does not imply that multivariate allocations or remote mutations are configured."
        badge={
          <StatusBadge
            status={edgeReady && managementReady ? "active" : "warning"}
            label={
              edgeReady && managementReady
                ? "EDGE + MANAGEMENT READY"
                : edgeReady
                  ? "EDGE CONNECTED · MANAGEMENT UNAVAILABLE"
                  : "EDGE UNAVAILABLE"
            }
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchHealth()}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-md bg-surface border border-border hover:bg-surface-subtle text-xs font-semibold text-text flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh status
            </button>
            <a
              href="https://app.flagsmith.com/project/53867"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              Flagsmith Console <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        }
      />

      {loadError && (
        <div role="alert" className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 text-xs">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
        <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
          <span className="text-text-secondary font-medium">Flagsmith Edge</span>
          <p className={`font-bold text-sm ${edgeReady ? "text-emerald-700" : "text-amber-700"}`}>
            {isLoading ? "Checking…" : edgeReady ? "Connected" : "Unavailable"}
          </p>
          <span className="text-[11px] text-text-muted">
            {health?.measuredLatencyMs == null ? "Latency not measured" : `${health.measuredLatencyMs} ms response`}
          </span>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
          <span className="text-text-secondary font-medium">Organisation Management API</span>
          <p className={`font-bold text-sm ${managementReady ? "text-emerald-700" : "text-amber-700"}`}>
            {isLoading ? "Checking…" : managementReady ? "Connected" : "Not configured"}
          </p>
          <span className="text-[11px] text-text-muted">
            Organisation API token: {health?.apiKeyConfigured ? "configured" : "missing"}
          </span>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
          <span className="text-text-secondary font-medium">Flags returned by Edge</span>
          <p className="font-bold text-primary text-sm flex items-center gap-1.5">
            <Layers className="w-4 h-4" /> {health?.liveFlagsCount ?? 0}
          </p>
          <span className="text-[11px] text-text-muted">Read-only `GET /flags/` response</span>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
          <span className="text-text-secondary font-medium">Experiment readiness</span>
          <p className={`font-bold text-sm ${health?.experimentationReadiness === "READY" ? "text-emerald-700" : "text-amber-700"}`}>
            {health?.experimentationReadiness || (isLoading ? "Checking…" : "Unknown")}
          </p>
          <span className="text-[11px] text-text-muted">Requires a verified Management feature state</span>
        </div>
      </div>

      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center text-primary">
            <Flag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text">Configured Flagsmith environment</h2>
            <p className="text-xs text-text-secondary">
              Project {health?.projectId || "not configured"} · Environment {health?.environmentId ?? "not verified"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded bg-surface-subtle border border-border">
            <span className="text-[10px] text-text-secondary font-semibold uppercase block">Environment name</span>
            <p className="font-semibold text-text mt-1">{health?.environmentName || "Not verified"}</p>
          </div>
          <div className="p-3 rounded bg-surface-subtle border border-border">
            <span className="text-[10px] text-text-secondary font-semibold uppercase block">SDK status</span>
            <p className="font-semibold text-text mt-1">{health?.sdkStatus || "Unknown"}</p>
          </div>
          <div className="p-3 rounded bg-surface-subtle border border-border">
            <span className="text-[10px] text-text-secondary font-semibold uppercase block">Project ID</span>
            <p className="font-semibold text-text mt-1">{health?.projectId || "Not configured"}</p>
          </div>
          <div className="p-3 rounded bg-surface-subtle border border-border">
            <span className="text-[10px] text-text-secondary font-semibold uppercase block">Last Edge response</span>
            <p className="font-semibold text-text mt-1">
              {health?.lastSynchronizedAt ? new Date(health.lastSynchronizedAt).toLocaleString() : "Not available"}
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-text">Authoritative feature state</h3>
            <StatusBadge
              status={flag ? "active" : "warning"}
              label={flag ? "MANAGEMENT STATE READ" : "NOT VERIFIED"}
            />
          </div>

          {flag ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded bg-surface-subtle border border-border">
                <span className="text-[10px] text-text-secondary font-semibold uppercase">Feature</span>
                <p className="font-mono font-bold mt-1">{flag.name}</p>
                <span className="text-[10px] text-text-muted">Type: {flag.type || "Unknown"}</span>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border">
                <span className="text-[10px] text-text-secondary font-semibold uppercase">Feature / state IDs</span>
                <p className="font-mono font-bold mt-1">{flag.featureId ?? "Not returned"} / {flag.stateId ?? "Not returned"}</p>
                <span className="text-[10px] text-text-muted">Enabled: {flag.enabled == null ? "Unknown" : String(flag.enabled)}</span>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border">
                <span className="text-[10px] text-text-secondary font-semibold uppercase">Default value</span>
                <p className="font-mono font-bold mt-1 break-all">{formatValue(flag.defaultValue)}</p>
              </div>
              <div className="p-3 rounded bg-surface-subtle border border-border">
                <span className="text-[10px] text-text-secondary font-semibold uppercase">Variant allocation total</span>
                <p className="font-mono font-bold mt-1">{flag.allocationTotalPercent == null ? "Unknown" : `${flag.allocationTotalPercent}%`}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-950 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" /> Feature allocations are not available
              </div>
              <p className="text-xs leading-relaxed">
                {health?.managementError || "The Flagsmith Organisation Management API token is not configured. Edge evaluation alone cannot verify feature IDs, keyed options or traffic allocations."}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-text">Multivariate options returned by Management API</h4>
            {flag?.variants?.length ? (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-text-secondary">
                    <tr>
                      <th className="p-2.5">Option value</th>
                      <th className="p-2.5">Option ID</th>
                      <th className="p-2.5 text-right">Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flag.variants.map((variant, index) => (
                      <tr key={variant.optionId ?? variant.value ?? index} className="border-t border-border">
                        <td className="p-2.5 font-mono break-all">{variant.value ?? "Unnamed option"}</td>
                        <td className="p-2.5 font-mono">{variant.optionId ?? "Not returned"}</td>
                        <td className="p-2.5 text-right font-mono">{variant.allocationPercent == null ? "Unknown" : `${variant.allocationPercent}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-text-muted">No authoritative multivariate allocation records are available.</p>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 rounded-lg border border-border bg-surface shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-text">Integration design decision</h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          PulsePilot uses a typed server-side REST client rather than spawning CLI/MCP subprocesses from a serverless route. This keeps application request handling explicit and testable. Remote feature creation and mutations still require a scoped Organisation Management API token and authoritative post-write verification; an Edge API response is not treated as a successful mutation.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/demo-store" className="text-xs font-semibold text-primary underline">Open Demo Store</Link>
          <Link href="/release-center" className="text-xs font-semibold text-primary underline">Open Release Guardian</Link>
        </div>
      </div>
    </div>
  );
}
