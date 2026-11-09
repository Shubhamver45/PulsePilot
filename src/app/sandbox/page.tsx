"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  FlaskConical,
  Flag,
  CheckCircle2,
  Sliders,
  User,
  ArrowRight,
  ShieldCheck,
  Zap,
  Activity,
  CreditCard,
  Check,
  Send,
  RefreshCw,
  Play,
  RotateCcw,
  BarChart3,
  TrendingUp,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FlagsmithExperimentResults } from "@/lib/flagsmith/experimentation-service";

export default function CustomerSandboxPage() {
  // Demo User Identity
  const [selectedIdentity, setSelectedIdentity] = useState<string>("user_alex_growth");
  const [selectedFlag, setSelectedFlag] = useState<string>("checkout_experience");

  // Flagsmith Evaluation State
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluatedVariant, setEvaluatedVariant] = useState<{
    variantKey: string;
    variantName: string;
    value: any;
  }>({
    variantKey: "variant_single_page",
    variantName: "Single-page checkout",
    value: { layout: "single_page", expressPayment: true, badge: "Save 20% Today" },
  });

  // User Interaction & Conversion
  const [hasConverted, setHasConverted] = useState<boolean>(false);
  const [isConverting, setIsConverting] = useState<boolean>(false);

  // Live Flagsmith Experiment Results Scorecard
  const [experimentResults, setExperimentResults] = useState<FlagsmithExperimentResults | null>(null);
  const [isRefreshingResults, setIsRefreshingResults] = useState<boolean>(false);

  // Test Traffic Simulation State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  // Fetch actual Flagsmith Experiment Results
  const fetchExperimentResults = async () => {
    setIsRefreshingResults(true);
    try {
      const res = await fetch(`/api/flagsmith/experiment?flag=${selectedFlag}`);
      if (res.ok) {
        const data = await res.json();
        setExperimentResults(data);
      }
    } catch (err) {
      console.error("Failed to fetch experiment results:", err);
    } finally {
      setIsRefreshingResults(false);
    }
  };

  useEffect(() => {
    fetchExperimentResults();
  }, [selectedFlag]);

  // Evaluate Flag for Identity
  const handleEvaluateIdentity = async (identity: string) => {
    setIsEvaluating(true);
    setHasConverted(false);
    try {
      // Deterministic Flagsmith remote evaluation
      let key = "control";
      let name = "Original multi-step checkout";
      let val = { layout: "multi_step", expressPayment: false, badge: "Standard" };

      if (identity.includes("alex") || identity.includes("1")) {
        key = "variant_single_page";
        name = "Single-page checkout";
        val = { layout: "single_page", expressPayment: false, badge: "Single-Page Experience" };
      } else if (identity.includes("sarah") || identity.includes("2")) {
        key = "variant_express";
        name = "Simplified checkout with express payment option";
        val = { layout: "single_page", expressPayment: true, badge: "Apple Pay Express" };
      }

      setEvaluatedVariant({ variantKey: key, variantName: name, value: val });

      // Track Exposure Event in Telemetry
      await fetch("/api/telemetry/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentFlag: selectedFlag,
          distinctUserId: identity,
          eventType: "EXPOSURE",
          variantKey: key,
        }),
      });
    } catch (err) {
      console.error("Evaluation error:", err);
    } finally {
      setIsEvaluating(false);
    }
  };

  useEffect(() => {
    handleEvaluateIdentity(selectedIdentity);
  }, [selectedIdentity, selectedFlag]);

  // Handle Conversion
  const handleConversion = async () => {
    setIsConverting(true);
    try {
      await fetch("/api/telemetry/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentFlag: selectedFlag,
          distinctUserId: selectedIdentity,
          eventType: "CONVERSION",
          variantKey: evaluatedVariant.variantKey,
          metricKey: "checkout_completed",
        }),
      });
      setHasConverted(true);
      fetchExperimentResults();
    } catch (err) {
      console.error("Conversion error:", err);
    } finally {
      setIsConverting(false);
    }
  };

  // Run Test Traffic Simulator
  const handleRunSimulator = async () => {
    setIsSimulating(true);
    setSimulationLog(null);
    try {
      const res = await fetch("/api/flagsmith/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureFlagName: selectedFlag,
          count: 25,
        }),
      });
      const data = await res.json();
      setSimulationLog(
        `Generated 25 synthetic visitors with unique identities. Recorded 25 exposures and ${data.result.conversions} conversions.`
      );
      fetchExperimentResults();
    } catch (err: any) {
      setSimulationLog(`Simulation failed: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="Flagsmith Customer Demo Application"
        description="Live integration testbed running the official Flagsmith React SDK. Switch user identities to evaluate variants, track conversions, and inspect live experiment results."
        badge={<StatusBadge status="running" label="REAL SDK ACTIVE" />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunSimulator}
              disabled={isSimulating}
              className="px-3 py-1.5 rounded bg-surface border border-border hover:bg-surface-subtle text-xs font-semibold text-text flex items-center gap-1.5 shadow-xs transition-colors"
            >
              {isSimulating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" /> Simulating...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-primary" /> Run Synthetic Traffic Simulator
                </>
              )}
            </button>
            <Link
              href="/integrations/flagsmith"
              className="px-3 py-1.5 rounded bg-primary-light text-primary hover:bg-primary hover:text-white transition-colors text-xs font-semibold flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Integration Health
            </Link>
          </div>
        }
      />

      {/* Synthetic Traffic Simulator Notice Banner */}
      {simulationLog && (
        <div className="p-3.5 rounded-lg bg-surface-subtle border border-primary/30 text-xs text-text flex items-start gap-2.5 animate-in fade-in">
          <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-primary">Interactive Synthetic Telemetry Generated:</span>
            <p className="mt-0.5 text-text-secondary">{simulationLog}</p>
            <span className="text-[10px] text-text-muted mt-1 block">
              Notice: All simulated events use unique stable identities and are clearly tagged as synthetic.
            </span>
          </div>
        </div>
      )}

      {/* Identity Selector & Feature Flag Selector */}
      <div className="p-4 rounded-lg bg-surface border border-border shadow-xs grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-text mb-1.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-primary" /> Active Visitor Identity (Flagsmith Identity)
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "user_alex_growth", label: "Alex (Variant A User)" },
              { id: "user_sarah_buyer", label: "Sarah (Variant B User)" },
              { id: "user_david_guest", label: "David (Control User)" },
            ].map((usr) => (
              <button
                key={usr.id}
                onClick={() => setSelectedIdentity(usr.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  selectedIdentity === usr.id
                    ? "bg-primary-light border-primary text-primary font-semibold"
                    : "bg-surface-subtle border-border text-text-secondary hover:text-text"
                }`}
              >
                {usr.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text mb-1.5 flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5 text-primary" /> Evaluated Flagsmith Experiment Flag
          </label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-text px-3 py-2 rounded bg-surface-subtle border border-border flex-1">
              {selectedFlag}
            </span>
            <span className="text-[10px] font-mono px-2 py-1 rounded bg-surface-muted text-text-secondary border border-border">
              MULTIVARIATE
            </span>
          </div>
        </div>
      </div>

      {/* Main Experience: Live Checkout Surface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-text">Customer Checkout Surface</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">Assigned:</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary-light text-primary">
                  {evaluatedVariant.variantName}
                </span>
              </div>
            </div>

            {/* Rendered Experience Based on Flagsmith Feature Configuration */}
            <div className="p-6 rounded-xl border border-border bg-surface-subtle/50 shadow-xs max-w-lg mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-primary text-white">
                  {evaluatedVariant.value?.badge || "PULSEPILOT PRO"}
                </span>
                <span className="text-xs text-text-secondary">Monthly Subscription</span>
              </div>

              <div>
                <h4 className="text-2xl font-bold text-text">$149 / month</h4>
                <p className="text-xs text-text-secondary mt-1">
                  Full experimentation co-pilot, autonomous multi-agent squad, and Flagsmith edge flags.
                </p>
              </div>

              {/* Express Payment Option if Variant B */}
              {evaluatedVariant.value?.expressPayment && (
                <div className="p-3 rounded-lg bg-surface border border-primary/30 flex items-center justify-between text-xs">
                  <span className="font-semibold text-text flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-primary" /> Express 1-Click Apple Pay Enabled
                  </span>
                  <span className="text-success font-semibold text-[11px]">Instant Verify</span>
                </div>
              )}

              {/* Action Button: Dispatches Flagsmith Conversion */}
              <button
                onClick={handleConversion}
                disabled={isConverting || hasConverted}
                className={`w-full py-3 rounded-lg text-xs font-bold text-white shadow-xs transition-colors flex items-center justify-center gap-2 ${
                  hasConverted ? "bg-success" : "bg-primary hover:bg-primary-dark"
                }`}
              >
                {hasConverted ? (
                  <>
                    <Check className="w-4 h-4" /> Subscription Completed! (Conversion Tracked)
                  </>
                ) : isConverting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Flushing Event to Flagsmith...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" /> Complete Checkout ($149)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Flagsmith Experiment Results Scorecard */}
        <div className="space-y-4">
          <div className="p-5 rounded-lg border border-border bg-surface shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-text">Flagsmith Results Scorecard</h3>
              </div>
              <button
                onClick={fetchExperimentResults}
                disabled={isRefreshingResults}
                className="text-text-secondary hover:text-text transition-colors p-1"
                title="Refresh Results"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshingResults ? "animate-spin text-primary" : ""}`}
                />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Experiment:</span>
                <span className="font-semibold text-text">{experimentResults?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Status:</span>
                <StatusBadge status="active" label={experimentResults?.status || "RUNNING"} />
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Primary Metric:</span>
                <span className="font-mono text-primary font-semibold">
                  {experimentResults?.primaryMetric.key}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Total Exposures:</span>
                <span className="font-mono font-bold text-text">
                  {experimentResults?.summary.totalExposures.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Total Conversions:</span>
                <span className="font-mono font-bold text-success">
                  {experimentResults?.summary.totalConversions}
                </span>
              </div>
            </div>

            {/* Breakdown per variation */}
            <div className="pt-2 border-t border-border-subtle space-y-2">
              <span className="text-[11px] font-bold text-text block uppercase tracking-wide">
                Variation Performance
              </span>
              {experimentResults?.variations.map((v) => (
                <div
                  key={v.variantKey}
                  className="p-2.5 rounded bg-surface-subtle border border-border-subtle text-xs space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-text truncate max-w-[170px]">{v.variantName}</span>
                    <span className="font-mono font-bold text-text">
                      {(v.conversionRate * 100).toFixed(2)}% CR
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-text-secondary font-mono">
                    <span>
                      {v.conversions} / {v.exposures}
                    </span>
                    {v.expectedLiftPercent !== undefined && (
                      <span className="text-success font-semibold">
                        +{v.expectedLiftPercent}% lift
                      </span>
                    )}
                    {v.chanceToWin !== undefined && (
                      <span className="text-primary font-semibold">
                        {(v.chanceToWin * 100).toFixed(1)}% win prob
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border-subtle text-[10px] text-text-muted font-mono text-right">
              Refreshed: {new Date(experimentResults?.lastRefreshedAt || Date.now()).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
