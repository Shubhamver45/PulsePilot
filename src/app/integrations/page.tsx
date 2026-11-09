"use client";

import React from "react";
import { Flag, Sparkles, Database, CheckCircle2, ShieldCheck, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default function IntegrationsPage() {
  const integrations = [
    {
      name: "Flagsmith Cloud",
      category: "Feature Flags & Remote Config",
      status: "connected",
      description: "Dual-tier integration: Management REST API and React client evaluation engine.",
      icon: <Flag className="w-5 h-5 text-primary" />,
      details: "Project ID: 12345 • Environment: Production",
    },
    {
      name: "Google Gemini AI",
      category: "Autonomous Agent Intelligence",
      status: "connected",
      description: "Structured JSON schema output engine powering Hypothesis, Analyst, and Strategist agents.",
      icon: <Sparkles className="w-5 h-5 text-primary" />,
      details: "Model: gemini-2.5-flash • Structured Outputs Enforced",
    },
    {
      name: "PostgreSQL Database",
      category: "Persistence & Telemetry Logs",
      status: "connected",
      description: "High-throughput event logging, experiment variants, and immutable audit logs.",
      icon: <Database className="w-5 h-5 text-primary" />,
      details: "Prisma ORM • Connection Pooled",
    },
    {
      name: "Supabase Authentication",
      category: "Identity & RBAC",
      status: "connected",
      description: "JWT session verification and Human-in-the-Loop approver signature validation.",
      icon: <ShieldCheck className="w-5 h-5 text-success" />,
      details: "Role: Admin / Editor",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      <PageHeader
        title="Platform Integrations"
        description="Core infrastructure providers powering PulsePilot's autonomous experimentation lifecycle."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((item) => (
          <div
            key={item.name}
            className="p-5 rounded-lg border border-border bg-surface shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text">{item.name}</h3>
                    <span className="text-xs text-text-secondary">{item.category}</span>
                  </div>
                </div>
                <StatusBadge status="active" label="CONNECTED" />
              </div>

              <p className="text-xs text-text-secondary leading-relaxed">{item.description}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-secondary font-mono">
              <span>{item.details}</span>
              <CheckCircle2 className="w-4 h-4 text-success" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

