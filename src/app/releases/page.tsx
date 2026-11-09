"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  Sliders,
  AlertTriangle,
  ArrowRight,
  Flag,
  AlertOctagon,
  TrendingUp,
  RefreshCw,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

export default function ReleaseCenterPage() {
  const [selectedFlag, setSelectedFlag] = useState("exp_checkout_social_proof");
  const [winningVariant, setWinningVariant] = useState("variant_social_proof");
  const [currentStage, setCurrentStage] = useState<number>(50); // 50% traffic
  const [isRolloutExecuted, setIsRolloutExecuted] = useState<boolean>(false);

  const [rolloutModalOpen, setRolloutModalOpen] = useState<boolean>(false);
  const [killModalOpen, setKillModalOpen] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Execute Rollout via Flagsmith API
  const handleApproveRollout = async () => {
    setIsDeploying(true);
    try {
      const res = await fetch("/api/flagsmith/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagsmithFeatureName: selectedFlag,
          action: "ROLLOUT_WINNER",
          winningVariantKey: winningVariant,
          authorizer: "Sarah Lin (Product Lead)",
          rationale: "Approved 100% production rollout following verified +18.4% lift and 97.4% Bayes confidence.",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsRolloutExecuted(true);
        setCurrentStage(100);
        setFeedback("Variant B successfully promoted to 100% in Flagsmith Production environment.");
        setTimeout(() => {
          setRolloutModalOpen(false);
          setFeedback(null);
        }, 1500);
      }
    } catch (err: any) {
      alert(`Rollout failed: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  // Execute Kill Switch
  const handleEmergencyKillSwitch = async () => {
    setIsDeploying(true);
    try {
      const res = await fetch("/api/flagsmith/rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagsmithFeatureName: selectedFlag,
          action: "EMERGENCY_KILL_SWITCH",
          authorizer: "Sarah Lin (Product Lead)",
          rationale: "Emergency disable requested from Release Center.",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCurrentStage(0);
        setFeedback("Emergency kill-switch executed. Feature flag disabled in Flagsmith.");
        setTimeout(() => {
          setKillModalOpen(false);
          setFeedback(null);
        }, 1500);
      }
    } catch (err: any) {
      alert(`Kill switch failed: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="Release Center & Canary Gates"
        description="Safe rollout orchestration enforcing strict Human-in-the-Loop policies. Progressively expand traffic or trigger instant rollback without modifying application code."
        badge={
          <StatusBadge
            status={isRolloutExecuted ? "completed" : "warning"}
            label={isRolloutExecuted ? "100% ROLLED OUT" : "1 APPROVAL PENDING"}
          />
        }
      />

      {/* Main Release Card */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-text">
                Checkout Social Proof Testimonials
              </h3>
              <StatusBadge
                status={isRolloutExecuted ? "completed" : "warning"}
                label={isRolloutExecuted ? "100% PRODUCTION" : "CANARY STAGE: 50%"}
              />
            </div>
            <p className="text-xs text-text-secondary mt-1">
              Flagsmith Feature: <code className="font-mono text-primary font-bold">{selectedFlag}</code> •
              Recommended by Release Guardian Agent after +18.4% lift and 97.4% Bayesian confidence.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setKillModalOpen(true)}
              className="px-3 py-1.5 rounded text-xs font-semibold text-danger hover:bg-danger-light border border-danger/20 transition-colors flex items-center gap-1.5"
            >
              <AlertOctagon className="w-3.5 h-3.5" /> Emergency Kill-Switch
            </button>
            <button
              onClick={() => setRolloutModalOpen(true)}
              disabled={isRolloutExecuted}
              className="px-4 py-1.5 rounded bg-success hover:bg-success-text text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isRolloutExecuted ? "Rollout Completed" : "Approve 100% Rollout"}
            </button>
          </div>
        </div>

        {/* Canary Progress Tracker */}
        <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-primary" /> Canary Traffic Ramp-Up Stages
            </span>
            <span className="font-mono font-bold text-primary">
              Current Allocation: {currentStage}% of Production Traffic
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-surface-muted overflow-hidden flex">
            <div
              style={{ width: `${currentStage}%` }}
              className="bg-primary h-full transition-all duration-500 rounded-full"
            />
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-xs pt-1">
            <div className={`p-2 rounded border ${currentStage >= 10 ? "bg-surface border-primary font-bold text-primary" : "bg-surface-subtle border-border-subtle text-text-muted"}`}>
              10% (Canary)
            </div>
            <div className={`p-2 rounded border ${currentStage >= 25 ? "bg-surface border-primary font-bold text-primary" : "bg-surface-subtle border-border-subtle text-text-muted"}`}>
              25% (Ramp)
            </div>
            <div className={`p-2 rounded border ${currentStage >= 50 ? "bg-surface border-primary font-bold text-primary" : "bg-surface-subtle border-border-subtle text-text-muted"}`}>
              50% (Split)
            </div>
            <div className={`p-2 rounded border ${currentStage === 100 ? "bg-success-light border-success font-bold text-success" : "bg-surface-subtle border-border-subtle text-text-muted"}`}>
              100% (Winner)
            </div>
          </div>
        </div>

        {/* Live Guardrails Evaluation Grid */}
        <div>
          <h4 className="text-xs font-bold text-text uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-success" /> Monitored Guardrail Health Checks
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-surface-subtle border border-border flex items-start justify-between">
              <div>
                <span className="text-text-secondary block">Payment Failures</span>
                <span className="font-mono font-bold text-text text-sm">1.1% (-8.3% vs base)</span>
                <p className="text-[11px] text-success mt-0.5">Healthy • Tolerance &lt; 2.0%</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-success" />
            </div>

            <div className="p-3.5 rounded-lg bg-surface-subtle border border-border flex items-start justify-between">
              <div>
                <span className="text-text-secondary block">Checkout Bounce Rate</span>
                <span className="font-mono font-bold text-text text-sm">28.0% (-17.6% vs base)</span>
                <p className="text-[11px] text-success mt-0.5">Healthy • Reduced Abandonment</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-success" />
            </div>

            <div className="p-3.5 rounded-lg bg-surface-subtle border border-border flex items-start justify-between">
              <div>
                <span className="text-text-secondary block">Client Error Rate</span>
                <span className="font-mono font-bold text-text text-sm">0.04% (Unchanged)</span>
                <p className="text-[11px] text-success mt-0.5">Healthy • Zero Sentry Spikes</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-success" />
            </div>
          </div>
        </div>
      </div>

      {/* Rollout Confirmation Modal */}
      <ConfirmationModal
        isOpen={rolloutModalOpen}
        onClose={() => setRolloutModalOpen(false)}
        onConfirm={handleApproveRollout}
        title="Authorize 100% Production Rollout"
        description={`You are authorizing PulsePilot to mutate the Flagsmith feature '${selectedFlag}' to 100% traffic on '${winningVariant}'. This operation will take effect across production edge environments in < 50ms.`}
        confirmLabel={feedback ? feedback : isDeploying ? "Deploying in Flagsmith..." : "Authorize 100% Rollout"}
        isLoading={isDeploying}
        variant="success"
      />

      {/* Kill Switch Modal */}
      <ConfirmationModal
        isOpen={killModalOpen}
        onClose={() => setKillModalOpen(false)}
        onConfirm={handleEmergencyKillSwitch}
        title="Execute Emergency Kill-Switch"
        description={`This will immediately disable '${selectedFlag}' in Flagsmith. All client SDK instances will instantly revert to the default control behavior.`}
        confirmLabel={feedback ? feedback : isDeploying ? "Disabling..." : "Confirm Emergency Kill-Switch"}
        isLoading={isDeploying}
        variant="danger"
      />
    </div>
  );
}
