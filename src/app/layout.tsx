import type { Metadata } from "next";
import "@/styles/globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "PulsePilot AI — Autonomous Experimentation & Growth Platform",
  description:
    "Autonomous AI experimentation and product growth co-pilot powered by Flagsmith and Google Gemini.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-background text-text antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
