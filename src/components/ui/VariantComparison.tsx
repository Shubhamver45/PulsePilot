import React from "react";
import { Check, Crown, ArrowUpRight, ArrowDownRight, Minus, Sliders } from "lucide-react";
import { cn, formatPercent, formatNumber } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

export interface VariantData {
  id: string;
  key: string;
  name: string;
  description?: string;
  isControl: boolean;
  trafficAllocation: number;
  exposures: number;
  conversions: number;
  conversionRate: number;
  relativeUplift?: number; // relative to control
  confidenceInterval?: [number, number]; // [lower, upper]
  bayesianWinProb?: number; // e.g. 0.97
  isLeader?: boolean;
  featureValue?: any;
}

export interface VariantComparisonProps {
  variants: VariantData[];
  primaryMetricName?: string;
  onSelectWinner?: (variantKey: string) => void;
  className?: string;
}

export function VariantComparison({
  variants,
  primaryMetricName = "Conversions",
  onSelectWinner,
  className,
}: VariantComparisonProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}>
      <div className="p-4 border-b border-border bg-surface-subtle flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-text">Multivariate Performance Breakdown</h4>
          <p className="text-xs text-text-secondary mt-0.5">
            Evaluated by Flagsmith engine • Statistically verified metrics
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Sliders className="w-3.5 h-3.5 text-primary" />
          <span>Metric: <strong className="text-text">{primaryMetricName}</strong></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-text-secondary uppercase tracking-wider bg-surface-subtle/50 font-medium">
              <th className="py-3 px-4">Variant</th>
              <th className="py-3 px-4">Traffic Split</th>
              <th className="py-3 px-4">Exposures</th>
              <th className="py-3 px-4">Conversions</th>
              <th className="py-3 px-4">Conversion Rate</th>
              <th className="py-3 px-4">Uplift vs Control</th>
              <th className="py-3 px-4">Bayes Win Prob</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {variants.map((variant) => {
              const crPercent = (variant.conversionRate * 100).toFixed(2);
              const uplift = variant.relativeUplift;

              return (
                <tr
                  key={variant.key}
                  className={cn(
                    "hover:bg-surface-subtle/70 transition-colors",
                    variant.isLeader && "bg-primary-light/20"
                  )}
                >
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      {variant.isLeader && (
                        <Crown className="w-4 h-4 text-warning flex-shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-text">{variant.name}</span>
                          {variant.isControl && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-muted text-text-secondary font-mono border border-border">
                              CONTROL
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-xs text-text-secondary">{variant.key}</span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-xs text-text">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${variant.trafficAllocation}%` }}
                        />
                      </div>
                      <span>{variant.trafficAllocation}%</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-xs text-text">
                    {formatNumber(variant.exposures)}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-xs text-text">
                    {formatNumber(variant.conversions)}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-text font-mono">{crPercent}%</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-xs">
                    {variant.isControl ? (
                      <span className="text-text-muted flex items-center gap-1">
                        <Minus className="w-3.5 h-3.5" /> Baseline
                      </span>
                    ) : uplift !== undefined ? (
                      <span
                        className={cn(
                          "flex items-center gap-1 font-semibold",
                          uplift > 0 ? "text-success" : uplift < 0 ? "text-danger" : "text-text-secondary"
                        )}
                      >
                        {uplift > 0 ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : uplift < 0 ? (
                          <ArrowDownRight className="w-4 h-4" />
                        ) : (
                          <Minus className="w-4 h-4" />
                        )}
                        {uplift > 0 ? `+${uplift.toFixed(1)}%` : `${uplift.toFixed(1)}%`}
                      </span>
                    ) : (
                      <span className="text-text-muted">--</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-xs">
                    {variant.isControl ? (
                      <span className="text-text-muted">--</span>
                    ) : variant.bayesianWinProb !== undefined ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded font-medium",
                          variant.bayesianWinProb >= 0.95
                            ? "bg-success-light text-success-text border border-success/20"
                            : "bg-surface-muted text-text-secondary"
                        )}
                      >
                        {(variant.bayesianWinProb * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-text-muted">Calculating...</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    {onSelectWinner && !variant.isControl && (
                      <button
                        onClick={() => onSelectWinner(variant.key)}
                        className="px-2.5 py-1 text-xs font-medium rounded text-primary hover:bg-primary-light border border-primary/30 transition-colors"
                      >
                        Rollout to 100%
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

