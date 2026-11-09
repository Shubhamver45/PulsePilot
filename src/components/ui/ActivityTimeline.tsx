import React from "react";
import {
  ShieldCheck,
  Flag,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  User,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  action: string;
  actor: {
    name: string;
    type: "human" | "agent" | "system";
  };
  details: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ActivityTimelineProps {
  activities: ActivityItem[];
  className?: string;
}

export function ActivityTimeline({ activities, className }: ActivityTimelineProps) {
  const getIcon = (action: string, actorType: string) => {
    if (actorType === "agent") {
      return <Sparkles className="w-3.5 h-3.5 text-primary" />;
    }
    if (action.includes("ROLLOUT") || action.includes("APPROVED")) {
      return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
    }
    if (action.includes("FLAG") || action.includes("FLAGSMITH")) {
      return <Flag className="w-3.5 h-3.5 text-primary" />;
    }
    if (action.includes("KILL_SWITCH") || action.includes("WARNING")) {
      return <AlertTriangle className="w-3.5 h-3.5 text-danger" />;
    }
    return <User className="w-3.5 h-3.5 text-text-secondary" />;
  };

  return (
    <div className={cn("flow-root", className)}>
      <ul className="-mb-8">
        {activities.map((activity, activityIdx) => (
          <li key={activity.id}>
            <div className="relative pb-8">
              {activityIdx !== activities.length - 1 ? (
                <span
                  className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-border"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex space-x-3">
                <div>
                  <span
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-surface",
                      activity.actor.type === "agent"
                        ? "bg-primary-light"
                        : activity.action.includes("ROLLOUT")
                        ? "bg-success-light"
                        : "bg-surface-subtle border border-border"
                    )}
                  >
                    {getIcon(activity.action, activity.actor.type)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text">
                        {activity.actor.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono text-text-secondary bg-surface-muted border border-border">
                        {activity.actor.type.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">{activity.details}</p>
                    {activity.metadata && (
                      <pre className="mt-1.5 p-2 rounded bg-surface-subtle border border-border-subtle font-mono text-[11px] text-text-secondary overflow-x-auto">
                        {JSON.stringify(activity.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-right text-xs text-text-secondary font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-text-muted" />
                    <time dateTime={activity.timestamp}>{activity.timestamp}</time>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

