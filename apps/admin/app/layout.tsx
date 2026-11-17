import type { Metadata } from "next";
import React from "react";

import ARENA_CONFIG from "@arenax/config";

import "./globals.css";

export const metadata: Metadata = {
  title: `${ARENA_CONFIG.appName} · Organizer console`,
  description: "Run free-entry esports tournaments: brackets, rooms, results and moderation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
