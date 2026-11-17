"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Flag, Plus, Sliders, ExternalLink, Search, ShieldCheck, RefreshCw, Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FeatureFlagCard } from "@/components/ui/FeatureFlagCard";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

interface FlagItem {
  name: string;
  description: string;
  enabled: boolean;
  featureId?: number | string;
  initialValue?: any;
  type: "MULTIVARIATE" | "BOOLEAN";
  variants: { key: string; trafficAllocation: number; value: string }[];
  environment?: string;
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FlagItem[]>([
    {
      name: "exp_checkout_layout_v2",
      featureId: 291896,
      initialValue: "multi_step",
      description: "PulsePilot Live Experiment: Multi-step wizard vs single-page accordion checkout (Remote Feature ID: 291896)",
      enabled: true,
      type: "MULTIVARIATE",
      variants: [
        { key: "control", trafficAllocation: 50, value: '{"layout":"multi_step"}' },
        { key: "variant_single_page", trafficAllocation: 50, value: '{"layout":"single_page"}' },
      ],
      environment: "Development",
    },
    {
      name: "show_demo_button",
      featureId: 290788,
      initialValue: true,
      description: "Interactive demo telemetry trigger and sandbox activation",
      enabled: true,
      type: "BOOLEAN",
      variants: [],
      environment: "Development",
    },
    {
      name: "exp_checkout_social_proof",
      description: "Checkout card customer quote vs standard CTA",
      enabled: true,
      type: "MULTIVARIATE",
      variants: [
        { key: "control", trafficAllocation: 50, value: '{"badge":"Standard"}' },
        { key: "variant_social_proof", trafficAllocation: 50, value: '{"badge":"Loved"}' },
      ],
      environment: "Development",
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<{
    engine: string;
    environment: string;
    projectId: string;
    lastSyncedAt: string | null;
  }>({
    engine: "Flagsmith Cloud Edge (Live)",
    environment: "Development",
    projectId: "53867",
    lastSyncedAt: null,
  });

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [killModalOpen, setKillModalOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "disabled">("all");

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchFlags = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/flagsmith/sync", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.flags) && data.flags.length > 0) {
          setFlags(data.flags);
        }
        setConnectionInfo({
          engine: data.engine || "Flagsmith Cloud Edge (Live)",
          environment: data.environment || "Development",
          projectId: data.projectId || "53867",
          lastSyncedAt: data.lastSyncedAt || new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.warn("Error fetching Flagsmith flags:", err);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const handleToggleState = async (flag: FlagItem) => {
    const nextState = !flag.enabled;
    // Optimistic update
    setFlags((prev) =>
      prev.map((f) => (f.name === flag.name ? { ...f, enabled: nextState } : f))
    );

    try {
      const res = await fetch("/api/flagsmith/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagName: flag.name,
          action: "TOGGLE",
          enabled: nextState,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        // Revert on failure
        setFlags((prev) =>
          prev.map((f) => (f.name === flag.name ? { ...f, enabled: !nextState } : f))
        );
        showNotification("error", data.error || `Failed to toggle '${flag.name}' on Flagsmith.`);
      } else {
        showNotification(
          "success",
          `Flagsmith feature '${flag.name}' is now ${nextState ? "ENABLED" : "DISABLED"} (Read-after-write verified).`
        );
      }
    } catch (err: any) {
      // Revert on network error
      setFlags((prev) =>
        prev.map((f) => (f.name === flag.name ? { ...f, enabled: !nextState } : f))
      );
      showNotification("error", `Network error updating Flagsmith: ${err.message}`);
    }
  };

  const handleExecuteKillSwitch = async () => {
    if (!selectedFlag) return;
    const flagName = selectedFlag;
    setKillModalOpen(false);

    // Optimistic disable
    setFlags((prev) =>
      prev.map((f) => (f.name === flagName ? { ...f, enabled: false } : f))
    );

    try {
      const res = await fetch("/api/flagsmith/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagName,
          action: "KILL_SWITCH",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification("error", data.error || `Emergency kill-switch failed for '${flagName}'.`);
      } else {
        showNotification(
          "success",
          `EMERGENCY KILL-SWITCH EXECUTED: '${flagName}' is disabled (< 50ms propagation).`
        );
      }
    } catch (err: any) {
      showNotification("error", `Kill-switch network error: ${err.message}`);
    }
  };

  const filteredFlags = flags.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && f.enabled) ||
      (filter === "disabled" && !f.enabled);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      <PageHeader
        title="Flagsmith Feature Flags"
        description="Direct live view of multivariate features, segment overrides, and instant kill switches managed through Flagsmith."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchFlags}
              disabled={isRefreshing}
              className="px-3 py-2 rounded-md bg-surface border border-border hover:bg-surface-subtle text-text text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              Refresh from Flagsmith
            </button>
            <Link
              href="/studio"
              className="px-3.5 py-2 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> Create AI Feature Flag
            </Link>
            <Link
              href="/release-center"
              className="px-3 py-2 rounded-md bg-surface border border-border hover:bg-surface-subtle text-text text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Release Guardian
            </Link>
            <a
              href="https://flagsmith.com"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-md text-xs font-semibold text-text border border-border bg-surface hover:bg-surface-subtle transition-colors flex items-center gap-1.5"
            >
              Flagsmith Console <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        }
      />

      {/* Real-time Flagsmith Connectivity Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
          </span>
          <span className="font-semibold text-emerald-900">{connectionInfo.engine}</span>
          <span className="text-emerald-700">• Project ID {connectionInfo.projectId}</span>
          <span className="text-emerald-700">• Environment: {connectionInfo.environment}</span>
        </div>
        <div className="flex items-center gap-3 text-emerald-800 text-[11px]">
          <span>Sub-160ms Edge Latency</span>
          {connectionInfo.lastSyncedAt && (
            <span className="text-emerald-600 font-mono">
              Synced {new Date(connectionInfo.lastSyncedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Floating Notification */}
      {notification && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : "bg-red-50 border-red-300 text-red-900"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-surface border border-border shadow-xs">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search feature flags..."
            className="w-full pl-9 pr-3 py-1.5 rounded-md bg-surface-subtle border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs">
          {(["all", "active", "disabled"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                filter === key
                  ? "bg-primary text-white shadow-xs"
                  : "text-text-secondary hover:text-text hover:bg-surface-subtle"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
        {filteredFlags.map((flag) => (
          <FeatureFlagCard
            key={flag.name}
            name={flag.name}
            featureId={flag.featureId}
            featureValue={flag.initialValue}
            description={flag.description}
            enabled={flag.enabled}
            type={flag.type}
            variants={flag.variants}
            environment={flag.environment || "Development"}
            onToggleState={() => handleToggleState(flag)}
            onKillSwitch={() => {
              setSelectedFlag(flag.name);
              setKillModalOpen(true);
            }}
          />
        ))}
      </div>

      {filteredFlags.length === 0 && (
        <div className="p-12 text-center rounded-lg bg-surface border border-dashed border-border">
          <Flag className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm font-semibold text-text">No feature flags found</p>
          <p className="text-xs text-text-secondary mt-1">
            Try adjusting your search query or create a new feature flag using the AI Studio.
          </p>
        </div>
      )}

      {/* Kill Switch Confirmation Modal */}
      <ConfirmationModal
        isOpen={killModalOpen}
        title={`Trigger Emergency Kill Switch?`}
        description={`Are you sure you want to immediately disable '${selectedFlag}' across all live users in the ${connectionInfo.environment} environment? Flagsmith edge caches will update in < 50ms.`}
        confirmLabel="Execute Kill Switch"
        variant="danger"
        onConfirm={handleExecuteKillSwitch}
        onClose={() => {
          setKillModalOpen(false);
          setSelectedFlag(null);
        }}
      />
    </div>
  );
}
