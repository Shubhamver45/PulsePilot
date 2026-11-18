"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopNavigation } from "./TopNavigation";
import { X } from "lucide-react";

function isPublicRoute(pathname: string): boolean {
  return pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/auth/callback" ||
    pathname === "/demo-store" ||
    pathname === "/demo-results" ||
    pathname.startsWith("/demo-store/") ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = isPublicRoute(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row text-text">
      {!isPublicPage && <Sidebar className="hidden lg:flex" />}

      {!isPublicPage && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-text/30 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-surface">
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-text-secondary hover:text-text"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar className="w-full border-r-0" />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <TopNavigation onMobileMenuToggle={isPublicPage ? undefined : () => setMobileMenuOpen(true)} />
        <main className={isPublicPage ? "flex-1 w-full" : "flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto"}>
          {children}
        </main>
      </div>
    </div>
  );
}
