"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  BookOpen,
  ShieldCheck,
  Cpu,
  Layers,
  Database,
  CheckCircle2,
  ExternalLink,
  Search,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

interface DocItem {
  id: string;
  title: string;
  category: "Architecture" | "Engineering" | "Security & QA" | "Roadmap";
  description: string;
  filename: string;
  tags: string[];
}

const DOCUMENTS: DocItem[] = [
  {
    id: "prd",
    title: "Product Requirements Document (PRD)",
    category: "Architecture",
    description: "Core vision, user personas, functional specifications, and Hackathon Track 02 requirements.",
    filename: "PRD.md",
    tags: ["Specs", "Track 02", "Vision"],
  },
  {
    id: "architecture",
    title: "System Architecture Blueprint",
    category: "Architecture",
    description: "Multi-tier architecture diagram, data flow pipelines, actuator patterns, and component relationships.",
    filename: "SYSTEM_ARCHITECTURE.md",
    tags: ["Architecture", "Pipelines", "Actuators"],
  },
  {
    id: "flagsmith",
    title: "Flagsmith Integration Specification",
    category: "Engineering",
    description: "Dual-tier Flagsmith integration: REST Management API for mutations and React Client SDK for evaluation.",
    filename: "FLAGSMITH_INTEGRATION.md",
    tags: ["Flagsmith", "SDK", "REST API"],
  },
  {
    id: "agents",
    title: "AI Multi-Agent System Design",
    category: "Engineering",
    description: "Detailed prompt design, typed Zod schemas, and orchestration router for all 5 specialized Gemini agents.",
    filename: "AI_AGENT_DESIGN.md",
    tags: ["Gemini", "Multi-Agent", "Zod"],
  },
  {
    id: "database",
    title: "Database Schema & Relational Models",
    category: "Engineering",
    description: "Prisma schema, PostgreSQL indexes, relational mapping, and tenant workspace isolation rules.",
    filename: "DATABASE_SCHEMA.md",
    tags: ["PostgreSQL", "Prisma", "Schema"],
  },
  {
    id: "qa-report",
    title: "Comprehensive QA Audit Report",
    category: "Security & QA",
    description: "Full functional test matrix (27/27 passed), deterministic math verification, and responsive UX audit.",
    filename: "QA_REPORT.md",
    tags: ["QA", "Tests", "Verification"],
  },
  {
    id: "security-audit",
    title: "Application Security & AI Safety Audit",
    category: "Security & QA",
    description: "Threat model, zero secret leakage, prompt injection neutralization, rate limiting, and HITL policy.",
    filename: "SECURITY_AUDIT.md",
    tags: ["Security", "OWASP", "AI Safety"],
  },
  {
    id: "deployment",
    title: "Production Deployment Guide",
    category: "Architecture",
    description: "Complete deployment guide for Vercel + Supabase PostgreSQL + Flagsmith Cloud.",
    filename: "DEPLOYMENT_REPORT.md",
    tags: ["Vercel", "Supabase", "Production"],
  },
  {
    id: "demo-plan",
    title: "3-Minute Video Demo Script & Judges' Runbook",
    category: "Roadmap",
    description: "Scene-by-scene presentation timing breakdown, talking points, and interactive walkthrough for judges.",
    filename: "DEMO_PLAN.md",
    tags: ["Demo", "Judging", "Runbook"],
  },
  {
    id: "state",
    title: "Master Project State & Roadmap",
    category: "Roadmap",
    description: "Complete inventory of all 43 App Router routes, deterministic engine, and future production roadmap.",
    filename: "PROJECT_STATE_AND_ROADMAP.md",
    tags: ["Roadmap", "Inventory", "Status"],
  },
];

export default function DocsPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const filteredDocs = DOCUMENTS.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.description.toLowerCase().includes(search.toLowerCase()) ||
      doc.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = selectedCategory === "All" || doc.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-20">
      <PageHeader
        title="PulsePilot AI Documentation Hub"
        description="Engineering blueprints, mathematical proofs, security audits, and deployment specifications."
        badge={
          <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-primary-light text-primary font-bold border border-primary/20">
            10 Documents Verified
          </span>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-border shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search specifications, schemas, audits..."
            className="w-full pl-9 pr-3 py-1.5 rounded-md bg-surface-subtle border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs overflow-x-auto w-full sm:w-auto">
          {["All", "Architecture", "Engineering", "Security & QA", "Roadmap"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-primary text-white shadow-xs font-bold"
                  : "text-text-secondary hover:text-text hover:bg-surface-subtle"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredDocs.map((doc) => (
          <div
            key={doc.id}
            className="p-5 rounded-xl border border-border bg-surface shadow-xs hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-surface-subtle text-text-secondary border border-border font-bold">
                  {doc.category}
                </span>
                <span className="text-[11px] font-mono text-text-muted">{doc.filename}</span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-text group-hover:text-primary transition-colors flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <span>{doc.title}</span>
                </h3>
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                  {doc.description}
                </p>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {doc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-surface-subtle text-text-secondary"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border flex items-center justify-between">
              <a
                href={`/docs/${doc.filename}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors flex items-center gap-1"
              >
                <span>Read Full Document</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold">
                VERIFIED
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

