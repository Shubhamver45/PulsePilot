"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Play,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Terminal,
  Activity,
  BarChart3,
  FlaskConical,
  Flag,
  ArrowRight,
  TrendingUp,
  Cpu,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OrchestratorResponse } from "@/lib/agents/schemas";

const samplePrompts = [
  "Analyse my checkout experiment.",
  "Find opportunities to improve conversion.",
  "Create a new onboarding experiment.",
  "Explain why variant B is performing better.",
  "Prepare a rollout plan for the winning variant.",
];

export default function AICommandCenterPage() {
  const [prompt, setPrompt] = useState<string>("Analyse my checkout experiment.");
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [response, setResponse] = useState<OrchestratorResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Activity History of Invocations
  const [history, setHistory] = useState<
    Array<{
      id: string;
      prompt: string;
      agentName: string;
      status: string;
      executionTimeMs: number;
      timestamp: string;
    }>
  >([
    {
      id: "orch-seed-1",
      prompt: "Prepare a rollout plan for the winning variant.",
      agentName: "Release Guardian Agent",
      status: "SUCCESS",
      executionTimeMs: 245,
      timestamp: "12m ago",
    },
    {
      id: "orch-seed-2",
      prompt: "Explain why variant B is performing better.",
      agentName: "Statistical Analyst",
      status: "SUCCESS",
      executionTimeMs: 198,
      timestamp: "35m ago",
    },
    {
      id: "orch-seed-3",
      prompt: "Find opportunities to improve conversion.",
      agentName: "Growth Advisor Agent",
      status: "SUCCESS",
      executionTimeMs: 312,
      timestamp: "1h ago",
    },
  ]);

  const handleExecute = async () => {
    if (!prompt.trim()) return;
    setIsExecuting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data: OrchestratorResponse = await res.json();

      if (data.status === "ERROR") {
        setErrorMessage(data.error || "Execution error in agent orchestrator.");
      } else {
        setResponse(data);
        setHistory((prev) => [
          {
            id: data.orchestrationId,
            prompt: data.inputPrompt,
            agentName: data.agentName,
            status: data.status,
            executionTimeMs: data.executionTimeMs,
            timestamp: "Just now",
          },
          ...prev,
        ]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to communicate with agent orchestrator.");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="AI Command Center"
        description="Autonomous multi-agent orchestration hub. Direct natural language requests to our five specialized AI agents for ideation, telemetry analysis, guardrail protection, and growth advisory."
        badge={<StatusBadge status="running" label="5 AGENTS ACTIVE" />}
      />

      {/* Five Agents Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            name: "Hypothesis Architect",
            role: "Strategy Agent",
            icon: <Sparkles className="w-4 h-4 text-primary" />,
            status: "ready",
            desc: "Hypotheses & variant specs",
          },
          {
            name: "Experiment Builder",
            role: "Builder Agent",
            icon: <Flag className="w-4 h-4 text-primary" />,
            status: "ready",
            desc: "Flagsmith JSON & code patches",
          },
          {
            name: "Statistical Analyst",
            role: "Analytics Agent",
            icon: <BarChart3 className="w-4 h-4 text-primary" />,
            status: "ready",
            desc: "Z-tests, Bayes & lift truth",
          },
          {
            name: "Release Guardian",
            role: "Guardian Agent",
            icon: <ShieldCheck className="w-4 h-4 text-success" />,
            status: "ready",
            desc: "Guardrail checks & rollouts",
          },
          {
            name: "Growth Advisor",
            role: "Advisor Agent",
            icon: <TrendingUp className="w-4 h-4 text-primary" />,
            status: "ready",
            desc: "Commercial takeaways & ideas",
          },
        ].map((agent) => (
          <div
            key={agent.name}
            className="p-3.5 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="w-7 h-7 rounded-md bg-primary-light flex items-center justify-center">
                  {agent.icon}
                </div>
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              </div>
              <h4 className="text-xs font-bold text-text truncate">{agent.name}</h4>
              <span className="text-[10px] text-text-secondary block font-mono">
                {agent.role}
              </span>
              <p className="text-[11px] text-text-secondary mt-1 line-clamp-1">{agent.desc}</p>
            </div>
            <div className="mt-3 pt-2 border-t border-border-subtle flex items-center justify-between text-[10px] font-mono text-text-muted">
              <span>gemini-2.5-flash</span>
              <span className="text-success font-semibold">Active</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Dispatch Console */}
      <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-text uppercase tracking-wide">
              Natural Language Agent Dispatcher
            </h3>
          </div>
          <p className="text-xs text-text-secondary">
            Type any experimentation or analytics request. The orchestrator will classify your intent, route to the correct agent, and stream back validated output.
          </p>
        </div>

        <div>
          <div className="relative">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isExecuting) handleExecute();
              }}
              placeholder="e.g. Analyse my checkout experiment or Prepare a rollout plan for variant B..."
              className="w-full p-3.5 pr-28 text-xs bg-surface-subtle border border-border rounded-lg text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs"
            />
            <button
              onClick={handleExecute}
              disabled={isExecuting || !prompt.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isExecuting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Routing...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Dispatch
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Sample Prompts */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-text-secondary font-medium">Try asking:</span>
          {samplePrompts.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => setPrompt(sample)}
              className="px-2.5 py-1 rounded bg-surface-subtle border border-border hover:bg-primary-light hover:text-primary hover:border-primary/30 transition-colors text-text-secondary"
            >
              "{sample}"
            </button>
          ))}
        </div>

        {/* Error State Banner */}
        {errorMessage && (
          <div className="p-4 rounded-lg bg-danger-light border border-danger/30 text-xs text-danger flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Orchestrator Execution Failure:</span>
              <p className="mt-0.5 text-danger-text">{errorMessage}</p>
              <p className="mt-1 text-[11px] text-text-secondary">
                Please verify your network connection or ensure GEMINI_API_KEY is configured.
              </p>
            </div>
          </div>
        )}

        {/* Orchestrator Output Response Card */}
        {response && (
          <div className="border border-border rounded-lg bg-surface-subtle/40 p-5 space-y-4 animate-in fade-in">
            {/* Header: Routed Agent & Execution Telemetry */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-light text-primary flex items-center justify-center font-bold text-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text">{response.agentName}</span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface border border-border text-primary font-semibold">
                      {response.routedAgent}
                    </span>
                  </div>
                  <span className="text-[11px] text-text-secondary">
                    Input: "{response.inputPrompt}"
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono text-text-secondary self-start sm:self-auto">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-text-muted" /> {response.executionTimeMs}ms
                </span>
                <StatusBadge status="active" label="SUCCESS (ZOD VERIFIED)" />
              </div>
            </div>

            {/* Dynamic Rendering Based on Specialist Agent */}
            <div className="space-y-4">
              {/* Analytics Agent View */}
              {response.routedAgent === "ANALYTICS_AGENT" && (
                <div className="space-y-3 text-xs">
                  <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
                    <span className="font-bold text-text text-sm">
                      Executive Statistical Summary
                    </span>
                    <p className="text-text-secondary leading-relaxed">
                      {(response.data as any).executive_summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                    <div className="p-3 rounded bg-surface border border-border">
                      <span className="text-[10px] text-text-secondary block">Relative Lift</span>
                      <span className="text-base font-bold text-success">
                        +{(response.data as any).performance_analysis?.relativeUpliftPercent?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-3 rounded bg-surface border border-border">
                      <span className="text-[10px] text-text-secondary block">p-Value</span>
                      <span className="text-base font-bold text-text">
                        {(response.data as any).performance_analysis?.pValue?.toFixed(3)}
                      </span>
                    </div>
                    <div className="p-3 rounded bg-surface border border-border">
                      <span className="text-[10px] text-text-secondary block">Bayes Win Prob</span>
                      <span className="text-base font-bold text-primary">
                        {((response.data as any).performance_analysis?.bayesianProbabilityToBeatControl * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-3 rounded bg-surface border border-border">
                      <span className="text-[10px] text-text-secondary block">Sample Size</span>
                      <span className="text-base font-bold text-text">
                        {(response.data as any).sample_size_assessment?.currentSamples?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Release Guardian Agent View */}
              {response.routedAgent === "RELEASE_GUARDIAN_AGENT" && (
                <div className="space-y-3 text-xs">
                  <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text text-sm">
                        Guardian Safety Recommendation
                      </span>
                      <StatusBadge
                        status="active"
                        label={(response.data as any).recommendation?.action}
                      />
                    </div>
                    <p className="text-text-secondary leading-relaxed">
                      {(response.data as any).recommendation?.rationale}
                    </p>
                  </div>

                  <div className="p-3 rounded bg-warning-light/30 border border-warning/30 text-text-secondary flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-text">Safety Handshake:</strong>{" "}
                      {(response.data as any).safety_handshake?.warningNotice}
                    </div>
                  </div>
                </div>
              )}

              {/* Growth Advisor Agent View */}
              {response.routedAgent === "GROWTH_ADVISOR_AGENT" && (
                <div className="space-y-3 text-xs">
                  <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
                    <span className="font-bold text-text text-sm">Commercial Findings</span>
                    <ul className="space-y-2">
                      {(response.data as any).key_findings?.map((f: any, i: number) => (
                        <li key={i} className="p-2.5 rounded bg-surface-subtle border border-border-subtle">
                          <strong className="text-text block">{f.observation}</strong>
                          <span className="text-text-secondary block mt-0.5">
                            {f.psychologicalInsight}
                          </span>
                          <span className="text-primary font-semibold text-[11px] block mt-1">
                            Impact: {f.commercialImpact}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
                    <span className="font-bold text-text">Recommended Next Experiments</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(response.data as any).follow_up_experiments?.map((exp: any, i: number) => (
                        <div key={i} className="p-2.5 rounded bg-surface-subtle border border-border text-text">
                          <span className="font-bold block text-xs">{exp.title}</span>
                          <span className="text-[11px] text-text-secondary block mt-1">
                            {exp.hypothesis}
                          </span>
                          <span className="text-success font-bold font-mono text-[10px] block mt-1">
                            {exp.estimatedLift}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Strategy Agent View */}
              {response.routedAgent === "STRATEGY_AGENT" && (
                <div className="p-4 rounded-lg bg-surface border border-border space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold text-text text-sm">
                      {(response.data as any).experiment_name}
                    </span>
                    <span className="font-mono text-primary font-bold">
                      {(response.data as any).flagsmith_feature_name}
                    </span>
                  </div>
                  <p className="text-text-secondary leading-relaxed">
                    {(response.data as any).hypothesis}
                  </p>
                  <div className="pt-2">
                    <Link
                      href="/studio"
                      className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                    >
                      Open in Experiment Studio <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}

              {/* Raw JSON Accordion / Inspector */}
              <div className="p-3 rounded-lg bg-surface border border-border">
                <span className="font-semibold text-xs text-text flex items-center gap-1.5 mb-2">
                  <Code2 className="w-3.5 h-3.5 text-primary" /> Validated Structured JSON Payload
                </span>
                <pre className="p-3 rounded bg-surface-subtle border border-border-subtle font-mono text-[11px] text-text overflow-x-auto max-h-56">
                  {JSON.stringify(response.data, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity History Table */}
      <div className="rounded-lg border border-border bg-surface shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border bg-surface-subtle flex items-center justify-between">
          <h3 className="text-sm font-bold text-text flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Orchestration Invocation History
          </h3>
          <span className="text-xs text-text-secondary font-mono">{history.length} runs</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-secondary uppercase tracking-wider bg-surface-subtle/50 font-medium">
                <th className="py-2.5 px-4">Dispatched Prompt</th>
                <th className="py-2.5 px-4">Routed Agent</th>
                <th className="py-2.5 px-4">Latency</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-surface-subtle transition-colors">
                  <td className="py-3 px-4 font-medium text-text">"{item.prompt}"</td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-primary">{item.agentName}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-text-secondary">
                    {item.executionTimeMs}ms
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status="active" label={item.status} dot={false} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-text-secondary">
                    {item.timestamp}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
