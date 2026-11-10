"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Flag, Plus, Sliders, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FeatureFlagCard } from "@/components/ui/FeatureFlagCard";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState([
    {
      name: "exp_checkout_social_proof",
      description: "Checkout card customer quote vs standard CTA",
      enabled: true,
      type: "MULTIVARIATE" as const,
      variants: [
        { key: "control", trafficAllocation: 50, value: '{"badge":"Standard"}' },
        { key: "variant_social_proof", trafficAllocation: 50, value: '{"badge":"Loved"}' },
      ],
    },
    {
      name: "exp_pricing_annual_default",
      description: "Default Annual toggle on pricing tier",
      enabled: true,
      type: "MULTIVARIATE" as const,
      variants: [
        { key: "control", trafficAllocation: 50, value: '{"default":"monthly"}' },
        { key: "variant_annual", trafficAllocation: 50, value: '{"default":"annual"}' },
      ],
    },
    {
      name: "exp_onboarding_wizard_v2",
      description: "1-step modal vs 4-step walkthrough",
      enabled: true,
      type: "MULTIVARIATE" as const,
      variants: [
        { key: "control", trafficAllocation: 0, value: '{"steps":4}' },
        { key: "variant_1step", trafficAllocation: 100, value: '{"steps":1}' },
      ],
    },
    {
      name: "killswitch_emergency_maintenance",
      description: "Global maintenance mode fallback",
      enabled: false,
      type: "BOOLEAN" as const,
      variants: [],
    },
  ]);

  const [killModalOpen, setKillModalOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "disabled">("all");

  const filteredFlags = flags.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && f.enabled) ||
      (filter === "disabled" && !f.enabled);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      <PageHeader
        title="Flagsmith Feature Flags"
        description="Direct view of multivariate features, segment overrides, and instant kill switches managed through Flagsmith."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/studio"
              className="px-3.5 py-2 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> Create AI Feature Flag
            </Link>
            <Link
              href="/release-center"
              className="px-3 py-2 rounded-md bg-surface border border-border hover:bg-surface-subtle text-text text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Release Guardian
            </Link>
            <a
              href="https://flagsmith.com"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-md text-xs font-semibold text-text border border-border bg-surface hover:bg-surface-subtle transition-colors flex items-center gap-1.5"
            >
              Flagsmith Console <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
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
            placeholder="Search feature flags..."
            className="w-full pl-9 pr-3 py-1.5 rounded-md bg-surface-subtle border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs">
          {(["all", "active", "disabled"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                filter === key
                  ? "bg-primary text-white shadow-xs"
                  : "text-text-secondary hover:text-text hover:bg-surface-subtle"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredFlags.map((flag) => (
          <FeatureFlagCard
            key={flag.name}
            name={flag.name}
            description={flag.description}
            enabled={flag.enabled}
            type={flag.type}
            variants={flag.variants}
            onToggleState={() => {
              setFlags((prev) =>
                prev.map((f) =>
                  f.name === flag.name ? { ...f, enabled: !f.enabled } : f
                )
              );
            }}
            onKillSwitch={() => {
              setSelectedFlag(flag.name);
              setKillModalOpen(true);
            }}
          />
        ))}
      </div>

      <ConfirmationModal
        isOpen={killModalOpen}
        onClose={() => setKillModalOpen(false)}
        onConfirm={() => {
          if (selectedFlag) {
            setFlags((prev) =>
              prev.map((f) =>
                f.name === selectedFlag ? { ...f, enabled: false } : f
              )
            );
          }
          setKillModalOpen(false);
        }}
        title="Emergency Kill-Switch Trigger"
        description={`Are you sure you want to disable '${selectedFlag}' in Flagsmith immediately? All client requests will revert to default behavior.`}
        confirmLabel="Disable Flag Now"
        variant="danger"
      />
    </div>
  );
}

