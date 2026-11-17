import Link from "next/link";
import React from "react";

import { createClient } from "@/lib/supabase/server";
import { formatDateTime, statusClass } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Stats {
  users: number;
  banned_users: number;
  organizers: number;
  tournaments: number;
  live_tournaments: number;
  registrations: number;
  open_reports: number;
  open_disputes: number;
  pending_results: number;
  active_vip: number;
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="card">
      <p className="text-[11px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: statsData, error: statsError } = await supabase.rpc("admin_dashboard_stats");
  const stats = (statsData ?? null) as Stats | null;

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, title, game_id, status, start_time, slots_left, slots_total")
    .order("start_time", { ascending: false })
    .limit(8);

  let fallback = { tournaments: tournaments?.length ?? 0, live: 0, registrations: 0 };
  if (statsError && tournaments?.length) {
    fallback.live = tournaments.filter((row) => row.status === "live").length;
    const ids = tournaments.map((row) => row.id);
    const { count } = await supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .in("tournament_id", ids)
      .eq("status", "confirmed");
    fallback.registrations = count ?? 0;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Free-entry operations at a glance. All counts come from server-side RPCs.
        </p>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Players" value={stats.users} hint={`${stats.organizers} organizers`} />
          <Stat
            label="Tournaments"
            value={stats.tournaments}
            hint={`${stats.live_tournaments} live now`}
          />
          <Stat label="Confirmed slots" value={stats.registrations} />
          <Stat
            label="Needs review"
            value={stats.open_reports + stats.open_disputes + stats.pending_results}
            hint={`${stats.pending_results} results · ${stats.open_disputes} disputes · ${stats.open_reports} reports`}
          />
          <Stat label="VIP subscribers" value={stats.active_vip} hint="Cosmetic only" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Your tournaments" value={fallback.tournaments} />
          <Stat label="Live now" value={fallback.live} />
          <Stat label="Confirmed slots" value={fallback.registrations} />
          <p className="text-xs text-slate-500 sm:col-span-3">
            Full platform stats need an admin account (the RPC returns nothing for player roles).
          </p>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Recent tournaments
          </h2>
          <Link href="/tournaments" className="text-xs font-semibold text-brand-300">
            View all →
          </Link>
        </div>

        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Status</th>
                <th>Starts (UTC)</th>
                <th>Slots</th>
              </tr>
            </thead>
            <tbody>
              {(tournaments ?? []).map((tournament) => (
                <tr key={tournament.id}>
                  <td>
                    <Link
                      href={`/tournaments/${tournament.id}`}
                      className="font-semibold text-white hover:text-brand-300"
                    >
                      {tournament.title}
                    </Link>
                    <span className="ml-2 text-[10px] uppercase text-slate-500">
                      {tournament.game_id}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${statusClass(tournament.status)}`}>
                      {tournament.status}
                    </span>
                  </td>
                  <td>{formatDateTime(tournament.start_time)}</td>
                  <td>
                    {tournament.slots_left} / {tournament.slots_total}
                  </td>
                </tr>
              ))}
              {(tournaments ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No tournaments yet. Create one from the Tournaments tab.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card">
          <h3 className="text-sm font-bold text-white">Room discipline</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Rooms are always revealed at start − 10 minutes by a database trigger. Publishing early
            is impossible, so you can share credentials safely.
          </p>
        </div>
        <div className="card">
          <h3 className="text-sm font-bold text-white">Free entry only</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Never collect entry fees or deposits. Prizes must be sponsor-funded. This keeps ArenaX
            outside real-money gaming rules.
          </p>
        </div>
        <div className="card">
          <h3 className="text-sm font-bold text-white">Evidence & disputes</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Screenshot hashes are compared per tournament. Duplicate evidence is auto-flagged and
            lowers the submitter&apos;s trust score.
          </p>
        </div>
      </section>
    </div>
  );
}
