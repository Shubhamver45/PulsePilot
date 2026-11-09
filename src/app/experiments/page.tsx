"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Plus, Search, Filter, FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExperimentCard } from "@/components/ui/ExperimentCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

const mockExperiments = [
  {
    id: "exp-1",
    title: "Checkout Social Proof Testimonials",
    hypothesis: "Adding verified customer testimonials on checkout card will reduce cart abandonment.",
    status: "active",
    flagsmithFeatureName: "exp_checkout_social_proof",
    primaryMetric: "checkout_completed",
    sampleSizeCurrent: 4800,
    sampleSizeTarget: 4000,
    upliftPercent: 18.4,
    confidencePercent: 97.4,
  },
  {
    id: "exp-2",
    title: "Annual vs Monthly Default Pricing",
    hypothesis: "Defaulting the pricing toggle to Annual with a 'Save 20%' badge will lift ARR.",
    status: "running",
    flagsmithFeatureName: "exp_pricing_annual_default",
    primaryMetric: "annual_subscription",
    sampleSizeCurrent: 1850,
    sampleSizeTarget: 3000,
    upliftPercent: 8.2,
    confidencePercent: 84.6,
  },
  {
    id: "exp-3",
    title: "Simplified 1-Step Onboarding Modal",
    hypothesis: "Replacing the 4-step wizard with a single streamlined modal will lift onboarding completion.",
    status: "completed",
    flagsmithFeatureName: "exp_onboarding_wizard_v2",
    primaryMetric: "workspace_created",
    sampleSizeCurrent: 5200,
    sampleSizeTarget: 5000,
    upliftPercent: 24.1,
    confidencePercent: 99.1,
  },
  {
    id: "exp-4",
    title: "Sticky Hero CTA for Mobile Web",
    hypothesis: "Affixing a primary CTA at the bottom of the mobile viewport will increase free trial starts.",
    status: "draft",
    flagsmithFeatureName: "exp_mobile_sticky_cta",
    primaryMetric: "trial_started",
    sampleSizeCurrent: 0,
    sampleSizeTarget: 2500,
  },
];

export default function ExperimentsPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = mockExperiments.filter((exp) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && (exp.status === "active" || exp.status === "running")) ||
      (filter === "completed" && exp.status === "completed") ||
      (filter === "draft" && exp.status === "draft");

    const matchesSearch =
      exp.title.toLowerCase().includes(search.toLowerCase()) ||
      exp.flagsmithFeatureName.toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      <PageHeader
        title="Product Experiments"
        description="Monitor, analyze, and manage all multi-variant experiments deployed across your product."
        actions={
          <Link
            href="/studio"
            className="px-3.5 py-2 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" /> New Experiment
          </Link>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-surface border border-border shadow-xs">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search experiments or flags..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-subtle/50 border border-border rounded-md text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {["all", "active", "completed", "draft"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                filter === tab
                  ? "bg-primary-light text-primary font-semibold"
                  : "text-text-secondary hover:text-text hover:bg-surface-subtle"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Experiments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {filtered.map((exp) => (
          <ExperimentCard key={exp.id} {...exp} />
        ))}
      </div>
    </div>
  );
}

