"use client";

import React, { useState } from "react";
import { Flag, Plus, Sliders, ExternalLink } from "lucide-react";
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

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      <PageHeader
        title="Flagsmith Feature Flags"
        description="Direct view of multivariate features, segment overrides, and instant kill switches managed through Flagsmith."
        actions={
          <a
            href="https://flagsmith.com"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-text border border-border bg-surface hover:bg-surface-subtle transition-colors flex items-center gap-1.5"
          >
            Flagsmith Cloud Console <ExternalLink className="w-3.5 h-3.5" />
          </a>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {flags.map((flag) => (
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

