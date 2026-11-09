import React from "react";
import { Flag, Sliders, ToggleLeft, ToggleRight, AlertOctagon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

export interface FeatureFlagCardProps {
  name: string;
  description?: string;
  enabled: boolean;
  type?: "MULTIVARIATE" | "BOOLEAN";
  variants?: {
    key: string;
    trafficAllocation: number; // e.g. 50
    value: string;
  }[];
  environment?: string;
  onToggleState?: () => void;
  onKillSwitch?: () => void;
  className?: string;
}

export function FeatureFlagCard({
  name,
  description,
  enabled,
  type = "MULTIVARIATE",
  variants = [],
  environment = "Production",
  onToggleState,
  onKillSwitch,
  className,
}: FeatureFlagCardProps) {
  return (
    <div
      className={cn(
        "p-5 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all",
        !enabled && "opacity-80 bg-surface-subtle",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0",
              enabled ? "bg-primary-light text-primary" : "bg-surface-muted text-text-secondary"
            )}
          >
            <Flag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-text">{name}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-surface-muted font-mono text-text-secondary border border-border">
                {type}
              </span>
            </div>
            {description && <p className="text-xs text-text-secondary mt-1">{description}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge
            status={enabled ? "active" : "draft"}
            label={enabled ? "ACTIVE (FLAGSMITH)" : "DISABLED"}
          />
          {onToggleState && (
            <button
              onClick={onToggleState}
              className="text-text-secondary hover:text-primary transition-colors"
              title={enabled ? "Disable Flag" : "Enable Flag"}
            >
              {enabled ? (
                <ToggleRight className="w-7 h-7 text-primary" />
              ) : (
                <ToggleLeft className="w-7 h-7 text-text-muted" />
              )}
            </button>
          )}
        </div>
      </div>

      {variants.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
            <span className="font-medium flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-primary" /> Traffic Allocation Splits
            </span>
            <span className="font-mono">{environment}</span>
          </div>

          <div className="w-full h-2 rounded-full bg-surface-muted flex overflow-hidden mb-3">
            {variants.map((variant, i) => (
              <div
                key={variant.key}
                style={{ width: `${variant.trafficAllocation}%` }}
                className={cn(
                  "h-full",
                  i === 0
                    ? "bg-text-secondary"
                    : i === 1
                    ? "bg-primary"
                    : i === 2
                    ? "bg-success"
                    : "bg-warning"
                )}
                title={`${variant.key}: ${variant.trafficAllocation}%`}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {variants.map((variant, i) => (
              <div
                key={variant.key}
                className="p-2 rounded bg-surface-subtle border border-border-subtle text-xs"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="font-medium text-text truncate">{variant.key}</span>
                  <span className="font-bold text-primary">{variant.trafficAllocation}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {onKillSwitch && (
        <div className="mt-4 pt-3 border-t border-border-subtle flex justify-end">
          <button
            onClick={onKillSwitch}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-danger hover:text-danger-text px-2.5 py-1 rounded bg-danger-light transition-colors"
          >
            <AlertOctagon className="w-3.5 h-3.5" /> Emergency Kill-Switch
          </button>
        </div>
      )}
    </div>
  );
}

