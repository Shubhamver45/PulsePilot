import React from "react";
import { Sparkles, ShieldCheck, Activity, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

export interface AgentStatusCardProps {
  name: string;
  role: string;
  status: "idle" | "running" | "ready" | "awaiting_approval";
  lastAction?: string;
  model?: string;
  humanInTheLoop?: boolean;
  className?: string;
}

export function AgentStatusCard({
  name,
  role,
  status,
  lastAction,
  model = "gemini-2.5-flash",
  humanInTheLoop = true,
  className,
}: AgentStatusCardProps) {
  const statusMap: Record<string, { label: string; status: any }> = {
    idle: { label: "Standing By", status: "draft" },
    running: { label: "Analyzing", status: "running" },
    ready: { label: "Active", status: "active" },
    awaiting_approval: { label: "Pending HITL", status: "warning" },
  };

  const current = statusMap[status] || statusMap.idle;

  return (
    <div
      className={cn(
        "p-4 rounded-lg bg-surface border border-border shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary-light text-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text">{name}</h4>
            <p className="text-xs text-text-secondary">{role}</p>
          </div>
        </div>
        <StatusBadge status={current.status} label={current.label} />
      </div>

      <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-secondary">
        <div className="flex items-center gap-1.5 font-mono">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <span>{model}</span>
        </div>
        {humanInTheLoop && (
          <div className="flex items-center gap-1 text-success-text bg-success-light px-2 py-0.5 rounded font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>HITL Enforced</span>
          </div>
        )}
      </div>

      {lastAction && (
        <p className="mt-2 text-xs text-text-secondary bg-surface-subtle p-2 rounded border border-border-subtle truncate">
          <span className="font-medium text-text">Last Action:</span> {lastAction}
        </p>
      )}
    </div>
  );
}

