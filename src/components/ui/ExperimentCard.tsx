import React from "react";
import Link from "next/link";
import { ArrowRight, Users, CheckCircle2, Flag, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

export interface ExperimentCardProps {
  id: string;
  title: string;
  hypothesis: string;
  status: string;
  flagsmithFeatureName: string;
  primaryMetric: string;
  sampleSizeCurrent: number;
  sampleSizeTarget: number;
  winnerVariant?: string;
  upliftPercent?: number;
  confidencePercent?: number;
  variantsCount?: number;
  className?: string;
}

export function ExperimentCard({
  id,
  title,
  hypothesis,
  status,
  flagsmithFeatureName,
  primaryMetric,
  sampleSizeCurrent,
  sampleSizeTarget,
  winnerVariant,
  upliftPercent,
  confidencePercent,
  variantsCount = 2,
  className,
}: ExperimentCardProps) {
  const progressPercent = Math.min(
    100,
    Math.round((sampleSizeCurrent / Math.max(1, sampleSizeTarget)) * 100)
  );

  return (
    <div
      className={cn(
        "p-5 rounded-lg bg-surface border border-border shadow-xs hover:shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between group",
        className
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <StatusBadge status={status} />
          <div className="flex items-center gap-1.5 text-xs text-text-secondary font-mono">
            <Flag className="w-3.5 h-3.5 text-primary" />
            <span className="truncate max-w-[160px]">{flagsmithFeatureName}</span>
          </div>
        </div>

        <Link href={`/experiments/${id}`} className="block">
          <h3 className="text-base font-semibold text-text group-hover:text-primary transition-colors line-clamp-1">
            {title}
          </h3>
        </Link>

        <p className="text-xs text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">
          {hypothesis}
        </p>

        {/* Uplift & Confidence Callout */}
        {upliftPercent !== undefined && (
          <div className="mt-3.5 p-2.5 rounded bg-surface-subtle border border-border-subtle flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-medium text-success">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {upliftPercent > 0 ? `+${upliftPercent.toFixed(1)}%` : `${upliftPercent.toFixed(1)}%`} Uplift
              </span>
            </div>
            {confidencePercent !== undefined && (
              <span className="text-text-secondary font-mono">
                {confidencePercent.toFixed(1)}% Confidence
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3.5 border-t border-border-subtle">
        <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Sample Size Progress
          </span>
          <span className="font-mono">
            {sampleSizeCurrent.toLocaleString()} / {sampleSizeTarget.toLocaleString()} ({progressPercent}%)
          </span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-surface-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-3.5 flex items-center justify-between text-xs pt-1">
          <span className="text-text-secondary">
            Metric: <strong className="text-text font-medium">{primaryMetric}</strong>
          </span>
          <Link
            href={`/experiments/${id}`}
            className="inline-flex items-center gap-1 text-primary font-medium hover:text-primary-dark transition-colors"
          >
            Analytics <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

