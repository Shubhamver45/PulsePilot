import React from "react";
import { Sparkles, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

export interface AIInsightCardProps {
  title: string;
  summary: string;
  confidenceScore?: number; // 0 to 1
  impact?: "high" | "medium" | "low";
  type?: "winner_detected" | "guardrail_warning" | "sample_needed" | "neutral";
  observations?: string[];
  recommendedAction?: string;
  onActionClick?: () => void;
  className?: string;
}

export function AIInsightCard({
  title,
  summary,
  confidenceScore,
  impact = "medium",
  type = "neutral",
  observations,
  recommendedAction,
  onActionClick,
  className,
}: AIInsightCardProps) {
  return (
    <div
      className={cn(
        "p-5 rounded-lg bg-surface border border-border shadow-xs relative overflow-hidden transition-all hover:border-primary/40",
        type === "winner_detected" && "border-l-4 border-l-success",
        type === "guardrail_warning" && "border-l-4 border-l-danger",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0",
              type === "winner_detected"
                ? "bg-success-light text-success"
                : type === "guardrail_warning"
                ? "bg-danger-light text-danger"
                : "bg-primary-light text-primary"
            )}
          >
            {type === "winner_detected" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : type === "guardrail_warning" ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text">{title}</h4>
            <span className="text-xs text-text-secondary">AI Statistical Synthesis</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {confidenceScore !== undefined && (
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-primary-light text-primary border border-primary/20">
              {(confidenceScore * 100).toFixed(1)}% Confidence
            </span>
          )}
          <StatusBadge
            status={
              impact === "high"
                ? "warning"
                : impact === "medium"
                ? "active"
                : "draft"
            }
            label={`${impact.toUpperCase()} IMPACT`}
            dot={false}
          />
        </div>
      </div>

      <p className="mt-3 text-sm text-text-secondary leading-relaxed">{summary}</p>

      {observations && observations.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs text-text-secondary">
          {observations.map((obs, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-shrink-0" />
              <span>{obs}</span>
            </li>
          ))}
        </ul>
      )}

      {recommendedAction && (
        <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between">
          <span className="text-xs text-text-secondary">
            Recommended Action: <strong className="text-text">{recommendedAction}</strong>
          </span>
          {onActionClick && (
            <button
              onClick={onActionClick}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark transition-colors"
            >
              Take Action <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

