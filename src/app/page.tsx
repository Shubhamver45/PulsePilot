"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  FlaskConical,
  Flag,
  TrendingUp,
  Users,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { AgentStatusCard } from "@/components/ui/AgentStatusCard";
import { AIInsightCard } from "@/components/ui/AIInsightCard";
import { ExperimentCard } from "@/components/ui/ExperimentCard";
import { ActivityTimeline } from "@/components/ui/ActivityTimeline";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

export default function OverviewPage() {
  const [rolloutModalOpen, setRolloutModalOpen] = useState(false);
  const [rolloutSuccess, setRolloutSuccess] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Page Header */}
      <PageHeader
        title="Experimentation & Growth Overview"
        description="Autonomous experimentation co-pilot powered by Flagsmith and Google Gemini."
        badge={
          <StatusBadge
            status="active"
            label="FLAGSMITH SYNCED"
            className="hidden sm:inline-flex"
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/studio"
              className="px-3.5 py-2 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> New AI Experiment
            </Link>
          </div>
        }
      />

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Experiments"
          value="4"
          change="+1 this week"
          changeType="positive"
          icon={<FlaskConical className="w-4 h-4" />}
          badge="Live Flagsmith"
        />
        <MetricCard
          title="Aggregate Lift"
          value="+16.8%"
          change="+3.4% vs baseline"
          changeType="positive"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <MetricCard
          title="Active Identities"
          value="48,290"
          change="+12.5% volume"
          changeType="positive"
          icon={<Users className="w-4 h-4" />}
          changeLabel="total tracked"
        />
        <MetricCard
          title="Flagsmith Flags"
          value="12"
          change="100% healthy"
          changeType="neutral"
          icon={<Flag className="w-4 h-4" />}
          badge="Production"
        />
      </div>

      {/* AI Agents Squad Section */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-text uppercase tracking-wide">
              Autonomous AI Agent Squad
            </h2>
          </div>
          <Link
            href="/command-center"
            className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors flex items-center gap-1"
          >
            Open Command Center <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AgentStatusCard
            name="Hypothesis Architect"
            role="Natural language to Flagsmith feature spec"
            status="ready"
            model="gemini-2.5-flash"
            lastAction="Formulated 'Pricing Annual Badge' experiment"
          />
          <AgentStatusCard
            name="Statistical Analyst"
            role="Z-test, p-value & Bayes synthesis"
            status="running"
            model="gemini-2.5-flash"
            lastAction="Evaluated 14,200 events on checkout flow"
          />
          <AgentStatusCard
            name="Rollout Strategist"
            role="Canary gates & safe rollout recommendations"
            status="awaiting_approval"
            model="gemini-2.5-flash"
            lastAction="Proposed 100% rollout for 'Social Proof CTA'"
          />
        </div>
      </div>

      {/* High-Impact AI Insight Hero Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text uppercase tracking-wide">
              Featured Growth Breakthrough
            </h2>
            <Link
              href="/insights"
              className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors flex items-center gap-1"
            >
              All AI Insights <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <AIInsightCard
            title="Winner Detected: Social Proof Testimonial on Checkout"
            summary="Statistical significance reached with 97.4% Bayesian confidence. Treatment variant yields a +18.4% relative uplift in completed transactions over control with zero guardrail violations."
            confidenceScore={0.974}
            impact="high"
            type="winner_detected"
            observations={[
              "Sample size reached 2,400 visitors per variant (target was 2,000).",
              "Conversion rate surged from 4.12% (Control) to 4.88% (Social Proof).",
              "Refund rate and checkout friction guardrails remained completely stable.",
            ]}
            recommendedAction="Execute 100% rollout in Flagsmith"
            onActionClick={() => setRolloutModalOpen(true)}
          />

          {/* Active Experiments Grid */}
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-sm font-bold text-text uppercase tracking-wide">
                Active Experiments
              </h2>
              <Link
                href="/experiments"
                className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors flex items-center gap-1"
              >
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ExperimentCard
                id="exp-1"
                title="Checkout Social Proof vs Control"
                hypothesis="Adding verified customer testimonials on the checkout card will reduce cart abandonment."
                status="active"
                flagsmithFeatureName="exp_checkout_social_proof"
                primaryMetric="checkout_completed"
                sampleSizeCurrent={4800}
                sampleSizeTarget={4000}
                upliftPercent={18.4}
                confidencePercent={97.4}
              />
              <ExperimentCard
                id="exp-2"
                title="Annual vs Monthly Default Pricing"
                hypothesis="Defaulting the pricing toggle to Annual with a 'Save 20%' badge will lift ARR."
                status="running"
                flagsmithFeatureName="exp_pricing_annual_default"
                primaryMetric="annual_subscription"
                sampleSizeCurrent={1850}
                sampleSizeTarget={3000}
                upliftPercent={8.2}
                confidencePercent={84.6}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Activity & Audit Trail */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text uppercase tracking-wide">
              Live Audit Stream
            </h2>
            <Link
              href="/activity"
              className="text-xs font-semibold text-text-secondary hover:text-text transition-colors"
            >
              Audit Log
            </Link>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-border shadow-xs">
            <ActivityTimeline
              activities={[
                {
                  id: "act-1",
                  action: "ROLLOUT_RECOMMENDED",
                  actor: { name: "Rollout Strategist", type: "agent" },
                  details: "Generated recommendation for 'exp_checkout_social_proof' (97.4% confidence)",
                  timestamp: "12m ago",
                },
                {
                  id: "act-2",
                  action: "FLAGSMITH_SYNC",
                  actor: { name: "Sarah Lin", type: "human" },
                  details: "Approved multivariate traffic allocation (50/50 split)",
                  timestamp: "2h ago",
                },
                {
                  id: "act-3",
                  action: "EXPERIMENT_FORMULATED",
                  actor: { name: "Hypothesis Architect", type: "agent" },
                  details: "Created experiment spec from natural language prompt",
                  timestamp: "4h ago",
                },
                {
                  id: "act-4",
                  action: "FLAG_CREATED",
                  actor: { name: "Flagsmith API", type: "system" },
                  details: "Feature 'exp_pricing_annual_default' provisioned",
                  timestamp: "1d ago",
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Human-in-the-Loop Rollout */}
      <ConfirmationModal
        isOpen={rolloutModalOpen}
        onClose={() => setRolloutModalOpen(false)}
        onConfirm={() => {
          setRolloutSuccess(true);
          setTimeout(() => {
            setRolloutSuccess(false);
            setRolloutModalOpen(false);
          }, 1500);
        }}
        title="Human-in-the-Loop Rollout Authorization"
        description="You are authorizing PulsePilot to update the Flagsmith feature 'exp_checkout_social_proof' to allocate 100% of production traffic to Variant B (Social Proof Testimonial)."
        confirmLabel={rolloutSuccess ? "Rollout Executed in Flagsmith!" : "Approve & Rollout to 100%"}
        variant="success"
      >
        <div className="p-3 bg-surface-subtle border border-border rounded text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-text-secondary">Feature Flag:</span>
            <span className="font-mono font-semibold text-text">exp_checkout_social_proof</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Winning Variant:</span>
            <span className="font-semibold text-success">Variant B (+18.4% Uplift)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Approver:</span>
            <span className="font-semibold text-text">Sarah Lin (Product Lead)</span>
          </div>
        </div>
      </ConfirmationModal>
    </div>
  );
}

