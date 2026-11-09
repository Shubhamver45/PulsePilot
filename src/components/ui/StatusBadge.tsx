import React from "react";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "draft"
  | "active"
  | "running"
  | "paused"
  | "completed"
  | "rolled_out"
  | "rolled_back"
  | "warning"
  | "pending";

interface StatusBadgeProps {
  status: StatusVariant | string;
  label?: string;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<
  string,
  { bg: string; text: string; border: string; dotColor: string }
> = {
  active: {
    bg: "bg-success-light",
    text: "text-success-text",
    border: "border-success/20",
    dotColor: "bg-success",
  },
  running: {
    bg: "bg-success-light",
    text: "text-success-text",
    border: "border-success/20",
    dotColor: "bg-success",
  },
  rolled_out: {
    bg: "bg-primary-light",
    text: "text-primary",
    border: "border-primary/20",
    dotColor: "bg-primary",
  },
  completed: {
    bg: "bg-primary-light",
    text: "text-primary",
    border: "border-primary/20",
    dotColor: "bg-primary",
  },
  draft: {
    bg: "bg-surface-muted",
    text: "text-text-secondary",
    border: "border-border",
    dotColor: "bg-text-secondary",
  },
  paused: {
    bg: "bg-warning-light",
    text: "text-warning-text",
    border: "border-warning/20",
    dotColor: "bg-warning",
  },
  pending: {
    bg: "bg-warning-light",
    text: "text-warning-text",
    border: "border-warning/20",
    dotColor: "bg-warning",
  },
  rolled_back: {
    bg: "bg-danger-light",
    text: "text-danger-text",
    border: "border-danger/20",
    dotColor: "bg-danger",
  },
  warning: {
    bg: "bg-warning-light",
    text: "text-warning-text",
    border: "border-warning/20",
    dotColor: "bg-warning",
  },
};

export function StatusBadge({
  status,
  label,
  dot = true,
  className,
}: StatusBadgeProps) {
  const normalizedKey = status.toLowerCase().replace(/[\s-]/g, "_");
  const style = variantStyles[normalizedKey] || variantStyles.draft;
  const displayLabel = label || status.replace(/_/g, " ").toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        style.bg,
        style.text,
        style.border,
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse",
            style.dotColor
          )}
        />
      )}
      {displayLabel}
    </span>
  );
}

