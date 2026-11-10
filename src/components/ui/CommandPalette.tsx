"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  Flag,
  BarChart3,
  FlaskConical,
  Settings,
  ShieldCheck,
  Compass,
  ArrowRight,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const actions = [
    {
      id: "dashboard",
      title: "Go to Main Dashboard",
      category: "Navigation",
      icon: <Compass className="w-4 h-4 text-primary" />,
      action: () => router.push("/dashboard"),
    },
    {
      id: "overview",
      title: "Go to Overview",
      category: "Navigation",
      icon: <Compass className="w-4 h-4 text-primary" />,
      action: () => router.push("/"),
    },
    {
      id: "studio",
      title: "Open Experiment Studio (Create Experiment)",
      category: "Actions",
      icon: <FlaskConical className="w-4 h-4 text-primary" />,
      action: () => router.push("/studio"),
    },
    {
      id: "command-center",
      title: "AI Command Center",
      category: "Agents",
      icon: <Sparkles className="w-4 h-4 text-primary" />,
      action: () => router.push("/command-center"),
    },
    {
      id: "flags",
      title: "View Flagsmith Feature Flags",
      category: "Feature Flags",
      icon: <Flag className="w-4 h-4 text-primary" />,
      action: () => router.push("/flags"),
    },
    {
      id: "analytics",
      title: "Statistical Analytics & Lift",
      category: "Analytics",
      icon: <BarChart3 className="w-4 h-4 text-primary" />,
      action: () => router.push("/analytics"),
    },
    {
      id: "insights",
      title: "AI Growth Insights & Synthesis",
      category: "Agents",
      icon: <Sparkles className="w-4 h-4 text-primary" />,
      action: () => router.push("/insights"),
    },
    {
      id: "demo-store",
      title: "PulsePilot Demo Storefront (A/B Test)",
      category: "Storefront",
      icon: <Zap className="w-4 h-4 text-emerald-600" />,
      action: () => router.push("/demo-store"),
    },
    {
      id: "releases",
      title: "Release Center & Canary Gates",
      category: "Safe Rollouts",
      icon: <ShieldCheck className="w-4 h-4 text-success" />,
      action: () => router.push("/release-center"),
    },
    {
      id: "settings",
      title: "Project & Flagsmith API Settings",
      category: "Settings",
      icon: <Settings className="w-4 h-4 text-text-secondary" />,
      action: () => router.push("/settings"),
    },
  ];

  const filtered = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open handled externally or we can toggle
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-text/30 backdrop-blur-xs animate-in fade-in duration-100">
      <div
        className="w-full max-w-xl rounded-xl bg-surface border border-border shadow-lg overflow-hidden animate-in zoom-in-95 duration-100"
        role="dialog"
      >
        <div className="p-3.5 border-b border-border flex items-center gap-3">
          <Search className="w-4 h-4 text-text-muted ml-1" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search experiments..."
            className="w-full text-sm bg-transparent border-0 text-text placeholder-text-muted focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface-muted border border-border text-text-secondary">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-border-subtle">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-secondary">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  item.action();
                  onClose();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-md hover:bg-surface-subtle text-left transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-surface-subtle border border-border-subtle flex items-center justify-center flex-shrink-0 group-hover:border-primary/40">
                    {item.icon}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-text group-hover:text-primary transition-colors">
                      {item.title}
                    </span>
                    <span className="block text-[11px] text-text-secondary">{item.category}</span>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

