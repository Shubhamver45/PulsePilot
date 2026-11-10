"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  LayoutDashboard,
  FlaskConical,
  Beaker,
  BarChart3,
  Lightbulb,
  Flag,
  ShieldCheck,
  Cpu,
  History,
  Settings,
  ChevronDown,
  Building2,
  ExternalLink,
  Zap,
  Activity,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: "primary" | "warning" | "success";
}

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState("Acme Growth (Production)");
  const [workspacesList, setWorkspacesList] = useState([
    "Acme Growth (Production)",
    "Acme Growth (Staging)",
  ]);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [newWorkspaceModalOpen, setNewWorkspaceModalOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setIsCreatingWs(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkspaceName.trim() }),
      });
      const data = await res.json();
      if (data.success && data.workspace) {
        setWorkspacesList((prev) => [...prev, data.workspace.name]);
        setWorkspace(data.workspace.name);
        setNewWorkspaceName("");
        setNewWorkspaceModalOpen(false);
      }
    } catch (err) {
      console.error("Workspace creation failed:", err);
    } finally {
      setIsCreatingWs(false);
    }
  };

  const navigation: { section?: string; items: NavItem[] }[] = [
    {
      items: [
        {
          name: "Dashboard",
          href: "/dashboard",
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          name: "Overview",
          href: "/",
          icon: <Activity className="w-4 h-4" />,
        },
        {
          name: "AI Command Center",
          href: "/command-center",
          icon: <Sparkles className="w-4 h-4 text-primary" />,
          badge: "Autonomous",
          badgeVariant: "primary",
        },
        {
          name: "Experiment Studio",
          href: "/studio",
          icon: <FlaskConical className="w-4 h-4" />,
          badge: "New",
        },
      ],
    },
    {
      section: "EXPERIMENTATION",
      items: [
        {
          name: "Experiments",
          href: "/experiments",
          icon: <Beaker className="w-4 h-4" />,
        },
        {
          name: "Analytics",
          href: "/analytics",
          icon: <BarChart3 className="w-4 h-4" />,
        },
        {
          name: "AI Insights",
          href: "/insights",
          icon: <Lightbulb className="w-4 h-4" />,
          badge: "Live",
          badgeVariant: "success",
        },
        {
          name: "Demo Sandbox",
          href: "/sandbox",
          icon: <FlaskConical className="w-4 h-4 text-primary" />,
          badge: "Live SDK",
          badgeVariant: "primary",
        },
        {
          name: "Demo Store",
          href: "/demo-store",
          icon: <Zap className="w-4 h-4 text-emerald-600" />,
          badge: "Storefront",
          badgeVariant: "success",
        },
        {
          name: "Demo Video & Voice",
          href: "/demo-video",
          icon: <Play className="w-4 h-4 text-violet-600 fill-violet-600" />,
          badge: "3-Min Video",
          badgeVariant: "primary",
        },
      ],
    },
    {
      section: "FLAGSMITH ENGINE",
      items: [
        {
          name: "Feature Flags",
          href: "/flags",
          icon: <Flag className="w-4 h-4" />,
        },
        {
          name: "Release Center",
          href: "/release-center",
          icon: <ShieldCheck className="w-4 h-4" />,
          badge: "HITL",
          badgeVariant: "warning",
        },
        {
          name: "Integrations",
          href: "/integrations",
          icon: <Cpu className="w-4 h-4" />,
        },
      ],
    },
    {
      section: "SYSTEM & AUDIT",
      items: [
        {
          name: "Activity Logs",
          href: "/activity",
          icon: <History className="w-4 h-4" />,
        },
        {
          name: "Settings",
          href: "/settings",
          icon: <Settings className="w-4 h-4" />,
        },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        "w-64 border-r border-border bg-surface flex flex-col justify-between select-none z-30 h-screen sticky top-0",
        className
      )}
    >
      <div>
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-border flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-xs group-hover:bg-primary-dark transition-colors">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-text">PulsePilot</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary-light text-primary font-semibold">
                  AI
                </span>
              </div>
              <span className="block text-[10px] text-text-secondary leading-none mt-0.5">
                Flagsmith Experimentation
              </span>
            </div>
          </Link>
        </div>

        {/* Workspace Selector with Dropdown */}
        <div className="p-3 border-b border-border bg-surface-subtle/50 relative">
          <button
            onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
            className="w-full flex items-center justify-between p-2 rounded-md bg-surface border border-border shadow-xs hover:border-primary/40 transition-colors text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
              <span className="text-xs font-medium text-text truncate">{workspace}</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${workspaceDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {workspaceDropdownOpen && (
            <div className="absolute left-3 right-3 top-14 rounded-lg bg-surface border border-border shadow-lg p-1.5 z-40 text-xs animate-in fade-in zoom-in-95">
              <span className="text-[10px] font-bold text-text-muted uppercase px-2 py-1 block">
                Workspaces (Isolated Scopes)
              </span>
              <div className="space-y-0.5 mt-1">
                {workspacesList.map((wsName) => (
                  <button
                    key={wsName}
                    onClick={() => {
                      setWorkspace(wsName);
                      setWorkspaceDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded text-left transition-colors ${
                      workspace === wsName
                        ? "bg-primary-light text-primary font-bold"
                        : "hover:bg-surface-subtle text-text"
                    }`}
                  >
                    <span className="truncate">{wsName}</span>
                    {workspace === wsName && <span className="text-[10px] font-mono">✓</span>}
                  </button>
                ))}
              </div>
              <div className="pt-1.5 mt-1 border-t border-border">
                <button
                  onClick={() => {
                    setWorkspaceDropdownOpen(false);
                    setNewWorkspaceModalOpen(true);
                  }}
                  className="w-full p-1.5 rounded hover:bg-surface-subtle text-primary text-[11px] font-bold text-left flex items-center gap-1.5"
                >
                  <span>+ Create Workspace</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Create Workspace Modal */}
        {newWorkspaceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-surface border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-text">Create Isolated Workspace</h3>
              <p className="text-xs text-text-secondary">
                Each workspace has its own Flagsmith project key, experiments, and telemetry partition.
              </p>
              <form onSubmit={handleCreateWorkspace} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-text block mb-1">Workspace Name</label>
                  <input
                    type="text"
                    required
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder="e.g. Acme Mobile (Staging)"
                    className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setNewWorkspaceModalOpen(false)}
                    className="px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-surface-subtle"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingWs}
                    className="px-3 py-1.5 rounded bg-primary text-white font-bold"
                  >
                    {isCreatingWs ? "Creating..." : "Create Workspace"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-220px)]">
          {navigation.map((group, groupIdx) => (
            <div key={groupIdx}>
              {group.section && (
                <div className="px-3 mb-1.5 text-[10px] font-semibold tracking-wider text-text-muted uppercase">
                  {group.section}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);

                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors group",
                          isActive
                            ? "bg-primary-light text-primary font-semibold"
                            : "text-text-secondary hover:text-text hover:bg-surface-subtle"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "transition-colors",
                              isActive ? "text-primary" : "text-text-muted group-hover:text-text"
                            )}
                          >
                            {item.icon}
                          </span>
                          <span>{item.name}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.2 rounded font-mono font-medium",
                              item.badgeVariant === "primary"
                                ? "bg-primary text-white"
                                : item.badgeVariant === "success"
                                ? "bg-success-light text-success"
                                : item.badgeVariant === "warning"
                                ? "bg-warning-light text-warning-text"
                                : "bg-surface-muted text-text-secondary"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Footer System Status */}
      <div className="p-3 border-t border-border bg-surface-subtle/50 text-xs">
        <div className="p-2.5 rounded-md bg-surface border border-border shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-secondary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Flagsmith Engine
            </span>
            <span className="font-mono text-text font-medium">Connected</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-secondary flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary" /> Gemini 2.5 Flash
            </span>
            <span className="font-mono text-primary font-medium">Ready</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

