"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent, customCreds?: { email: string; pass: string }) => {
    if (e) e.preventDefault();
    setError(null);
    setIsLoading(true);

    const loginEmail = customCreds ? customCreds.email : email;
    const loginPass = customCreds ? customCreds.pass : password;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Login failed");
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-white shadow-md">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Sign in to PulsePilot AI</h1>
          <p className="text-xs text-text-secondary">
            Autonomous experimentation & feature-flag co-pilot powered by Flagsmith.
          </p>
        </div>

        {/* Login Form Card */}
        <div className="p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={(e) => handleLogin(e)} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-text block mb-1">Work Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-subtle border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-text">Password</label>
                <span className="text-[11px] text-text-muted hover:underline cursor-pointer">
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-subtle border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
            >
              {isLoading ? "Signing in..." : "Sign In to Workspace"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Quick 1-Click Demo Accounts for Judges & QA */}
          <div className="pt-4 border-t border-border space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block text-center">
              Quick 1-Click Demo Accounts (Judges & QA)
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  handleLogin(undefined, {
                    email: "sarah@pulsepilot.ai",
                    pass: "pulsepilot2026",
                  })
                }
                className="p-2.5 rounded-lg border border-border bg-surface-subtle hover:bg-violet-50 hover:border-violet-300 text-left transition-colors"
              >
                <div className="flex items-center gap-1.5 font-bold text-text">
                  <UserCheck className="w-3.5 h-3.5 text-primary" /> Sarah Lin
                </div>
                <span className="text-[10px] text-text-secondary block mt-0.5">Product Lead (Admin)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleLogin(undefined, {
                    email: "alex@pulsepilot.ai",
                    pass: "pulsepilot2026",
                  })
                }
                className="p-2.5 rounded-lg border border-border bg-surface-subtle hover:bg-emerald-50 hover:border-emerald-300 text-left transition-colors"
              >
                <div className="flex items-center gap-1.5 font-bold text-text">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" /> Alex Rivera
                </div>
                <span className="text-[10px] text-text-secondary block mt-0.5">Growth Eng (Editor)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Link */}
        <div className="text-center text-xs text-text-secondary">
          Don't have an account?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Create an organization workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
