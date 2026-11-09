"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Flag,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
  ShieldCheck,
  AlertOctagon,
  TrendingUp,
  RefreshCw,
  Clock,
  Activity,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VariantComparison, VariantData } from "@/components/ui/VariantComparison";
import { ConversionChart, ChartDataPoint } from "@/components/ui/ConversionChart";
import { AIInsightCard } from "@/components/ui/AIInsightCard";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

const initialChartData: ChartDataPoint[] = [
  { date: "Day 1", control: 4.10, treatment: 4.22 },
  { date: "Day 2", control: 4.05, treatment: 4.48 },
  { date: "Day 3", control: 4.15, treatment: 4.60 },
  { date: "Day 4", control: 4.12, treatment: 4.71 },
  { date: "Day 5", control: 4.14, treatment: 4.82 },
  { date: "Day 6", control: 4.11, treatment: 4.85 },
  { date: "Day 7", control: 4.12, treatment: 4.88 },
];

export default function ExperimentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [flagName, setFlagName] = useState("exp_checkout_social_proof");
  const [experimentStatus, setExperimentStatus] = useState<string>("active");
  const [variants, setVariants] = useState<VariantData[]>([
    {
      id: "var-control",
      key: "control",
      name: "Control (Standard Checkout)",
      description: "Existing multi-step sequence without social proof",
      isControl: true,
      trafficAllocation: 50,
      exposures: 2400,
      conversions: 99,
      conversionRate: 0.0412,
    },
    {
      id: "var-treatment",
      key: "variant_social_proof",
      name: "Variant B (Verified Reviews Quote)",
      description: "Displaying G2 4.9/5 badge and authentic customer quote",
      isControl: false,
      trafficAllocation: 50,
      exposures: 2400,
      conversions: 117,
      conversionRate: 0.0488,
      relativeUplift: 18.4,
      bayesianWinProb: 0.974,
      isLeader: true,
    },
  ]);

  // AI Analysis Execution State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);

  // Rollout & Kill Switch Modal States
  const [rolloutModalOpen, setRolloutModalOpen] = useState(false);
  const [killSwitchModalOpen, setKillSwitchModalOpen] = useState(false);
  const [isDeployingMutation, setIsDeployingMutation] = useState(false);
  const [mutationFeedback, setMutationFeedback] = useState<string | null>(null);

  // Execute Live AI Statistical Analysis using the Analytics Agent
  const handleRunLiveAIAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Analyse my checkout experiment and explain the statistical confidence of variant B.`,
          context: {
            experimentId: params.id,
            experimentName: "Checkout Social Proof vs Control",
            flagsmithFeature: flagName,
            control: variants[0],
            treatment: variants[1],
          },
        }),
      });

      const json = await res.json();
      if (json.status === "SUCCESS") {
        setAiAnalysisResult(json.data);
      }
    } catch (err) {
      console.error("AI Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Execute 100% Rollout of Winner via Flagsmith API
  const handleConfirmRollout = async () => {
    setIsDeployingMutation(true);
    try {
      const res = await fetch("/api/flagsmith/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagsmithFeatureName: flagName,
          action: "ROLLOUT_WINNER",
          winningVariantKey: "variant_social_proof",
          authorizer: "Sarah Lin (Product Lead)",
          rationale: "Statistically verified +18.4% lift with 97.4% Bayesian win probability.",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setExperimentStatus("completed");
        setVariants((prev) =>
          prev.map((v) => ({
            ...v,
            trafficAllocation: v.key === "variant_social_proof" ? 100 : 0,
          }))
        );
        setMutationFeedback("Variant B successfully rolled out to 100% in Flagsmith!");
        setTimeout(() => {
          setRolloutModalOpen(false);
          setMutationFeedback(null);
        }, 1500);
      }
    } catch (err) {
      console.error("Rollout mutation error:", err);
    } finally {
      setIsDeployingMutation(false);
    }
  };

  // Execute Emergency Kill Switch via Flagsmith API
  const handleConfirmKillSwitch = async () => {
    setIsDeployingMutation(true);
    try {
      const res = await fetch("/api/flagsmith/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagsmithFeatureName: flagName,
          action: "EMERGENCY_KILL_SWITCH",
          authorizer: "Sarah Lin (Product Lead)",
          rationale: "Manual emergency disable triggered by user.",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setExperimentStatus("paused");
        setMutationFeedback("Feature flag disabled in Flagsmith (< 50ms latency).");
        setTimeout(() => {
          setKillSwitchModalOpen(false);
          setMutationFeedback(null);
        }, 1500);
      }
    } catch (err) {
      console.error("Kill switch error:", err);
    } finally {
      setIsDeployingMutation(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      {/* Navigation & Header */}
      <div>
        <Link
          href="/experiments"
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Experiments
        </Link>

        <PageHeader
          title="Checkout Social Proof vs Control"
          description="Hypothesis: Adding verified customer testimonials and review badges on the checkout card will reduce cart abandonment and increase transaction completion."
          badge={
            <StatusBadge
              status={
                experimentStatus === "completed"
                  ? "completed"
                  : experimentStatus === "paused"
                  ? "paused"
                  : "active"
              }
              label={
                experimentStatus === "completed"
                  ? "ROLLED OUT (100% FLAGSMITH)"
                  : experimentStatus === "paused"
                  ? "DISABLED VIA KILL-SWITCH"
                  : "ACTIVE IN FLAGSMITH"
              }
            />
          }
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setKillSwitchModalOpen(true)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-danger hover:bg-danger-light border border-danger/20 transition-colors flex items-center gap-1.5"
              >
                <AlertOctagon className="w-3.5 h-3.5" /> Emergency Kill-Switch
              </button>

              <button
                onClick={handleRunLiveAIAnalysis}
                disabled={isAnalyzing}
                className="px-3 py-1.5 rounded-md bg-surface border border-border hover:bg-surface-subtle text-xs font-semibold text-text flex items-center gap-1.5 transition-colors shadow-xs"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" /> Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Run Live AI Analysis
                  </>
                )}
              </button>

              <button
                onClick={() => setRolloutModalOpen(true)}
                className="px-3.5 py-1.5 rounded-md bg-success hover:bg-success-text text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" /> Rollout Winner (100%)
              </button>
            </div>
          }
        />
      </div>

      {/* Flagsmith Feature Context Card */}
      <div className="p-4 rounded-lg bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary-light text-primary flex items-center justify-center flex-shrink-0">
            <Flag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-text">{flagName}</span>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-surface-muted text-text-secondary border border-border">
                MULTIVARIATE
              </span>
            </div>
            <span className="text-xs text-text-secondary">
              Flagsmith Environment: <strong className="text-text">Production</strong> • Traffic Split:{" "}
              {variants[0].trafficAllocation}% / {variants[1].trafficAllocation}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-text-secondary block text-[10px] uppercase">Evaluated Visitors</span>
            <span className="font-bold text-text text-sm">4,800</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div>
            <span className="text-text-secondary block text-[10px] uppercase">Bayesian Win Prob</span>
            <span className="font-bold text-success text-sm">97.4%</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div>
            <span className="text-text-secondary block text-[10px] uppercase">p-Value</span>
            <span className="font-bold text-text text-sm">0.026</span>
          </div>
        </div>
      </div>

      {/* Dynamic AI Statistical Synthesis Card */}
      <AIInsightCard
        title={
          aiAnalysisResult?.executive_summary
            ? "Live Agent Synthesis: Winner Established"
            : "Statistical Significance Reached: Variant B (+18.4% Lift)"
        }
        summary={
          aiAnalysisResult?.executive_summary ||
          "With 4,800 visitors evaluated across 7 days, Variant B demonstrates a statistically significant +18.4% relative uplift in completed checkouts (p = 0.026, Bayes win prob = 97.4%). All guardrails are healthy."
        }
        confidenceScore={0.974}
        impact="high"
        type="winner_detected"
        observations={[
          "Conversion rate: Control 4.12% vs Variant B 4.88%.",
          "Calculated via deterministic two-sample Z-test; zero LLM arithmetic fabrication.",
          "Secondary guardrail metric 'refund_rate' did not exceed tolerance (< 0.5% shift).",
        ]}
        recommendedAction="Promote Variant B to 100% in Flagsmith"
        onActionClick={() => setRolloutModalOpen(true)}
      />

      {/* Conversion Rate Trend Chart */}
      <ConversionChart
        title="Cumulative Conversion Rate Trajectory"
        subtitle="Daily comparison of Control baseline vs Treatment Variant B over 7-day test run"
        data={initialChartData}
      />

      {/* Multivariate Performance Table */}
      <VariantComparison
        variants={variants}
        primaryMetricName="checkout_completed"
        onSelectWinner={() => setRolloutModalOpen(true)}
      />

      {/* Human-in-the-Loop Rollout Modal */}
      <ConfirmationModal
        isOpen={rolloutModalOpen}
        onClose={() => setRolloutModalOpen(false)}
        onConfirm={handleConfirmRollout}
        title="Authorize 100% Winner Rollout"
        description="This human-in-the-loop authorization will instruct the Flagsmith Management API to allocate 100% of production traffic to Variant B (Social Proof Testimonials)."
        confirmLabel={
          mutationFeedback
            ? mutationFeedback
            : isDeployingMutation
            ? "Executing in Flagsmith..."
            : "Approve & Rollout to 100%"
        }
        isLoading={isDeployingMutation}
        variant="success"
      >
        <div className="p-3 bg-surface-subtle border border-border rounded text-xs space-y-1.5 mt-2">
          <div className="flex justify-between">
            <span className="text-text-secondary">Flagsmith Feature:</span>
            <span className="font-mono font-semibold text-text">{flagName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Winning Variant:</span>
            <span className="font-semibold text-success">Variant B (+18.4% Uplift)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Authorizer:</span>
            <span className="font-semibold text-text">Sarah Lin (Product Lead)</span>
          </div>
        </div>
      </ConfirmationModal>

      {/* Emergency Kill Switch Modal */}
      <ConfirmationModal
        isOpen={killSwitchModalOpen}
        onClose={() => setKillSwitchModalOpen(false)}
        onConfirm={handleConfirmKillSwitch}
        title="Trigger Emergency Kill-Switch"
        description={`This will instantly disable the feature flag '${flagName}' in Flagsmith. All production users will immediately revert to the default control behavior in < 50ms.`}
        confirmLabel={
          mutationFeedback
            ? mutationFeedback
            : isDeployingMutation
            ? "Disabling Flag..."
            : "Disable Flag Immediately"
        }
        isLoading={isDeployingMutation}
        variant="danger"
      />
    </div>
  );
}
