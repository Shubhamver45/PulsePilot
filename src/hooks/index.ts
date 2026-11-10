"use client";

import { useState, useEffect } from "react";

export interface FlagsmithFeatureState {
  enabled: boolean;
  value: any;
  loading: boolean;
}

export function useFlagsmithFlag(featureName: string): FlagsmithFeatureState {
  const [state, setState] = useState<FlagsmithFeatureState>({
    enabled: false,
    value: null,
    loading: true,
  });

  useEffect(() => {
    let isMounted = true;
    async function evaluate() {
      try {
        const res = await fetch(`/api/flagsmith/evaluate?feature=${encodeURIComponent(featureName)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setState({
              enabled: data.enabled ?? true,
              value: data.value ?? null,
              loading: false,
            });
          }
        } else {
          if (isMounted) setState((prev) => ({ ...prev, loading: false }));
        }
      } catch {
        if (isMounted) setState((prev) => ({ ...prev, loading: false }));
      }
    }
    evaluate();
    return () => {
      isMounted = false;
    };
  }, [featureName]);

  return state;
}

export function useTelemetry() {
  const trackEvent = async (eventName: string, properties?: Record<string, any>) => {
    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "CONVERSION",
          eventName,
          properties,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.warn("Telemetry tracking error:", e);
    }
  };

  return { trackEvent };
}
