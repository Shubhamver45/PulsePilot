"use client";

import React, { useState } from "react";
import { Settings, ShieldCheck, Key, Save, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      <PageHeader
        title="Settings & Environment Configuration"
        description="Manage Flagsmith project linkages, Gemini model parameters, and safety policies."
      />

      <div className="max-w-3xl space-y-6">
        {/* Flagsmith API Connection */}
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-text flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" /> Flagsmith API Configuration
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            Flagsmith Management keys operate strictly server-side to provision features and update multivariate splits.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-text-secondary">Project ID</label>
              <input
                type="text"
                defaultValue="12345"
                className="w-full mt-1 p-2 rounded bg-surface-subtle border border-border font-mono text-text"
              />
            </div>
            <div>
              <label className="font-semibold text-text-secondary">Environment Key (Client SDK)</label>
              <input
                type="text"
                placeholder="Configured via FLAGSMITH_ENVIRONMENT_KEY"
                disabled
                className="w-full mt-1 p-2 rounded bg-surface-subtle border border-border font-mono text-text"
              />
            </div>
          </div>
        </div>

        {/* Gemini AI Parameters */}
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-text flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> AI Agent Safety Controls
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded bg-surface-subtle border border-border">
              <div>
                <span className="font-semibold text-text">Human-in-the-Loop (HITL) Enforcement</span>
                <p className="text-text-secondary text-[11px] mt-0.5">
                  Block all autonomous production mutations until manually approved.
                </p>
              </div>
              <input type="checkbox" defaultChecked disabled className="w-4 h-4 accent-primary" />
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-surface-subtle border border-border">
              <div>
                <span className="font-semibold text-text">Deterministic Math Safeguard</span>
                <p className="text-text-secondary text-[11px] mt-0.5">
                  Require all p-values and confidence intervals to be computed in TypeScript.
                </p>
              </div>
              <input type="checkbox" defaultChecked disabled className="w-4 h-4 accent-primary" />
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-1.5 transition-colors"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Settings Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

