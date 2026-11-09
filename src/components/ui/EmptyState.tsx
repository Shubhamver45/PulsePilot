import React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "p-12 rounded-lg border border-dashed border-border bg-surface text-center flex flex-col items-center justify-center",
        className
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-full bg-primary-light text-primary flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <p className="text-xs text-text-secondary mt-1.5 max-w-sm leading-relaxed">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-md hover:bg-primary-dark transition-colors shadow-xs"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function SkeletonLoader({
  className,
  count = 1,
}: {
  className?: string;
  count?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "animate-pulse rounded-md bg-surface-muted border border-border-subtle",
            className
          )}
        />
      ))}
    </>
  );
}

