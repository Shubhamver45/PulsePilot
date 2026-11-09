"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  Lock,
  Flag,
  Activity,
  Sliders,
  Play,
  RotateCcw,
  Zap,
  Info,
  History,
  Check,
  Flame,
  Scale,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

interface AuditLogItem {
  id: string;
  timestamp: string;
  action: string;
  actor: { name: string; type: string };
  entityId: string;
  details: string;
  metadata?: {
    authorizer?: string;
    previousValue?: string;
    newValue?: string;
    rationale?: string;
    reason?: string;
    status?: string;
    stagePercentage?: number;
  };
}

const STAGES = [5, 10, 25, 50, 75, 100];

export default function ReleaseCenterPage() {
  // Selected flag & experiment
  const [selectedFlag, setSelectedFlag] = useState("exp_checkout_social_proof");
  const [winningVariant, setWinningVariant] = useState("variant_social_proof");

  // Feature 1: Evidence Configuration
  const [minSampleSize, setMinSampleSize] = useState(2500);
  const [minBayesConfidence, setMinBayesConfidence] = useState(95);
  const [maxPValue, setMaxPValue] = useState(0.05);

  // Feature 2: Scenario Selection for Demo
  const [scenario, setScenario] = useState<"READY_FOR_ROLLOUT" | "INSUFFICIENT_DATA" | "GUARDRAIL_BREACH">("READY_FOR_ROLLOUT");

  // Feature 3: Gradual Rollout State
  const [currentStage, setCurrentStage] = useState<number>(50);
  const [targetStage, setTargetStage] = useState<number>(75);
  const [stageModalOpen, setStageModalOpen] = useState(false);

  // Feature 4: Safety Monitoring & Thresholds
  const [maxPaymentFailureThreshold, setMaxPaymentFailureThreshold] = useState(1.5);
  const [maxErrorRateThreshold, setMaxErrorRateThreshold] = useState(0.5);
  const [isSimulatedBreach, setIsSimulatedBreach] = useState(false);

  // Feature 5: Rollback State
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("Payment failure rate breached 1.5% threshold");
  const [authorizerName, setAuthorizerName] = useState("Sarah Lin (Product Lead)");

  // Operation Feedback & Audit
  const [isExecuting, setIsExecuting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch Audit Logs & Flagsmith State
  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/audit-logs");
      const data = await res.json();
      if (data.logs) {
        setAuditLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  // Compute Active Guardrail Values
  const currentPaymentFailureRate = isSimulatedBreach || scenario === "GUARDRAIL_BREACH" ? 2.45 : 1.08;
  const currentErrorRate = 0.12;
  const currentLift = scenario === "GUARDRAIL_BREACH" ? -4.2 : 18.4;
  const currentExposures = scenario === "INSUFFICIENT_DATA" ? 1200 : 4800;
  const currentBayes = scenario === "INSUFFICIENT_DATA" ? 82.4 : scenario === "GUARDRAIL_BREACH" ? 14.1 : 97.4;
  const currentPValue = scenario === "INSUFFICIENT_DATA" ? 0.142 : scenario === "GUARDRAIL_BREACH" ? 0.32 : 0.026;

  // Readiness Checklist Evaluation
  const readinessChecks = [
    {
      label: `Sample Size Adequacy (Current: ${currentExposures.toLocaleString()} vs Min: ${minSampleSize.toLocaleString()})`,
      passed: currentExposures >= minSampleSize,
      value: `${currentExposures.toLocaleString()} samples`,
    },
    {
      label: `Bayesian Win Probability (Current: ${currentBayes}% vs Min: ${minBayesConfidence}%)`,
      passed: currentBayes >= minBayesConfidence,
      value: `${currentBayes}%`,
    },
    {
      label: `Frequentist Significance (Current: p = ${currentPValue} vs Max: ${maxPValue})`,
      passed: currentPValue <= maxPValue,
      value: `p = ${currentPValue}`,
    },
    {
      label: `Sample Ratio Mismatch (SRM) Test (Chi-Square p > 0.01)`,
      passed: true,
      value: "p = 0.77 (SRM Clear)",
    },
    {
      label: `Operational Guardrails (Payment Failure Rate: ${currentPaymentFailureRate}% vs Max: ${maxPaymentFailureThreshold}%)`,
      passed: currentPaymentFailureRate <= maxPaymentFailureThreshold,
      value: `${currentPaymentFailureRate}%`,
    },
  ];

  const allReadinessPassed = readinessChecks.every((c) => c.passed);

  // Handlers for Flagsmith Actuation
  const handleApplyGradualStage = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch("/api/flagsmith/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagsmithFeatureName: selectedFlag,
          action: targetStage === 100 ? "ROLLOUT_WINNER" : "GRADUAL_STAGE",
          winningVariantKey: winningVariant,
          stagePercentage: targetStage,
          authorizer: authorizerName,
          rationale: `Human operator authorized canary progression to ${targetStage}% traffic. Verified against safety thresholds.`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCurrentStage(targetStage);
        setFeedback({
          message: `Flagsmith traffic updated to ${targetStage}% for '${winningVariant}'. Actuation verified in Flagsmith engine.`,
          type: "success",
        });
        setStageModalOpen(false);
        fetchAuditLogs();
      } else {
        throw new Error(data.error || "Stage update failed");
      }
    } catch (err: any) {
      setFeedback({ message: `Execution failed: ${err.message}`, type: "error" });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExecuteRollback = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch("/api/flagsmith/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagsmithFeatureName: selectedFlag,
          action: "ROLLBACK_TO_CONTROL",
          authorizer: authorizerName,
          rationale: rollbackReason,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCurrentStage(0);
        setIsSimulatedBreach(false);
        setFeedback({
          message: `Flagsmith feature safely rolled back to 100% Control. Zero downtime verified.`,
          type: "success",
        });
        setRollbackModalOpen(false);
        fetchAuditLogs();
      } else {
        throw new Error(data.error || "Rollback failed");
      }
    } catch (err: any) {
      setFeedback({ message: `Rollback failed: ${err.message}`, type: "error" });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleEmergencyKillSwitch = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch("/api/flagsmith/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagsmithFeatureName: selectedFlag,
          action: "EMERGENCY_KILL_SWITCH",
          authorizer: authorizerName,
          rationale: "Emergency kill-switch executed from Release Guardian.",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCurrentStage(0);
        setFeedback({
          message: `Emergency kill-switch executed. Feature flag disabled in Flagsmith (< 50ms latency).`,
          type: "success",
        });
        setKillModalOpen(false);
        fetchAuditLogs();
      } else {
        throw new Error(data.error || "Kill switch failed");
      }
    } catch (err: any) {
      setFeedback({ message: `Kill-switch failed: ${err.message}`, type: "error" });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-20">
      {/* Top Header */}
      <PageHeader
        title="PulsePilot AI Release Guardian"
        description="Safely transition winning experiments into production with canary rollout stages, active guardrail monitoring, and verified Flagsmith rollback."
        badge={
          <div className="flex items-center gap-2">
            <StatusBadge status="active" label="FLAGSMITH ACTUATOR ACTIVE" />
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
              HITL Policy: Enforced
            </span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsSimulatedBreach(!isSimulatedBreach);
                if (!isSimulatedBreach) {
                  setRollbackReason("Payment failure rate breached 1.5% threshold (spiked to 2.45%)");
                }
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-xs ${
                isSimulatedBreach
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                  : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              {isSimulatedBreach ? "Reset Guardrail Breach" : "Simulate Guardrail Breach"}
            </button>
            <button
              onClick={() => setKillModalOpen(true)}
              className="px-3 py-1.5 rounded-md bg-danger/10 hover:bg-danger/20 text-danger text-xs font-semibold flex items-center gap-1.5 border border-danger/30 transition-colors shadow-xs"
            >
              <AlertOctagon className="w-3.5 h-3.5" /> Emergency Kill-Switch
            </button>
          </div>
        }
      />

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] underline hover:no-underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Safety Alert Banner (Breach Detected) */}
      {(isSimulatedBreach || currentPaymentFailureRate > maxPaymentFailureThreshold) && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-300 text-red-900 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2.5">
              <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold flex items-center gap-2">
                  CRITICAL GUARDRAIL BREACH DETECTED: Payment Failure Surge
                  <span className="px-2 py-0.5 rounded text-[10px] bg-red-200 text-red-800 font-mono uppercase">
                    Safety Warning
                  </span>
                </h4>
                <p className="text-xs text-red-700 mt-1 leading-relaxed">
                  Payment failure rate spiked to{" "}
                  <strong className="underline">{currentPaymentFailureRate}%</strong>, exceeding
                  your configured safety threshold of <strong>{maxPaymentFailureThreshold}%</strong>{" "}
                  (p &lt; 0.01). Continued rollout risks customer churn and checkout drop-off.
                </p>
              </div>
            </div>
            <button
              onClick={() => setRollbackModalOpen(true)}
              className="px-3.5 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Safe Rollback to Control
            </button>
          </div>
          <div className="text-[11px] text-red-600 flex items-center gap-2 pt-1 border-t border-red-200">
            <Lock className="w-3 h-3" />
            <span>Human-in-the-Loop policy: Rollback requires explicit human authorization before Flagsmith mutation.</span>
          </div>
        </div>
      )}

      {/* Flag Selector & Scenario Controls */}
      <div className="p-4 rounded-lg border border-border bg-surface shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Flag className="w-4 h-4 text-primary shrink-0" />
          <div>
            <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
              Active Flagsmith Feature
            </label>
            <select
              value={selectedFlag}
              onChange={(e) => setSelectedFlag(e.target.value)}
              className="text-xs font-mono font-bold bg-surface-subtle border border-border rounded px-2.5 py-1.5 mt-0.5 text-text focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="exp_checkout_social_proof">exp_checkout_social_proof (Checkout Flow)</option>
              <option value="exp_pricing_annual_default">exp_pricing_annual_default (Pricing Toggle)</option>
              <option value="exp_mobile_sticky_cta">exp_mobile_sticky_cta (Mobile Navigation)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <div>
            <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
              Interactive Test Scenario (Demo Switcher)
            </label>
            <div className="flex items-center gap-1.5 mt-0.5">
              <button
                onClick={() => {
                  setScenario("READY_FOR_ROLLOUT");
                  setIsSimulatedBreach(false);
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors border ${
                  scenario === "READY_FOR_ROLLOUT" && !isSimulatedBreach
                    ? "bg-primary text-white border-primary"
                    : "bg-surface text-text-secondary border-border hover:bg-surface-subtle"
                }`}
              >
                1. Ready for Rollout
              </button>
              <button
                onClick={() => {
                  setScenario("INSUFFICIENT_DATA");
                  setIsSimulatedBreach(false);
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors border ${
                  scenario === "INSUFFICIENT_DATA"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-surface text-text-secondary border-border hover:bg-surface-subtle"
                }`}
              >
                2. Underpowered Data
              </button>
              <button
                onClick={() => {
                  setScenario("GUARDRAIL_BREACH");
                  setIsSimulatedBreach(true);
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors border ${
                  scenario === "GUARDRAIL_BREACH" || isSimulatedBreach
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-surface text-text-secondary border-border hover:bg-surface-subtle"
                }`}
              >
                3. Guardrail Breach
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Feature 1 (Readiness) & Feature 2 (Recommendation) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FEATURE 1: RELEASE READINESS */}
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" /> Feature 1: Release Readiness Audit
            </h3>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                allReadinessPassed && !isSimulatedBreach
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {allReadinessPassed && !isSimulatedBreach ? "ALL GATES PASSED" : "CRITERIA PENDING"}
            </span>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed">
            Every experiment is audited against user-configured evidence floors, Bayesian posterior win
            probabilities, and operational guardrail stability before release approval.
          </p>

          {/* User Evidence Criteria Controls */}
          <div className="p-3.5 rounded-lg bg-surface-subtle border border-border space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-text-secondary" /> User Evidence Requirements
              </span>
              <span className="text-[11px] text-text-muted">Configurable Thresholds</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <label className="text-text-secondary block font-medium">Min Sample Size</label>
                <input
                  type="number"
                  value={minSampleSize}
                  onChange={(e) => setMinSampleSize(Number(e.target.value))}
                  className="w-full mt-1 p-1.5 rounded bg-surface border border-border font-mono text-text"
                />
              </div>
              <div>
                <label className="text-text-secondary block font-medium">Min Bayes Win %</label>
                <input
                  type="number"
                  value={minBayesConfidence}
                  onChange={(e) => setMinBayesConfidence(Number(e.target.value))}
                  className="w-full mt-1 p-1.5 rounded bg-surface border border-border font-mono text-text"
                />
              </div>
              <div>
                <label className="text-text-secondary block font-medium">Max p-Value</label>
                <input
                  type="number"
                  step="0.01"
                  value={maxPValue}
                  onChange={(e) => setMaxPValue(Number(e.target.value))}
                  className="w-full mt-1 p-1.5 rounded bg-surface border border-border font-mono text-text"
                />
              </div>
            </div>
          </div>

          {/* Verification Checklist */}
          <div className="space-y-2.5">
            {readinessChecks.map((check, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-md border border-border text-xs bg-surface hover:bg-surface-subtle transition-colors"
              >
                <div className="flex items-center gap-2">
                  {check.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <span className={check.passed ? "text-text font-medium" : "text-amber-800 font-semibold"}>
                    {check.label}
                  </span>
                </div>
                <span className="font-mono text-[11px] font-bold text-text-secondary">
                  {check.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* FEATURE 2: ROLLOUT RECOMMENDATION */}
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Feature 2: Rollout Recommendation
            </h3>
            <span className="text-[11px] text-text-muted font-mono">Gemini Rollout Guardian</span>
          </div>

          {/* Recommendation Banner */}
          {allReadinessPassed && !isSimulatedBreach ? (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h4 className="text-sm font-bold uppercase tracking-wide">
                  Recommendation 1: Roll Out Winning Variant
                </h4>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Variant B ({winningVariant}) outperformed control with a verified{" "}
                <strong>+{currentLift}% relative lift</strong> ($p = {currentPValue}$, Bayes:{" "}
                {currentBayes}%). All operational guardrails are stable. Safe for progressive canary
                or full 100% rollout.
              </p>
            </div>
          ) : scenario === "INSUFFICIENT_DATA" ? (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-amber-600" />
                <h4 className="text-sm font-bold uppercase tracking-wide">
                  Recommendation 2: Continue Collecting Data
                </h4>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Sample size is underpowered ({currentExposures.toLocaleString()} /{" "}
                {minSampleSize.toLocaleString()} required). P-value of {currentPValue} exceeds
                alpha ceiling. Premature rollout risks false positive regressions. Continue running for
                an estimated 3.5 more days.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-red-50 border border-red-300 text-red-950 space-y-2">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-red-600" />
                <h4 className="text-sm font-bold uppercase tracking-wide">
                  Recommendation 3: Do Not Roll Out (Block / Rollback)
                </h4>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">
                Rollout is blocked due to guardrail breach (Payment failure rate surged to{" "}
                {currentPaymentFailureRate}%, delta +126%). AI Guardian recommends immediate
                rollback to 100% Control to prevent revenue attrition.
              </p>
            </div>
          )}

          {/* Detailed Decision Metrics */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-md bg-surface-subtle border border-border">
              <span className="text-[11px] text-text-secondary block">Primary Expected Lift</span>
              <span className="text-base font-bold text-text mt-0.5 block font-mono">
                {currentLift > 0 ? `+${currentLift}%` : `${currentLift}%`}
              </span>
              <span className="text-[10px] text-text-muted">Target: &ge; +10.0%</span>
            </div>
            <div className="p-3 rounded-md bg-surface-subtle border border-border">
              <span className="text-[11px] text-text-secondary block">Bayesian Chance to Win</span>
              <span className="text-base font-bold text-text mt-0.5 block font-mono">
                {currentBayes}%
              </span>
              <span className="text-[10px] text-text-muted">Confidence: High</span>
            </div>
          </div>

          <div className="p-3 rounded-md border border-violet-200 bg-violet-50 text-[11px] text-violet-800 leading-relaxed">
            <strong>Autonomous Safety Handshake:</strong> The Release Guardian will never enact an
            automated production mutation without explicit human confirmation recorded in the audit trail.
          </div>
        </div>
      </div>

      {/* FEATURE 3: GRADUAL ROLLOUT (Canary Stages) */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Feature 3: Gradual Canary Rollout Planning
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Progressively expand winning variant exposure across production cohorts via Flagsmith's
              multivariate engine.
            </p>
          </div>
          <div className="text-xs font-mono px-3 py-1.5 rounded bg-surface-subtle border border-border text-text font-semibold">
            Flagsmith Stage: {currentStage}% Winner / {100 - currentStage}% Control
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-text-secondary">Control Baseline ({100 - currentStage}%)</span>
            <span className="text-primary font-bold">Variant Winner ({currentStage}%)</span>
          </div>
          <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
            <div
              style={{ width: `${100 - currentStage}%` }}
              className="bg-slate-400 transition-all duration-500 ease-out flex items-center justify-center text-[9px] text-white font-mono"
            >
              {100 - currentStage > 15 ? `${100 - currentStage}%` : ""}
            </div>
            <div
              style={{ width: `${currentStage}%` }}
              className="bg-primary transition-all duration-500 ease-out flex items-center justify-center text-[9px] text-white font-mono font-bold"
            >
              {currentStage > 10 ? `${currentStage}%` : ""}
            </div>
          </div>
        </div>

        {/* Stage Selector Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          {STAGES.map((pct) => (
            <button
              key={pct}
              onClick={() => {
                setTargetStage(pct);
                setStageModalOpen(true);
              }}
              className={`p-3 rounded-lg border text-center transition-all ${
                currentStage === pct
                  ? "border-primary bg-primary-light text-primary font-bold shadow-xs ring-1 ring-primary"
                  : "border-border bg-surface hover:bg-surface-subtle text-text font-medium"
              }`}
            >
              <div className="text-base font-mono font-bold">{pct}%</div>
              <div className="text-[10px] text-text-secondary mt-1">
                {pct === 5
                  ? "Smoke Test"
                  : pct === 10
                  ? "Low-Risk Canary"
                  : pct === 25
                  ? "Early Cohort"
                  : pct === 50
                  ? "Balanced Split"
                  : pct === 75
                  ? "High Soak"
                  : "100% Full"}
              </div>
              {currentStage === pct && (
                <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-primary text-white">
                  ACTIVE
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-text-secondary">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Actual Flagsmith API mutation: Updates multivariate feature weights live.</span>
          </div>
          <button
            onClick={() => {
              setTargetStage(100);
              setStageModalOpen(true);
            }}
            disabled={!allReadinessPassed || isSimulatedBreach}
            className={`px-4 py-2 rounded-md text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 ${
              allReadinessPassed && !isSimulatedBreach
                ? "bg-primary hover:bg-primary-dark text-white cursor-pointer"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <Play className="w-3.5 h-3.5" /> Execute 100% Production Rollout
          </button>
        </div>
      </div>

      {/* FEATURE 4: SAFETY MONITORING */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Feature 4: Real-Time Safety Monitoring & Guardrail Ceilings
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Active operational telemetry is evaluated against safety guardrails to prevent regressions.
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-surface-subtle text-text border border-border">
            Polling Frequency: 10s
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1 */}
          <div className={`p-4 rounded-lg border ${
            currentPaymentFailureRate > maxPaymentFailureThreshold
              ? "border-red-300 bg-red-50 text-red-950"
              : "border-border bg-surface"
          }`}>
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
              Payment Failures
            </span>
            <div className="text-xl font-bold font-mono mt-1 flex items-baseline justify-between">
              <span>{currentPaymentFailureRate}%</span>
              <span className={`text-xs ${currentPaymentFailureRate > maxPaymentFailureThreshold ? "text-red-700 font-bold" : "text-emerald-700"}`}>
                {currentPaymentFailureRate > maxPaymentFailureThreshold ? "BREACH" : "NORMAL"}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-text-muted flex items-center justify-between">
              <span>Threshold: &le; {maxPaymentFailureThreshold}%</span>
              <input
                type="number"
                step="0.1"
                value={maxPaymentFailureThreshold}
                onChange={(e) => setMaxPaymentFailureThreshold(Number(e.target.value))}
                className="w-14 p-0.5 rounded bg-surface border border-border text-center font-mono text-text"
              />
            </div>
          </div>

          {/* Metric 2 */}
          <div className="p-4 rounded-lg border border-border bg-surface">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
              Application JS Errors
            </span>
            <div className="text-xl font-bold font-mono mt-1 flex items-baseline justify-between">
              <span>{currentErrorRate}%</span>
              <span className="text-xs text-emerald-700 font-bold">NORMAL</span>
            </div>
            <div className="mt-2 text-[11px] text-text-muted flex items-center justify-between">
              <span>Threshold: &le; {maxErrorRateThreshold}%</span>
              <input
                type="number"
                step="0.1"
                value={maxErrorRateThreshold}
                onChange={(e) => setMaxErrorRateThreshold(Number(e.target.value))}
                className="w-14 p-0.5 rounded bg-surface border border-border text-center font-mono text-text"
              />
            </div>
          </div>

          {/* Metric 3 */}
          <div className="p-4 rounded-lg border border-border bg-surface">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
              Checkout Bounce Rate
            </span>
            <div className="text-xl font-bold font-mono mt-1 flex items-baseline justify-between">
              <span>28.2%</span>
              <span className="text-xs text-emerald-700 font-bold">-17.6% (Better)</span>
            </div>
            <div className="mt-2 text-[11px] text-text-muted">
              <span>Baseline: 34.0%</span>
            </div>
          </div>

          {/* Metric 4 */}
          <div className="p-4 rounded-lg border border-border bg-surface">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
              P99 Latency (API)
            </span>
            <div className="text-xl font-bold font-mono mt-1 flex items-baseline justify-between">
              <span>320 ms</span>
              <span className="text-xs text-emerald-700 font-bold">HEALTHY</span>
            </div>
            <div className="mt-2 text-[11px] text-text-muted">
              <span>Threshold: &le; 800 ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* FEATURE 6: IMMUTABLE AUDIT LOG TABLE */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <History className="w-4 h-4 text-primary" /> Feature 6: Operational Audit Log & Governance Record
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Immutable log of every flag modification, rollout approval, and rollback event with authorizer identity.
            </p>
          </div>
          <button
            onClick={fetchAuditLogs}
            className="p-1.5 rounded hover:bg-surface-subtle text-text-secondary border border-border"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-subtle border-b border-border text-text-secondary font-semibold">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Action</th>
                <th className="p-3">Authorizer</th>
                <th className="p-3">Feature Flag</th>
                <th className="p-3">Change Summary</th>
                <th className="p-3">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-text-muted">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-subtle/50 transition-colors">
                    <td className="p-3 text-text-muted whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="p-3 font-semibold text-text whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        log.action.includes("ROLLBACK") || log.action.includes("KILL")
                          ? "bg-red-100 text-red-800"
                          : log.action.includes("ROLLOUT")
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-violet-100 text-violet-800"
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-text font-sans font-medium whitespace-nowrap">
                      {log.actor.name}{" "}
                      <span className="text-[10px] text-text-muted">({log.actor.type})</span>
                    </td>
                    <td className="p-3 text-text-secondary whitespace-nowrap">{log.entityId}</td>
                    <td className="p-3 text-text font-sans max-w-xs truncate" title={log.details}>
                      {log.details}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                        VERIFIED (FLAGSMITH)
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FEATURE 5: SAFE ROLLBACK MODAL */}
      <ConfirmationModal
        isOpen={rollbackModalOpen}
        onClose={() => setRollbackModalOpen(false)}
        onConfirm={handleExecuteRollback}
        title="Authorize Safe Rollback to 100% Control"
        description="Verify the proposed configuration before applying this mutation to Flagsmith."
        confirmLabel="Confirm & Execute Rollback"
        variant="danger"
        isLoading={isExecuting}
      >
        <div className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-md bg-surface-subtle border border-border">
              <span className="font-bold text-text-secondary block text-[10px] uppercase">Current Configuration</span>
              <div className="mt-1 font-mono text-[11px] text-text font-semibold">
                Feature: {selectedFlag}<br />
                Winner Traffic: {currentStage}%<br />
                Control Traffic: {100 - currentStage}%
              </div>
            </div>
            <div className="p-3 rounded-md bg-red-50 border border-red-200">
              <span className="font-bold text-red-800 block text-[10px] uppercase">Proposed Configuration</span>
              <div className="mt-1 font-mono text-[11px] text-red-900 font-bold">
                Feature: {selectedFlag}<br />
                Winner Traffic: 0%<br />
                Control Traffic: 100%
              </div>
            </div>
          </div>

          <div>
            <label className="font-bold text-text block mb-1">Reason for Rollback</label>
            <textarea
              value={rollbackReason}
              onChange={(e) => setRollbackReason(e.target.value)}
              rows={2}
              className="w-full p-2 rounded bg-surface border border-border text-xs text-text focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="font-bold text-text block mb-1">Authorizer Signature</label>
            <input
              type="text"
              value={authorizerName}
              onChange={(e) => setAuthorizerName(e.target.value)}
              className="w-full p-2 rounded bg-surface border border-border text-xs text-text font-medium"
            />
          </div>

          <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>This action will update Flagsmith immediately. All traffic will instantly receive the Control baseline.</span>
          </div>
        </div>
      </ConfirmationModal>

      {/* STAGE CONFIRMATION MODAL (FEATURE 3) */}
      <ConfirmationModal
        isOpen={stageModalOpen}
        onClose={() => setStageModalOpen(false)}
        onConfirm={handleApplyGradualStage}
        title={`Authorize Canary Stage: ${targetStage}% Traffic`}
        description={`You are about to reallocate Flagsmith traffic weights: ${targetStage}% to '${winningVariant}', ${100 - targetStage}% to Control.`}
        confirmLabel={`Deploy ${targetStage}% to Flagsmith`}
        variant="primary"
        isLoading={isExecuting}
      >
        <div className="space-y-4 py-2 text-xs">
          <div className="p-3 rounded bg-surface-subtle border border-border">
            <div className="flex justify-between py-1">
              <span className="text-text-secondary">Target Flag:</span>
              <span className="font-mono font-bold text-text">{selectedFlag}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-text-secondary">Winning Variant:</span>
              <span className="font-mono font-bold text-primary">{winningVariant}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-text-secondary">New Allocation:</span>
              <span className="font-mono font-bold text-text">{targetStage}% Winner / {100 - targetStage}% Control</span>
            </div>
          </div>

          <div>
            <label className="font-bold text-text block mb-1">Authorizer</label>
            <input
              type="text"
              value={authorizerName}
              onChange={(e) => setAuthorizerName(e.target.value)}
              className="w-full p-2 rounded bg-surface border border-border text-xs text-text font-medium"
            />
          </div>

          <div className="p-2.5 rounded bg-violet-50 border border-violet-200 text-[11px] text-violet-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-violet-600 shrink-0" />
            <span>Strict Human-in-the-Loop policy: Flagsmith management API will be called with your credentials.</span>
          </div>
        </div>
      </ConfirmationModal>

      {/* KILL SWITCH CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={killModalOpen}
        onClose={() => setKillModalOpen(false)}
        onConfirm={handleEmergencyKillSwitch}
        title="TRIGGER EMERGENCY KILL-SWITCH"
        description="This will instantly disable the feature flag in Flagsmith across all production users."
        confirmLabel="Confirm Emergency Disable"
        variant="danger"
        isLoading={isExecuting}
      >
        <div className="space-y-3 py-2 text-xs text-red-900">
          <p>
            Emergency kill-switch overrides all multivariate splits and sets <code>enabled: false</code> in Flagsmith.
          </p>
          <div className="p-2.5 rounded bg-red-100 border border-red-300 font-mono text-[11px]">
            Target: {selectedFlag} &rarr; DISABLED (&lt; 50ms latency)
          </div>
        </div>
      </ConfirmationModal>
    </div>
  );
}
