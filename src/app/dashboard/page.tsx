"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  FlaskConical,
  Plus,
  HelpCircle,
  TrendingUp,
  Users,
  Percent,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Flag,
  AlertTriangle,
  Activity,
  Sliders,
  Info,
  Calendar,
  ExternalLink,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import {
  DashboardKPIData,
  ActiveExperimentItem,
  AIRecommendationItem,
  AgentActivityItem,
  RecentActivityItem,
  PerformanceDataPoint,
} from "@/lib/db/repository";

export default function DashboardPage() {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Time & Greeting Logic
  // ---------------------------------------------------------------------------
  const [greeting, setGreeting] = useState("Good day");
  const [currentDateFormatted, setCurrentDateFormatted] = useState("");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    setCurrentDateFormatted(now.toLocaleDateString("en-US", options));
  }, []);

  // ---------------------------------------------------------------------------
  // Dashboard State & API Data
  // ---------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<"7D" | "14D" | "30D" | "90D">("7D");
  const [kpis, setKpis] = useState<DashboardKPIData | null>(null);
  const [chartData, setChartData] = useState<PerformanceDataPoint[]>([]);
  const [activeExperiments, setActiveExperiments] = useState<ActiveExperimentItem[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<AIRecommendationItem[]>([]);
  const [agentActivities, setAgentActivities] = useState<AgentActivityItem[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivityItem[]>([]);

  // Modals & Interaction States
  const [selectedRecommendation, setSelectedRecommendation] = useState<AIRecommendationItem | null>(null);
  const [askAIModalOpen, setAskAIModalOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAskingAI, setIsAskingAI] = useState(false);

  // Fetch Full Dashboard Data
  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        const res = await fetch(`/api/dashboard?range=${selectedRange}`);
        if (!res.ok) throw new Error("Failed to load dashboard data");
        const json = await res.json();

        setKpis(json.kpis);
        setChartData(json.performance.data);
        setActiveExperiments(json.activeExperiments);
        setAiRecommendations(json.aiRecommendations);
        setAgentActivities(json.agentActivities);
        setRecentActivities(json.recentActivities);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [selectedRange]);

  // Handle Ask AI interaction
  const handleAskAISubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;
    setIsAskingAI(true);
    setTimeout(() => {
      setIsAskingAI(false);
      setAiResponse(
        `Based on our current telemetry across 6 active Flagsmith feature flags, your overall conversion rate is up +0.48% (to 4.62%). The primary growth opportunity right now is Variant B on 'exp_checkout_social_proof', which reached 97.4% Bayesian confidence with an expected +18.4% lift. Would you like to review the rollout authorization?`
      );
    }, 1200);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-12">
      {/* ===================================================================== */}
      {/* SECTION 1: WELCOME HEADER                                             */}
      {/* ===================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
              Workspace Overview
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-surface-muted text-text-secondary border border-border">
              Interactive Demo Workspace
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-text tracking-tight">
            {greeting}, Sarah
          </h1>

          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-text-secondary">
            <span className="font-semibold text-text">Acme Growth (Production)</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
              {currentDateFormatted || "Monday, November 9, 2026"}
            </span>
            <span>•</span>
            <span className="text-success font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Flagsmith Sync Healthy
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setAskAIModalOpen(true)}
            className="px-3.5 py-2 rounded-md bg-surface border border-border hover:bg-surface-subtle text-text text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            Ask AI Copilot
          </button>

          <Link
            href="/studio"
            className="px-4 py-2 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" /> Start New Experiment
          </Link>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 2: KPI CARDS (6 CARDS WITH TOOLTIPS & TRENDS)                 */}
      {/* ===================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-text uppercase tracking-wider">
              Core Experimentation Metrics
            </h2>
            <span className="text-[10px] text-text-secondary font-mono">
              (Sample Workspace Telemetry)
            </span>
          </div>
          <span className="text-xs text-text-secondary">Updated real-time from Flagsmith SDK</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* Card 1: Active Experiments */}
          <div className="p-4 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all group relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">Active Experiments</span>
              <div
                className="text-text-muted group-hover:text-text cursor-help"
                title={kpis?.activeExperiments.tooltip}
              >
                <Info className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-text tracking-tight">
              {kpis?.activeExperiments.value ?? 6}
            </div>
            <div className="mt-2 text-[11px] flex items-center gap-1 text-success font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>{kpis?.activeExperiments.change ?? "+2 from last week"}</span>
            </div>
          </div>

          {/* Card 2: Total Exposures */}
          <div className="p-4 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all group relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">Total Exposures</span>
              <div
                className="text-text-muted group-hover:text-text cursor-help"
                title={kpis?.totalExposures.tooltip}
              >
                <Info className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-text tracking-tight">
              {kpis?.totalExposures.displayValue ?? "148.9k"}
            </div>
            <div className="mt-2 text-[11px] flex items-center gap-1 text-success font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>{kpis?.totalExposures.change ?? "+14.3% vs 30d"}</span>
            </div>
          </div>

          {/* Card 3: Overall Conversion Rate */}
          <div className="p-4 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all group relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">Conversion Rate</span>
              <div
                className="text-text-muted group-hover:text-text cursor-help"
                title={kpis?.overallConversionRate.tooltip}
              >
                <Info className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-text tracking-tight font-mono">
              {kpis?.overallConversionRate.displayValue ?? "4.62%"}
            </div>
            <div className="mt-2 text-[11px] flex items-center gap-1 text-success font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>{kpis?.overallConversionRate.change ?? "+0.48% vs baseline"}</span>
            </div>
          </div>

          {/* Card 4: Average Expected Lift */}
          <div className="p-4 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all group relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">Average Lift</span>
              <div
                className="text-text-muted group-hover:text-text cursor-help"
                title={kpis?.averageExpectedLift.tooltip}
              >
                <Info className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-success tracking-tight font-mono">
              {kpis?.averageExpectedLift.displayValue ?? "+17.4%"}
            </div>
            <div className="mt-2 text-[11px] flex items-center gap-1 text-success font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>{kpis?.averageExpectedLift.change ?? "+3.2% vs Q3"}</span>
            </div>
          </div>

          {/* Card 5: Successful Experiments */}
          <div className="p-4 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all group relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">Successful Tests</span>
              <div
                className="text-text-muted group-hover:text-text cursor-help"
                title={kpis?.successfulExperiments.tooltip}
              >
                <Info className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-text tracking-tight">
              {kpis?.successfulExperiments.value ?? 14}
            </div>
            <div className="mt-2 text-[11px] flex items-center gap-1 text-text-secondary font-medium">
              <CheckCircle2 className="w-3 h-3 text-success" />
              <span>{kpis?.successfulExperiments.change ?? "77.8% win rate"}</span>
            </div>
          </div>

          {/* Card 6: Features Ready for Rollout */}
          <div className="p-4 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all group relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">Ready for Rollout</span>
              <div
                className="text-text-muted group-hover:text-text cursor-help"
                title={kpis?.featuresReadyForRollout.tooltip}
              >
                <Info className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-primary tracking-tight">
              {kpis?.featuresReadyForRollout.value ?? 2}
            </div>
            <div className="mt-2 text-[11px] flex items-center gap-1 text-warning font-medium">
              <ShieldCheck className="w-3 h-3 text-warning" />
              <span>{kpis?.featuresReadyForRollout.change ?? "Requires human review"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 3: EXPERIMENT PERFORMANCE (INTERACTIVE RECHARTS)              */}
      {/* ===================================================================== */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-text">
                Experiment Performance & Conversion Trajectory
              </h3>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Dual-axis stream showing daily visitor exposures and conversion rate lift over time
            </p>
          </div>

          {/* Date Range Selector Filter */}
          <div className="flex items-center gap-1 bg-surface-subtle p-1 rounded-md border border-border self-start sm:self-auto">
            {(["7D", "14D", "30D", "90D"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setSelectedRange(range)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors ${
                  selectedRange === range
                    ? "bg-surface text-primary shadow-xs font-semibold"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Dual-Axis Chart */}
        <div className="h-[320px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF0" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#777D8D"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E8EAF0" }}
              />
              <YAxis
                yAxisId="left"
                stroke="#777D8D"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E8EAF0" }}
                tickFormatter={(val) => `${val}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#7565F5"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E8EAF0" }}
                tickFormatter={(val) => `${val}%`}
                domain={[3.5, 6.0]}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as PerformanceDataPoint;
                    return (
                      <div className="p-3 bg-surface border border-border rounded-lg shadow-md text-xs space-y-1.5">
                        <p className="font-semibold text-text">{label}</p>
                        <div className="text-text-secondary flex justify-between gap-4">
                          <span>Daily Exposures:</span>
                          <span className="font-mono text-text font-medium">
                            {data.exposures.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-text-secondary flex justify-between gap-4">
                          <span>Conversions:</span>
                          <span className="font-mono text-text font-medium">
                            {data.conversions}
                          </span>
                        </div>
                        <div className="text-primary font-semibold flex justify-between gap-4 pt-1 border-t border-border-subtle">
                          <span>Overall Rate:</span>
                          <span className="font-mono">{data.conversionRate}%</span>
                        </div>
                        <div className="text-success font-medium flex justify-between gap-4">
                          <span>Treatment Rate:</span>
                          <span className="font-mono">{data.treatmentRate}%</span>
                        </div>
                        <div className="text-[#777D8D] flex justify-between gap-4">
                          <span>Control Baseline:</span>
                          <span className="font-mono">{data.controlRate}%</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: 15, fontSize: 12 }}
              />
              <Bar
                yAxisId="left"
                dataKey="exposures"
                name="Daily Exposures"
                fill="#F0EDFF"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="treatmentRate"
                name="Treatment CR (%)"
                stroke="#7565F5"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#7565F5" }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="controlRate"
                name="Control CR (%)"
                stroke="#777D8D"
                strokeWidth={1.8}
                strokeDasharray="4 4"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 4: ACTIVE EXPERIMENTS (TABLE VIEW WITH STATUS & SPLITS)       */}
      {/* ===================================================================== */}
      <div className="rounded-lg border border-border bg-surface shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border bg-surface-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" /> Active Experiments Portfolio
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Live multivariate experiments orchestrated via Flagsmith feature states
            </p>
          </div>
          <Link
            href="/experiments"
            className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors flex items-center gap-1 self-start sm:self-auto"
          >
            Manage All Experiments <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-secondary uppercase tracking-wider bg-surface-subtle/40 font-medium">
                <th className="py-3 px-4">Experiment Name</th>
                <th className="py-3 px-4">Feature Flag</th>
                <th className="py-3 px-4">Control Variant</th>
                <th className="py-3 px-4">Winning Candidate</th>
                <th className="py-3 px-4">Traffic Allocation</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeExperiments.map((exp) => (
                <tr
                  key={exp.id}
                  onClick={() => router.push(`/experiments/${exp.id}`)}
                  className="hover:bg-surface-subtle/80 cursor-pointer transition-colors group"
                >
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-text group-hover:text-primary transition-colors">
                      {exp.name}
                    </div>
                    {exp.liftPercent !== null && (
                      <span className="text-[11px] font-medium text-success font-mono">
                        +{exp.liftPercent}% lift ({exp.confidencePercent}% conf)
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-xs text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <Flag className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="truncate max-w-[150px]">{exp.flagsmithFeature}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-xs text-text-secondary">
                    {exp.controlVariant}
                  </td>

                  <td className="py-3.5 px-4 text-xs">
                    {exp.winningCandidate ? (
                      <span className="font-semibold text-text flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        {exp.winningCandidate}
                      </span>
                    ) : (
                      <span className="text-text-muted italic">Inconclusive / Gathering</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${exp.trafficAllocation.treatment}%` }}
                        />
                      </div>
                      <span className="text-text-secondary text-[11px]">
                        {exp.trafficAllocation.control}% / {exp.trafficAllocation.treatment}%
                      </span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <StatusBadge
                      status={
                        exp.status === "ready_for_rollout"
                          ? "completed"
                          : exp.status === "active"
                          ? "active"
                          : "running"
                      }
                      label={
                        exp.status === "ready_for_rollout"
                          ? "READY FOR ROLLOUT"
                          : exp.status.toUpperCase()
                      }
                    />
                  </td>

                  <td className="py-3.5 px-4 text-right text-xs font-mono text-text-secondary">
                    {exp.lastUpdated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 5 & 6: AI RECOMMENDATIONS & AGENT ACTIVITY (SIDE BY SIDE)     */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 5: AI RECOMMENDATIONS */}
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-text">AI Growth Recommendations</h3>
            </div>
            <Link
              href="/insights"
              className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors"
            >
              All Insights
            </Link>
          </div>

          <div className="space-y-3">
            {aiRecommendations.map((rec) => (
              <div
                key={rec.id}
                onClick={() => setSelectedRecommendation(rec)}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer hover:border-primary/40 ${
                  rec.impact === "critical"
                    ? "bg-danger-light/30 border-danger/30"
                    : "bg-surface-subtle/50 border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-text leading-snug">
                    {rec.title}
                  </h4>
                  <StatusBadge
                    status={rec.impact === "critical" ? "rolled_back" : "warning"}
                    label={`${rec.impact.toUpperCase()}`}
                    dot={false}
                  />
                </div>

                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed line-clamp-2">
                  {rec.description}
                </p>

                <div className="mt-2.5 pt-2 border-t border-border-subtle flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">
                    Agent: <strong className="text-text">{rec.agent}</strong>
                  </span>
                  <span className="text-primary font-semibold flex items-center gap-1 group-hover:underline">
                    {rec.suggestedAction} <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 6: AGENT ACTIVITY (THE 5 AUTONOMOUS AGENTS) */}
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-text">Autonomous Agent Squad Status</h3>
            </div>
            <Link
              href="/command-center"
              className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors"
            >
              Command Center
            </Link>
          </div>

          <div className="space-y-3">
            {agentActivities.map((agent) => (
              <div
                key={agent.id}
                className="p-3 rounded-lg bg-surface-subtle/60 border border-border flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-primary-light text-primary flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text truncate">{agent.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-text-secondary">
                        {agent.model}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary truncate mt-0.5">
                      {agent.latestActivity}
                    </p>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <StatusBadge
                    status={agent.status === "awaiting_approval" ? "warning" : "active"}
                    label={agent.status === "awaiting_approval" ? "PENDING HITL" : "ACTIVE"}
                  />
                  <span className="block text-[10px] text-text-muted font-mono mt-1">
                    {agent.timestamp}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 7: RECENT ACTIVITY (IMMUTABLE AUDIT STREAM)                   */}
      {/* ===================================================================== */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Recent Experimentation & Audit Feed
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Append-only audit trail logging flag changes, human approvals, and conversions
            </p>
          </div>
          <Link
            href="/activity"
            className="text-xs font-semibold text-text-secondary hover:text-text transition-colors"
          >
            Full Audit Log
          </Link>
        </div>

        <div className="divide-y divide-border">
          {recentActivities.map((act) => (
            <div
              key={act.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                    act.type.includes("ROLLOUT")
                      ? "bg-success-light text-success border border-success/20"
                      : act.type.includes("ROLLBACK")
                      ? "bg-danger-light text-danger border border-danger/20"
                      : act.type.includes("FLAG")
                      ? "bg-primary-light text-primary border border-primary/20"
                      : "bg-surface-muted text-text-secondary border border-border"
                  }`}
                >
                  {act.type.replace(/_/g, " ")}
                </span>
                <div>
                  <span className="font-semibold text-text">{act.title}</span>
                  <p className="text-text-secondary text-[11px] mt-0.5">{act.details}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-right text-[11px] text-text-secondary font-mono">
                <span className="font-medium text-text">{act.actor}</span>
                <span>•</span>
                <span>{act.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: RECOMMENDATION EXPLANATION POPUP                            */}
      {/* ===================================================================== */}
      {selectedRecommendation && (
        <ConfirmationModal
          isOpen={!!selectedRecommendation}
          onClose={() => setSelectedRecommendation(null)}
          onConfirm={() => {
            if (selectedRecommendation.experimentId) {
              router.push(`/experiments/${selectedRecommendation.experimentId}`);
            } else {
              router.push("/studio");
            }
            setSelectedRecommendation(null);
          }}
          title={selectedRecommendation.title}
          description={selectedRecommendation.description}
          confirmLabel={selectedRecommendation.suggestedAction}
          cancelLabel="Close"
          variant={selectedRecommendation.impact === "critical" ? "danger" : "primary"}
        >
          <div className="p-3 rounded bg-surface-subtle border border-border text-xs space-y-2 mt-2">
            <div className="flex justify-between">
              <span className="text-text-secondary">Synthesized By:</span>
              <span className="font-semibold text-text">{selectedRecommendation.agent}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Impact Assessment:</span>
              <span className="font-bold text-primary uppercase">
                {selectedRecommendation.impact}
              </span>
            </div>
          </div>
        </ConfirmationModal>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: ASK AI COPILOT INTERACTIVE DIALOG                           */}
      {/* ===================================================================== */}
      <ConfirmationModal
        isOpen={askAIModalOpen}
        onClose={() => {
          setAskAIModalOpen(false);
          setAiResponse(null);
        }}
        onConfirm={() => {
          setAskAIModalOpen(false);
          router.push("/command-center");
        }}
        title="Ask PulsePilot AI Copilot"
        description="Query your active experiment telemetry, ask for hypothesis ideas, or check statistical significance in plain English."
        confirmLabel="Open Full Command Center"
        cancelLabel="Done"
      >
        <form onSubmit={handleAskAISubmit} className="space-y-3 mt-3">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            placeholder="e.g. Which experiment has the highest conversion lift?"
            className="w-full p-2.5 text-xs bg-surface-subtle border border-border rounded text-text focus:outline-none focus:border-primary"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isAskingAI || !aiQuestion}
              className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isAskingAI ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Querying Telemetry...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> Ask Copilot
                </>
              )}
            </button>
          </div>

          {aiResponse && (
            <div className="p-3 rounded bg-primary-light/30 border border-primary/20 text-xs text-text leading-relaxed mt-2 animate-in fade-in">
              <div className="font-semibold text-primary mb-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> AI Response:
              </div>
              {aiResponse}
            </div>
          )}
        </form>
      </ConfirmationModal>
    </div>
  );
}

