"use client";

import React, { useState, useEffect } from "react";
import { History, ShieldCheck, Download, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuditRecord } from "@/lib/audit/audit-logger";

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchLogs = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/audit-logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const columns: Column<AuditRecord>[] = [
    {
      header: "Timestamp",
      accessorKey: "timestamp",
      cell: (item) => (
        <span className="font-mono text-text-secondary text-[11px]">
          {new Date(item.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      header: "Action",
      accessorKey: "action",
      cell: (item) => (
        <span
          className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
            item.action.includes("ROLLOUT")
              ? "bg-success-light text-success border border-success/20"
              : item.action.includes("KILL") || item.action.includes("ROLLBACK")
              ? "bg-danger-light text-danger border border-danger/20"
              : item.action.includes("FLAG")
              ? "bg-primary-light text-primary border border-primary/20"
              : "bg-surface-muted text-text-secondary border border-border"
          }`}
        >
          {item.action}
        </span>
      ),
    },
    {
      header: "Actor",
      cell: (item) => (
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-text">{item.actor.name}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-muted text-text-secondary border border-border">
            {item.actor.type.toUpperCase()}
          </span>
        </div>
      ),
    },
    {
      header: "Entity ID",
      accessorKey: "entityId",
      cell: (item) => <span className="font-mono text-primary text-xs">{item.entityId}</span>,
    },
    {
      header: "Details",
      accessorKey: "details",
      cell: (item) => <span className="text-text-secondary text-xs">{item.details}</span>,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      <PageHeader
        title="Activity & Audit Logs"
        description="Append-only, cryptographically accountable audit trail logging all AI agent formulations, human approvals, and Flagsmith feature mutations."
        badge={<StatusBadge status="active" label="APPEND-ONLY STREAM" />}
        actions={
          <button
            onClick={fetchLogs}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded bg-surface border border-border hover:bg-surface-subtle text-xs font-semibold text-text flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : "text-text-secondary"}`}
            />
            Refresh Audit Stream
          </button>
        }
      />

      <DataTable
        columns={columns}
        data={logs}
        searchKey="action"
        searchPlaceholder="Filter audit actions (e.g. ROLLOUT, FLAG)..."
      />
    </div>
  );
}
