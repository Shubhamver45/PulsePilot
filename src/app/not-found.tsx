import React from "react";
import Link from "next/link";
import { Compass, Home, ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-surface shadow-md space-y-6 text-center animate-in zoom-in-95">
        <div className="w-14 h-14 rounded-2xl bg-primary-light text-primary flex items-center justify-center mx-auto border border-primary/20">
          <Compass className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
            404 Error — Page Not Found
          </span>
          <h1 className="text-2xl font-bold text-text tracking-tight">Lost in the Experiment?</h1>
          <p className="text-xs text-text-secondary leading-relaxed">
            The page you are looking for does not exist or has been relocated to another workspace partition.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Return to Dashboard
          </Link>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-surface border border-border hover:bg-surface-subtle text-text font-semibold text-xs flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Overview
          </Link>
        </div>
      </div>
    </div>
  );
}

