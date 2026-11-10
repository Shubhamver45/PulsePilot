import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

export function StatusBadge({ status }: { status: string }) {
  const isHealthy = ["active", "running", "ready", "ready_for_rollout", "success"].includes(status.toLowerCase());
  const isWarning = ["pending", "paused", "awaiting_approval"].includes(status.toLowerCase());

  if (isHealthy) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        {status.replace(/_/g, " ")}
      </span>
    );
  }

  if (isWarning) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        {status.replace(/_/g, " ")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
      <Info className="w-3 h-3 text-slate-500" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function MetricCard({
  title,
  value,
  subvalue,
  change,
}: {
  title: string;
  value: string;
  subvalue?: string;
  change?: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1">
      <div className="text-xs font-semibold text-slate-500">{title}</div>
      <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
      {subvalue && <div className="text-xs text-slate-500">{subvalue}</div>}
      {change && <div className="text-xs font-semibold text-emerald-600">{change}</div>}
    </div>
  );
}
