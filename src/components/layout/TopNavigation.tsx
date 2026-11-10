"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Bell,
  HelpCircle,
  Menu,
  ChevronRight,
  User,
  ShieldCheck,
  ExternalLink,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CommandPalette } from "../ui/CommandPalette";
import { NotificationPanel, NotificationItem } from "../ui/NotificationPanel";

const initialNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Winner Detected (+18.4% Uplift)",
    message: "Statistical significance reached on 'exp_checkout_social_proof'. 97.2% confidence.",
    timestamp: "10m ago",
    read: false,
    type: "ai_insight",
  },
  {
    id: "notif-2",
    title: "Flagsmith Sync Complete",
    message: "Multivariate splits active across 3 variants in Production environment.",
    timestamp: "45m ago",
    read: false,
    type: "flag_update",
  },
  {
    id: "notif-3",
    title: "Rollout Approval Required",
    message: "Gemini Rollout Strategist proposed 100% rollout for Variant B. HITL authorization required.",
    timestamp: "2h ago",
    read: true,
    type: "rollout_pending",
  },
];

export function TopNavigation({
  onMobileMenuToggle,
}: {
  onMobileMenuToggle?: () => void;
}) {
  const pathname = usePathname();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);

  const router = useRouter();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    name: "Sarah Lin",
    email: "sarah@pulsepilot.ai",
    role: "Product Lead (Admin)",
    initials: "SL",
  });

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      // ignore
    }
    router.push("/login");
  };
  const pathSegments = pathname.split("/").filter(Boolean);
  const breadcrumbs = [
    { label: "PulsePilot", href: "/" },
    ...pathSegments.map((segment, idx) => {
      const href = "/" + pathSegments.slice(0, idx + 1).join("/");
      const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
      return { label, href };
    }),
  ];

  return (
    <>
      <header className="h-16 px-4 sm:px-6 border-b border-border bg-surface flex items-center justify-between sticky top-0 z-20 shadow-xs">
        {/* Left: Mobile Toggle & Breadcrumbs */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuToggle}
            className="p-1.5 rounded-md hover:bg-surface-subtle lg:hidden text-text-secondary"
            aria-label="Toggle Mobile Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <nav className="hidden sm:flex items-center gap-1.5 text-xs">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.href}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                {idx === breadcrumbs.length - 1 ? (
                  <span className="font-semibold text-text">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-text-secondary hover:text-text transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Right: Actions, Search, Notifications, Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Global Search / Command Palette Trigger */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-subtle border border-border text-xs text-text-secondary hover:border-primary/40 transition-colors shadow-xs"
          >
            <Search className="w-3.5 h-3.5 text-text-muted" />
            <span className="hidden md:inline">Quick search or command...</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[10px] font-mono rounded bg-surface border border-border text-text-secondary">
              ⌘K
            </kbd>
          </button>

          {/* Notifications Bell */}
          <button
            onClick={() => setNotificationPanelOpen(true)}
            className="relative p-2 rounded-md text-text-secondary hover:text-text hover:bg-surface-subtle transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {notifications.some((n) => !n.read) && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            )}
          </button>

          {/* Documentation Link */}
          <Link
            href="/docs/PRD.md"
            target="_blank"
            className="hidden sm:flex items-center gap-1 p-2 rounded-md text-text-secondary hover:text-text hover:bg-surface-subtle transition-colors text-xs"
            title="System Documentation"
          >
            <HelpCircle className="w-4 h-4" />
          </Link>

          <div className="h-5 w-px bg-border mx-1 hidden sm:block" />

          {/* User Profile with Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 pl-1 p-1 rounded-md hover:bg-surface-subtle transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primary-light text-primary font-semibold text-xs flex items-center justify-center border border-primary/20">
                {currentUser.initials}
              </div>
              <div className="hidden lg:block text-left">
                <span className="block text-xs font-semibold text-text leading-tight">
                  {currentUser.name}
                </span>
                <span className="block text-[10px] text-text-secondary leading-tight">
                  {currentUser.role}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-text-muted hidden lg:block" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg bg-surface border border-border shadow-lg p-2 z-50 animate-in fade-in zoom-in-95 text-xs">
                <div className="p-2 border-b border-border">
                  <span className="font-bold text-text block">{currentUser.name}</span>
                  <span className="text-[11px] text-text-muted block">{currentUser.email}</span>
                </div>
                <div className="py-1">
                  <Link
                    href="/settings"
                    onClick={() => setUserDropdownOpen(false)}
                    className="w-full text-left p-2 rounded hover:bg-surface-subtle flex items-center gap-2 text-text transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-text-secondary" /> Account Settings
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setUserDropdownOpen(false)}
                    className="w-full text-left p-2 rounded hover:bg-surface-subtle flex items-center gap-2 text-text transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-text-secondary" /> Switch Account
                  </Link>
                </div>
                <div className="pt-1 border-t border-border">
                  <button
                    onClick={handleLogout}
                    className="w-full text-left p-2 rounded hover:bg-red-50 text-danger flex items-center gap-2 font-semibold transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* Slide-over Notifications */}
      <NotificationPanel
        isOpen={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={() => {
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
      />
    </>
  );
}

