import Link from "next/link";
import React from "react";

import ARENA_CONFIG from "@arenax/config";

import { createTournamentAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { DEMO_TOURNAMENTS } from "@/lib/demo";
import { demoSession } from "@/lib/demo-session";
import { formatDateTime, statusClass } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string }>;
}) {
  const params = await searchParams;
  const demo = await demoSession();

  let tournaments: Array<{
    id: string;
    title: string;
    game_id: string;
    mode: string;
    format: string | null;
    status: string;
    start_time: string;
    slots_left: number;
    slots_total: number;
  }> | null = null;

  if (demo) {
    tournaments = DEMO_TOURNAMENTS;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tournaments")
      .select("id, title, game_id, mode, format, status, start_time, slots_left, slots_total")
      .order("start_time", { ascending: false })
      .limit(100);
    tournaments = data;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-white">Tournaments</h1>
          <p className="mt-1 text-sm text-slate-500">
            Free entry, sponsor-funded prizes, server-enforced timing.
          </p>
        </div>
        <p className="text-[11px] text-slate-500">
          {tournaments?.length ?? 0} tournament{tournaments?.length === 1 ? "" : "s"}
        </p>
      </div>

      {params.error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {params.error}
        </p>
      ) : null}
      {params.msg ? (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
          {params.msg}
        </p>
      ) : null}

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Game</th>
              <th>Format</th>
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
                  <span className="ml-2 text-[10px] uppercase text-slate-500">{tournament.mode}</span>
                </td>
                <td>{tournament.game_id}</td>
                <td>{(tournament.format ?? "battle_royale").replace("_", " ")}</td>
                <td>
                  <span className={`badge ${statusClass(tournament.status)}`}>{tournament.status}</span>
                </td>
                <td>{formatDateTime(tournament.start_time)}</td>
                <td>
                  {tournament.slots_left} / {tournament.slots_total}
                </td>
              </tr>
            ))}
            {(tournaments ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Nothing scheduled yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Create tournament
        </h2>

        <form action={createTournamentAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label" htmlFor="title">
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              minLength={3}
              maxLength={90}
              className="input"
              placeholder="Friday Night BGMI Open"
            />
          </div>

          <div>
            <label className="label" htmlFor="game_id">
              Game
            </label>
            <select id="game_id" name="game_id" className="input" required>
              {ARENA_CONFIG.games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="mode">
              Mode
            </label>
            <select id="mode" name="mode" className="input" defaultValue="squad">
              {ARENA_CONFIG.modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="format">
              Result format
            </label>
            <select id="format" name="format" className="input" defaultValue="battle_royale">
              <option value="battle_royale">Battle royale (placement + kills)</option>
              <option value="single_elim">Single elimination</option>
              <option value="double_elim">Double elimination</option>
              <option value="round_robin">Round robin</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="slots_total">
              Slots
            </label>
            <input
              id="slots_total"
              name="slots_total"
              type="number"
              min={1}
              max={256}
              defaultValue={16}
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="start_time">
              Starts
            </label>
            <input id="start_time" name="start_time" type="datetime-local" required className="input" />
          </div>

          <div>
            <label className="label" htmlFor="end_time">
              Ends
            </label>
            <input id="end_time" name="end_time" type="datetime-local" required className="input" />
          </div>

          <div>
            <label className="label" htmlFor="map">
              Map (optional)
            </label>
            <input id="map" name="map" maxLength={60} className="input" placeholder="Erangel" />
          </div>

          <div>
            <label className="label" htmlFor="prize_info">
              Sponsor-funded prize (optional)
            </label>
            <input
              id="prize_info"
              name="prize_info"
              maxLength={500}
              className="input"
              placeholder="₹5,000 prize pool funded by Acme Energy"
            />
          </div>

          <div className="md:col-span-2">
            <label className="label" htmlFor="rules">
              Rules (optional)
            </label>
            <textarea id="rules" name="rules" rows={3} maxLength={8000} className="input" />
          </div>

          <div className="md:col-span-2">
            <button type="submit" className="btn">
              Create tournament
            </button>
            <p className="mt-2 text-[11px] text-slate-500">
              Registration closes automatically 15 minutes before start. Rooms unlock 10 minutes
              before start. You cannot override either from the console.
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
