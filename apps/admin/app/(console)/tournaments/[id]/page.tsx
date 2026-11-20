import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import {
  advanceMatchAction,
  generateBracketAction,
  postAnnouncementAction,
  publishBrResultAction,
  publishRoomAction,
  reviewResultAction,
  setTournamentStatusAction,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { DEMO_DETAILS } from "@/lib/demo";
import { demoSession } from "@/lib/demo-session";
import { formatDateTime, statusClass } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Registration {
  id: string;
  player_id: string;
  status: string;
  in_game_id: string;
  created_at: string;
}

interface MatchRow {
  id: string;
  match_number: number;
  bracket: string;
  home_registration_id: string | null;
  away_registration_id: string | null;
  home_score: number | null;
  away_score: number | null;
  winner_registration_id: string | null;
  status: string;
}

interface Submission {
  id: string;
  match_id: string | null;
  submitted_by: string;
  screenshot_url: string;
  claimed_winner: string | null;
  status: string;
  created_at: string;
}

export default async function TournamentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; msg?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const demo = await demoSession();

  interface TournamentRow {
    id: string;
    title: string;
    game_id: string;
    mode: string;
    format: string;
    status: string;
    start_time: string;
    slots_left: number;
    slots_total: number;
    bracket_generated_at: string | null;
  }

  let tournament: TournamentRow | null = null;
  let room: { room_id: string; room_password: string; revealed_at: string | null } | null = null;
  let registrations: Registration[] | null = null;
  let matches: MatchRow[] | null = null;
  let submissions: Submission[] | null = null;
  let disputes: Array<{
    id: string;
    opened_by: string;
    reason: string;
    status: string;
    created_at: string;
  }> | null = null;
  let announcements: Array<{ id: string; body: string; created_at: string }> | null = null;
  let streams: Array<{
    id: string;
    title: string;
    url: string;
    platform: string;
    is_live: boolean;
  }> | null = null;

  if (demo) {
    const detail = DEMO_DETAILS[id];
    if (!detail) notFound();

    tournament = detail.tournament;
    room = detail.room;
    registrations = detail.registrations;
    matches = detail.matches;
    submissions = detail.submissions;
    disputes = detail.disputes;
    announcements = detail.announcements;
    streams = detail.streams;
  } else {
    const supabase = await createClient();

    const { data } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
    tournament = data;

    if (!tournament) notFound();

    const [roomResult, registrationsResult, matchesResult, submissionsResult, disputesResult, announcementsResult, streamsResult] =
      await Promise.all([
        supabase.from("room_details").select("*").eq("tournament_id", id).maybeSingle(),
        supabase
          .from("registrations")
          .select("id, player_id, status, in_game_id, created_at")
          .eq("tournament_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("matches")
          .select(
            "id, match_number, bracket, home_registration_id, away_registration_id, home_score, away_score, winner_registration_id, status",
          )
          .eq("tournament_id", id)
          .order("bracket", { ascending: true })
          .order("match_number", { ascending: true }),
        supabase
          .from("result_submissions")
          .select("id, match_id, submitted_by, screenshot_url, claimed_winner, status, created_at")
          .eq("tournament_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("disputes")
          .select("id, opened_by, reason, status, created_at")
          .eq("tournament_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("announcements")
          .select("id, body, created_at")
          .eq("tournament_id", id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase.from("streams").select("id, title, url, platform, is_live").eq("tournament_id", id),
      ]);

    room = roomResult.data;
    registrations = registrationsResult.data;
    matches = matchesResult.data;
    submissions = submissionsResult.data;
    disputes = disputesResult.data;
    announcements = announcementsResult.data;
    streams = streamsResult.data;
  }

  if (!tournament) notFound();

  const regs = (registrations ?? []) as Registration[];
  const regMap = new Map(regs.map((registration) => [registration.id, registration]));
  const label = (id: string | null) => {
    if (!id) return "TBD";
    const registration = regMap.get(id);
    return registration ? registration.in_game_id : id.slice(0, 8);
  };

  const confirmed = regs.filter((registration) => registration.status === "confirmed");
  const base = `/tournaments/${id}`;
  const isBracketFormat = tournament.format !== "battle_royale";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/tournaments" className="text-xs font-semibold text-brand-300">
            ← All tournaments
          </Link>
          <h1 className="mt-2 text-2xl font-black text-white">{tournament.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {tournament.game_id} · {tournament.mode} · {tournament.format.replace("_", " ")} ·{" "}
            {formatDateTime(tournament.start_time)}
          </p>
        </div>
        <span className={`badge ${statusClass(tournament.status)}`}>{tournament.status}</span>
      </div>

      {query.error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {query.error}
        </p>
      ) : null}
      {query.msg ? (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
          {query.msg}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Rooms */}
        <section className="card">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Room</h2>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            Reveal time: {formatDateTime(room?.revealed_at ?? null)} (start − 10 min, set by the DB
            trigger).
          </p>

          <form action={publishRoomAction} className="mt-3 space-y-3">
            <input type="hidden" name="tournament_id" value={id} />
            <div>
              <label className="label" htmlFor="room_id">
                Room ID
              </label>
              <input
                id="room_id"
                name="room_id"
                required
                maxLength={64}
                defaultValue={room?.room_id ?? ""}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="room_password">
                Password
              </label>
              <input
                id="room_password"
                name="room_password"
                required
                maxLength={64}
                defaultValue={room?.room_password ?? ""}
                className="input"
              />
            </div>
            <button type="submit" className="btn w-full">
              Save room
            </button>
          </form>
        </section>

        {/* Status */}
        <section className="card">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Status</h2>
          <form action={setTournamentStatusAction} className="mt-3 space-y-3">
            <input type="hidden" name="tournament_id" value={id} />
            <select name="status" defaultValue={tournament.status} className="input">
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button type="submit" className="btn-outline w-full">
              Update status
            </button>
          </form>

          <div className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-5 text-slate-500">
            Slots: {tournament.slots_left} left / {tournament.slots_total}. Confirmed players:{" "}
            {confirmed.length}.
            {tournament.bracket_generated_at
              ? ` Bracket generated ${formatDateTime(tournament.bracket_generated_at)}.`
              : ""}
          </div>
        </section>

        {/* Announce */}
        <section className="card">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Announcement
          </h2>
          <form action={postAnnouncementAction} className="mt-3 space-y-3">
            <input type="hidden" name="tournament_id" value={id} />
            <textarea
              name="body"
              rows={3}
              required
              minLength={3}
              maxLength={1000}
              className="input"
              placeholder="Room opens at 8:45 PM. Be in the lobby 5 minutes early."
            />
            <button type="submit" className="btn w-full">
              Post to lobby
            </button>
          </form>
          <div className="mt-3 space-y-1 text-[11px] text-slate-500">
            {(announcements ?? []).slice(0, 3).map((announcement) => (
              <p key={announcement.id}>• {announcement.body}</p>
            ))}
          </div>
        </section>
      </div>

      {/* Registrations */}
      <section className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Registrations
          </h2>
          <span className="text-[11px] text-slate-500">{regs.length} rows</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Registration ID</th>
              <th>Player</th>
              <th>In-game ID</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {regs.map((registration) => (
              <tr key={registration.id}>
                <td className="font-mono text-[10px]">{registration.id}</td>
                <td className="font-mono text-[10px]">{registration.player_id.slice(0, 8)}</td>
                <td>{registration.in_game_id}</td>
                <td>
                  <span className={`badge ${statusClass(registration.status)}`}>
                    {registration.status}
                  </span>
                </td>
                <td>{formatDateTime(registration.created_at)}</td>
              </tr>
            ))}
            {regs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No registrations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {/* Bracket */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Bracket & matches
          </h2>
          {isBracketFormat ? (
            <form action={generateBracketAction}>
              <input type="hidden" name="tournament_id" value={id} />
              <button type="submit" className="btn px-3 py-1.5 text-xs">
                {matches?.length ? "Regenerate bracket" : "Generate bracket"}
              </button>
            </form>
          ) : null}
        </div>

        {!isBracketFormat ? (
          <p className="mt-3 text-xs text-slate-500">
            Battle royale tournaments are scored by placement and kills. Use the result form below.
          </p>
        ) : (matches ?? []).length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Generate a bracket once registrations close (or once enough players confirm).
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {(matches as MatchRow[]).map((match) => (
              <div
                key={match.id}
                className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">
                    {match.bracket.replace("_", " ")} · match {match.match_number}
                  </span>
                  <span className={`badge ${statusClass(match.status)}`}>{match.status}</span>
                </div>

                <div className="mt-2 grid gap-1 text-xs text-slate-300 sm:grid-cols-3">
                  <span>
                    Home: <strong>{label(match.home_registration_id)}</strong>
                    {match.home_score != null ? ` (${match.home_score})` : ""}
                  </span>
                  <span>
                    Away: <strong>{label(match.away_registration_id)}</strong>
                    {match.away_score != null ? ` (${match.away_score})` : ""}
                  </span>
                  <span className="text-slate-500">
                    Winner: {label(match.winner_registration_id)}
                  </span>
                </div>

                {match.status !== "completed" && match.status !== "bye" ? (
                  <form action={advanceMatchAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="tournament_id" value={id} />
                    <input type="hidden" name="match_id" value={match.id} />
                    <div>
                      <label className="label">Winner</label>
                      <select name="winner_registration_id" required className="input py-1.5 text-xs">
                        <option value="">Select…</option>
                        {[match.home_registration_id, match.away_registration_id]
                          .filter(Boolean)
                          .map((id) => (
                            <option key={id} value={id!}>
                              {label(id)}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="w-20">
                      <label className="label">Home score</label>
                      <input name="home_score" type="number" min={0} className="input py-1.5 text-xs" />
                    </div>
                    <div className="w-20">
                      <label className="label">Away score</label>
                      <input name="away_score" type="number" min={0} className="input py-1.5 text-xs" />
                    </div>
                    <button type="submit" className="btn px-3 py-1.5 text-xs">
                      Complete
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Result submissions */}
      <section className="card">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Result submissions
        </h2>
        <div className="mt-3 space-y-2">
          {(submissions as Submission[] | null)?.map((submission) => (
            <div key={submission.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  {formatDateTime(submission.created_at)} · match {submission.match_id?.slice(0, 8) ?? "—"}
                </span>
                <span className={`badge ${statusClass(submission.status)}`}>{submission.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Claimed winner: {label(submission.claimed_winner)} · submitter{" "}
                {submission.submitted_by.slice(0, 8)}
              </p>
              <Link
                href={submission.screenshot_url}
                target="_blank"
                className="mt-2 inline-block text-xs font-semibold text-brand-300"
              >
                Open screenshot →
              </Link>

              {submission.status === "pending" || submission.status === "flagged" ? (
                <form action={reviewResultAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="tournament_id" value={id} />
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input
                    name="notes"
                    placeholder="Review note (optional)"
                    className="input max-w-xs py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    name="decision"
                    value="approve"
                    className="btn px-3 py-1.5 text-xs"
                  >
                    Approve
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="reject"
                    className="btn-danger px-3 py-1.5 text-xs"
                  >
                    Reject
                  </button>
                </form>
              ) : null}
            </div>
          ))}
          {(submissions ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No result screenshots submitted yet.</p>
          ) : null}
        </div>
      </section>

      {/* BR results */}
      <section className="card">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Battle royale result
        </h2>
        <p className="mt-2 text-xs text-slate-500">
          One line per player: <code>registration_id,placement,kills</code>. Points use this
          tournament&apos;s placement table and kill points; leaderboards and XP update automatically.
        </p>

        <form action={publishBrResultAction} className="mt-3 space-y-3">
          <input type="hidden" name="tournament_id" value={id} />
          <textarea
            name="entries"
            rows={5}
            className="input font-mono text-xs"
            placeholder={`${confirmed[0]?.id ?? "registration_id"},1,7\n${confirmed[1]?.id ?? "registration_id"},2,3`}
          />
          <button type="submit" className="btn">
            Publish placements
          </button>
        </form>
      </section>

      {/* Disputes */}
      <section className="card">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Disputes</h2>
        <div className="mt-3 space-y-2">
          {(disputes ?? []).map((dispute) => (
            <div key={dispute.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {formatDateTime(dispute.created_at)}
                </span>
                <span className={`badge ${statusClass(dispute.status)}`}>{dispute.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-300">{dispute.reason}</p>
              <Link href="/moderation" className="mt-2 inline-block text-xs font-semibold text-brand-300">
                Resolve in moderation →
              </Link>
            </div>
          ))}
          {(disputes ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No disputes.</p>
          ) : null}
        </div>

        {(streams ?? []).length > 0 ? (
          <div className="mt-4 border-t border-slate-800 pt-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">Streams</p>
            {(streams ?? []).map((stream) => (
              <p key={stream.id} className="mt-1 text-xs text-slate-400">
                {stream.is_live ? "🔴 Live" : "•"} {stream.title} ({stream.platform})
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <p className="text-[11px] leading-5 text-slate-600">
        Free-entry policy: never collect entry fees, deposits or withdrawals through ArenaX. Prizes
        must be sponsor-funded and clearly described. Room credentials are revealed only by the
        server-side trigger.
      </p>
    </div>
  );
}
