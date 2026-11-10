"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, RotateCcw, Home, Sparkles } from "lucide-react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled runtime error captured by PulsePilot error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-surface shadow-md space-y-6 text-center animate-in zoom-in-95">
        <div className="w-14 h-14 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mx-auto border border-danger/20">
          <AlertOctagon className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-text tracking-tight">Something Went Wrong</h1>
          <p className="text-xs text-text-secondary leading-relaxed">
            PulsePilot encountered an unexpected runtime exception. The error has been captured and
            isolated to prevent application-wide failure.
          </p>
          {error.digest && (
            <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-surface-subtle text-text-muted border border-border">
              Error Digest: {error.digest}
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try Again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-surface border border-border hover:bg-surface-subtle text-text font-semibold text-xs flex items-center gap-2 transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

