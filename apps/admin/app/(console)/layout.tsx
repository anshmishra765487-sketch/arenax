import Link from "next/link";
import { redirect } from "next/navigation";
import React from "react";

import ARENA_CONFIG from "@arenax/config";

import { signOutAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Overview", adminOnly: false },
  { href: "/tournaments", label: "Tournaments", adminOnly: false },
  { href: "/moderation", label: "Disputes & reports", adminOnly: true },
  { href: "/users", label: "Users", adminOnly: true },
  { href: "/sponsors", label: "Sponsors", adminOnly: true },
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role, is_banned")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile as { role?: string } | null)?.role ?? "player";
  const isAdmin = role === "admin";
  const canOrganize = isAdmin || role === "organizer";

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-black tracking-wide text-white">
              {ARENA_CONFIG.appName}
              <span className="ml-2 rounded bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-300">
                Console
              </span>
            </Link>

            <nav className="hidden items-center gap-4 md:flex">
              {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-xs font-semibold text-slate-400 transition hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500">
              @{(profile as { username?: string } | null)?.username ?? user.email}
              <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">
                {role}
              </span>
            </span>
            <form action={signOutAction}>
              <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav className="flex gap-3 overflow-x-auto border-t border-slate-800 px-4 py-2 md:hidden">
          {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap text-xs text-slate-400">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {!canOrganize ? (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            Your account is a player account. Ask an admin to approve you as an organizer before
            creating tournaments.
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
