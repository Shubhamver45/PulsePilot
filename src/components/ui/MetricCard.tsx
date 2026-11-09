import React from "react";
import { ArrowUpRight, ArrowDownRight, Minus, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string | number;
  changeType?: "positive" | "negative" | "neutral";
  changeLabel?: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
  className?: string;
}

export function MetricCard({
  title,
  value,
  change,
  changeType = "neutral",
  changeLabel = "vs baseline",
  description,
  icon,
  badge,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "p-5 rounded-lg bg-surface border border-border shadow-xs hover:shadow-sm transition-all duration-150 flex flex-col justify-between",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-medium text-text-secondary tracking-wide uppercase">
          {title}
        </span>
        {icon && (
          <div className="w-8 h-8 rounded-md bg-primary-light text-primary flex items-center justify-center">
            {icon}
          </div>
        )}
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded bg-surface-muted text-text-secondary border border-border">
            {badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-text tracking-tight">{value}</span>
      </div>

      {(change !== undefined || description) && (
        <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between text-xs">
          {change !== undefined && (
            <div className="flex items-center gap-1 font-medium">
              {changeType === "positive" && (
                <span className="text-success flex items-center gap-0.5">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  {change}
                </span>
              )}
              {changeType === "negative" && (
                <span className="text-danger flex items-center gap-0.5">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  {change}
                </span>
              )}
              {changeType === "neutral" && (
                <span className="text-text-secondary flex items-center gap-0.5">
                  <Minus className="w-3.5 h-3.5" />
                  {change}
                </span>
              )}
              <span className="text-text-secondary font-normal ml-1">{changeLabel}</span>
            </div>
          )}
          {description && (
            <span className="text-text-secondary truncate ml-auto">{description}</span>
          )}
        </div>
      )}
    </div>
  );
}

