"use client";

import React from "react";
import { X, Bell, Check, Sparkles, Flag, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: "ai_insight" | "flag_update" | "rollout_pending" | "system";
}

export interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllAsRead?: () => void;
  onItemClick?: (item: NotificationItem) => void;
}

export function NotificationPanel({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onItemClick,
}: NotificationPanelProps) {
  if (!isOpen) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case "ai_insight":
        return <Sparkles className="w-4 h-4 text-primary" />;
      case "flag_update":
        return <Flag className="w-4 h-4 text-primary" />;
      case "rollout_pending":
        return <ShieldCheck className="w-4 h-4 text-warning" />;
      default:
        return <Bell className="w-4 h-4 text-text-secondary" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-text/20 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-sm bg-surface border-l border-border shadow-lg flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-text">Notifications</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary-light text-primary font-mono font-medium">
                {notifications.filter((n) => !n.read).length} new
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onMarkAllAsRead && (
                <button
                  onClick={onMarkAllAsRead}
                  className="text-xs text-text-secondary hover:text-primary transition-colors flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                className="text-text-muted hover:text-text transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-secondary">
                No notifications to display.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onItemClick?.(item)}
                  className={cn(
                    "p-4 hover:bg-surface-subtle transition-colors cursor-pointer flex items-start gap-3",
                    !item.read && "bg-primary-light/10"
                  )}
                >
                  <div className="w-8 h-8 rounded-md bg-surface-subtle border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                    {getIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-text truncate">{item.title}</h4>
                      <span className="text-[10px] text-text-secondary font-mono">
                        {item.timestamp}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                  {!item.read && (
                    <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

