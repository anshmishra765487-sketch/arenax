"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  generateDoubleElimination,
  generateRoundRobin,
  generateSingleElimination,
  type BracketMatch,
} from "@arenax/core";

import { createClient } from "@/lib/supabase/server";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function done(path: string, message: string): never {
  revalidatePath(path);
  redirect(`${path}?msg=${encodeURIComponent(message)}`);
}

function isoOrNull(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  if (!email) fail("/login", "Enter your organizer email.");
  if (!password) fail("/login", "Enter your password.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("/login", "Enter a valid email address.");

  // Clear any stale/corrupt session before signing in fresh.
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore — sign-in will create a fresh session anyway
  }

  let signInError: { message?: string; code?: string } | null = null;
  try {
    const result = await supabase.auth.signInWithPassword({ email, password });
    signInError = result.error;
  } catch {
    // Network / fetch failure (Supabase unreachable or URL not configured).
    signInError = {
      message:
        "Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and your internet connection.",
      code: "network_error",
    };
  }

  if (signInError) {
    const rawMessage = signInError.message || "Sign in failed. Please try again.";
    const code = signInError.code ?? "";
    const isNetworkError = !code || /fetch failed|failed to fetch|network/i.test(rawMessage);
    const friendly = isNetworkError
      ? "Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and your internet connection."
      : code === "validation_failed"
        ? "Auth session validation failed. Please try again in a minute — if it repeats, sign out and retry."
        : rawMessage;
    redirect(
      `/login?error=${encodeURIComponent(friendly)}&code=${encodeURIComponent(isNetworkError ? "network_error" : code || "unknown")}`,
    );
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createClient();

  if (!email) fail("/login", "Enter your organizer email first.");

  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) fail("/login", error.message);

  redirect("/login?msg=" + encodeURIComponent("Reset link sent. Check your inbox."));
}

/* -------------------------------------------------------------------------- */
/* Tournaments                                                                */
/* -------------------------------------------------------------------------- */

export async function createTournamentAction(formData: FormData) {
  const { supabase, user } = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const gameId = String(formData.get("game_id") ?? "").trim();
  const mode = String(formData.get("mode") ?? "squad");
  const format = String(formData.get("format") ?? "battle_royale");
  const slotsTotal = Number(formData.get("slots_total") ?? 8);
  const startTime = isoOrNull(formData.get("start_time"));
  const endTime = isoOrNull(formData.get("end_time"));
  const map = String(formData.get("map") ?? "").trim() || null;
  const prizeInfo = String(formData.get("prize_info") ?? "").trim() || null;
  const rules = String(formData.get("rules") ?? "").trim() || null;

  if (title.length < 3) fail("/tournaments", "Title needs at least 3 characters.");
  if (!gameId) fail("/tournaments", "Pick a game.");
  if (!startTime || !endTime) fail("/tournaments", "Start and end times are required.");
  if (new Date(endTime) <= new Date(startTime)) fail("/tournaments", "End time must be after start.");
  if (!Number.isInteger(slotsTotal) || slotsTotal < 1 || slotsTotal > 256) {
    fail("/tournaments", "Slots must be between 1 and 256.");
  }

  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      organizer_id: user.id,
      game_id: gameId,
      title,
      mode,
      format,
      slots_total: slotsTotal,
      slots_left: slotsTotal,
      start_time: startTime,
      end_time: endTime,
      map,
      prize_info: prizeInfo,
      rules,
      status: "upcoming",
    })
    .select("id")
    .single();

  if (error || !data) fail("/tournaments", error?.message ?? "Could not create tournament.");
  revalidatePath("/tournaments");
  redirect(`/tournaments/${data.id}?msg=${encodeURIComponent("Tournament created.")}`);
}

export async function setTournamentStatusAction(formData: FormData) {
  const { supabase } = await requireUser();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["upcoming", "live", "completed", "cancelled"].includes(status)) {
    fail(`/tournaments/${tournamentId}`, "Invalid status.");
  }

  const { error } = await supabase.from("tournaments").update({ status }).eq("id", tournamentId);
  if (error) fail(`/tournaments/${tournamentId}`, error.message);

  done(`/tournaments/${tournamentId}`, `Status set to ${status}.`);
}

export async function publishRoomAction(formData: FormData) {
  const { supabase } = await requireUser();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const roomId = String(formData.get("room_id") ?? "").trim();
  const roomPassword = String(formData.get("room_password") ?? "").trim();

  if (roomId.length < 2) fail(`/tournaments/${tournamentId}`, "Room ID looks too short.");

  const { error } = await supabase
    .from("room_details")
    .upsert(
      { tournament_id: tournamentId, room_id: roomId, room_password: roomPassword },
      { onConflict: "tournament_id" },
    );

  if (error) fail(`/tournaments/${tournamentId}`, error.message);

  done(
    `/tournaments/${tournamentId}`,
    "Room saved. Players see it automatically 10 minutes before start (server clock).",
  );
}

export async function generateBracketAction(formData: FormData) {
  const { supabase } = await requireUser();
  const tournamentId = String(formData.get("tournament_id") ?? "");

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, format")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentError || !tournament) fail(`/tournaments/${tournamentId}`, "Tournament not found.");

  const { data: registrations } = await supabase
    .from("registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  const ids = (registrations ?? []).map((row) => row.id as string);
  if (ids.length < 2) fail(`/tournaments/${tournamentId}`, "Need at least 2 confirmed players.");

  const format = (tournament as { format: string }).format;

  let matches: BracketMatch[] = [];
  if (format === "double_elim") {
    matches = generateDoubleElimination(ids);
  } else if (format === "single_elim") {
    matches = generateSingleElimination(ids);
  } else if (format === "round_robin") {
    matches = generateRoundRobin(ids).map((fixture, index) => ({
      id: `RR-${fixture.round}-${index + 1}`,
      round: fixture.round,
      position: index + 1,
      bracket: "round_robin" as const,
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      nextMatchId: null,
      nextSlot: null,
      loserGoesTo: null,
      status: "ready" as const,
    }));
  } else {
    fail(
      `/tournaments/${tournamentId}`,
      "Battle royale uses results (placement + kills), not a bracket. Publish the result below instead.",
    );
  }

  // Replace any previous bracket for this tournament.
  await supabase.from("matches").delete().eq("tournament_id", tournamentId);
  await supabase.from("tournament_rounds").delete().eq("tournament_id", tournamentId);

  const maxWinners = Math.max(...matches.filter((m) => m.bracket === "winners").map((m) => m.round), 0);
  const maxLosers = Math.max(...matches.filter((m) => m.bracket === "losers").map((m) => m.round), 0);

  const roundKey = (match: BracketMatch): number => {
    if (match.bracket === "winners" || match.bracket === "round_robin") return match.round;
    if (match.bracket === "losers") return maxWinners + match.round;
    return maxWinners + maxLosers + match.round;
  };

  const roundIds = new Map<number, string>();
  const matchIds = new Map<string, string>();

  for (const match of matches) matchIds.set(match.id, randomUUID());
  for (const match of matches) {
    const key = roundKey(match);
    if (!roundIds.has(key)) roundIds.set(key, randomUUID());
  }

  const roundRows = [...roundIds.entries()].map(([roundNumber, id]) => ({
    id,
    tournament_id: tournamentId,
    round_number: roundNumber,
    name: `Round ${roundNumber}`,
    format,
    status: "pending",
  }));

  const { error: roundError } = await supabase.from("tournament_rounds").insert(roundRows);
  if (roundError) fail(`/tournaments/${tournamentId}`, roundError.message);

  const matchRows = matches.map((match) => ({
    id: matchIds.get(match.id)!,
    tournament_id: tournamentId,
    round_id: roundIds.get(roundKey(match))!,
    match_number: match.position,
    bracket: match.bracket,
    home_registration_id: match.homeId,
    away_registration_id: match.awayId,
    next_match_id: match.nextMatchId ? matchIds.get(match.nextMatchId) ?? null : null,
    next_slot: match.nextSlot,
    loser_goes_to: match.loserGoesTo ? matchIds.get(match.loserGoesTo) ?? null : null,
    status: match.status === "bye" ? "bye" : match.status === "ready" ? "ready" : "pending",
  }));

  const { error: matchError } = await supabase.from("matches").insert(matchRows);
  if (matchError) fail(`/tournaments/${tournamentId}`, matchError.message);

  await supabase
    .from("tournaments")
    .update({ bracket_generated_at: new Date().toISOString() })
    .eq("id", tournamentId);

  done(`/tournaments/${tournamentId}`, `Bracket generated with ${matches.length} matches.`);
}

export async function advanceMatchAction(formData: FormData) {
  const { supabase } = await requireUser();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  const winnerId = String(formData.get("winner_registration_id") ?? "");
  const homeScore = formData.get("home_score") ? Number(formData.get("home_score")) : null;
  const awayScore = formData.get("away_score") ? Number(formData.get("away_score")) : null;

  const { data, error } = await supabase.rpc("advance_bracket", {
    p_match_id: matchId,
    p_winner_registration_id: winnerId,
    p_home_score: homeScore,
    p_away_score: awayScore,
  });

  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (error || !result.ok) {
    fail(`/tournaments/${tournamentId}`, result.error ?? error?.message ?? "Could not advance bracket.");
  }

  done(`/tournaments/${tournamentId}`, "Match completed and bracket advanced.");
}

export async function publishBrResultAction(formData: FormData) {
  const { supabase } = await requireUser();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const rows = String(formData.get("entries") ?? "").trim();

  if (!rows) fail(`/tournaments/${tournamentId}`, "Paste at least one result line.");

  const entries: Array<{ registration_id: string; placement: number; kills: number }> = [];

  for (const line of rows.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [registrationId, placement, kills] = trimmed.split(/[,\t]/).map((part) => part.trim());
    if (!registrationId || !placement) {
      fail(`/tournaments/${tournamentId}`, `Bad line: "${trimmed}". Use registration_id,placement,kills`);
    }
    entries.push({
      registration_id: registrationId,
      placement: Number(placement) || 999,
      kills: Math.max(0, Number(kills) || 0),
    });
  }

  const { data, error } = await supabase.rpc("publish_br_result", {
    p_tournament_id: tournamentId,
    p_entries: entries,
  });

  const result = (data ?? {}) as { ok?: boolean; error?: string; entries?: number };
  if (error || !result.ok) {
    fail(`/tournaments/${tournamentId}`, result.error ?? error?.message ?? "Could not publish result.");
  }

  done(`/tournaments/${tournamentId}`, `Published ${result.entries ?? entries.length} placements and updated leaderboards.`);
}

export async function reviewResultAction(formData: FormData) {
  const { supabase } = await requireUser();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const submissionId = String(formData.get("submission_id") ?? "");
  const approve = String(formData.get("decision") ?? "approve") === "approve";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const { data, error } = await supabase.rpc("review_result", {
    p_submission_id: submissionId,
    p_approve: approve,
    p_notes: notes,
  });

  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (error || !result.ok) {
    fail(`/tournaments/${tournamentId}`, result.error ?? error?.message ?? "Could not review.");
  }

  done(`/tournaments/${tournamentId}`, approve ? "Result approved." : "Result rejected.");
}

export async function postAnnouncementAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (body.length < 3) fail(`/tournaments/${tournamentId}`, "Announcement is too short.");

  const { error } = await supabase.from("announcements").insert({
    tournament_id: tournamentId,
    author_id: user.id,
    body,
  });

  if (error) fail(`/tournaments/${tournamentId}`, error.message);

  done(`/tournaments/${tournamentId}`, "Announcement posted.");
}

/* -------------------------------------------------------------------------- */
/* Moderation (admin only â€” the RPCs re-check is_admin())                     */
/* -------------------------------------------------------------------------- */

export async function banUserAction(formData: FormData) {
  const { supabase } = await requireUser();
  const userId = String(formData.get("user_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const days = String(formData.get("days") ?? "").trim();
  const permanent = String(formData.get("permanent") ?? "") === "on";

  const { data, error } = await supabase.rpc("ban_user", {
    p_user_id: userId,
    p_reason: reason || "Terms violation",
    p_days: permanent || !days ? null : Number(days),
  });

  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (error || !result.ok) {
    fail("/users", result.error ?? error?.message ?? "Could not ban user.");
  }

  done("/users", permanent || !days ? "User banned permanently." : `User suspended for ${days} days.`);
}

export async function unbanUserAction(formData: FormData) {
  const { supabase } = await requireUser();
  const userId = String(formData.get("user_id") ?? "");

  const { data, error } = await supabase.rpc("unban_user", { p_user_id: userId });
  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (error || !result.ok) fail("/users", result.error ?? error?.message ?? "Could not unban.");

  done("/users", "User restored.");
}

export async function issueStrikeAction(formData: FormData) {
  const { supabase } = await requireUser();
  const userId = String(formData.get("user_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const severity = Number(formData.get("severity") ?? 1);

  if (!reason) fail("/users", "Add a strike reason.");

  const { data, error } = await supabase.rpc("issue_strike", {
    p_player_id: userId,
    p_reason: reason,
    p_severity: severity,
    p_days: null,
  });

  const result = (data ?? {}) as { ok?: boolean; error?: string; active_strikes?: number };
  if (error || !result.ok) fail("/users", result.error ?? error?.message ?? "Could not issue strike.");

  done("/users", `Strike issued. Active strikes: ${result.active_strikes ?? 1}.`);
}

export async function approveOrganizerAction(formData: FormData) {
  const { supabase } = await requireUser();
  const userId = String(formData.get("user_id") ?? "");

  const { data, error } = await supabase.rpc("approve_organizer", { p_user_id: userId });
  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (error || !result.ok) fail("/users", result.error ?? error?.message ?? "Could not approve.");

  done("/users", "Organizer approved.");
}

export async function resolveDisputeAction(formData: FormData) {
  const { supabase } = await requireUser();
  const disputeId = String(formData.get("dispute_id") ?? "");
  const status = String(formData.get("status") ?? "resolved");
  const resolution = String(formData.get("resolution") ?? "").trim();

  if (resolution.length < 5) fail("/moderation", "Add a short resolution note.");

  const { data, error } = await supabase.rpc("resolve_dispute", {
    p_dispute_id: disputeId,
    p_status: status,
    p_resolution: resolution,
  });

  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (error || !result.ok) fail("/moderation", result.error ?? error?.message ?? "Could not resolve.");

  done("/moderation", "Dispute updated and the reporter notified.");
}

export async function resolveReportAction(formData: FormData) {
  const { supabase } = await requireUser();
  const reportId = String(formData.get("report_id") ?? "");
  const status = String(formData.get("status") ?? "resolved");

  const { data, error } = await supabase.rpc("resolve_report", {
    p_report_id: reportId,
    p_status: status,
  });

  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (error || !result.ok) fail("/moderation", result.error ?? error?.message ?? "Could not update report.");

  done("/moderation", `Report marked ${status}.`);
}

/* -------------------------------------------------------------------------- */
/* Sponsors                                                                   */
/* -------------------------------------------------------------------------- */

export async function createSponsorAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const websiteUrl = String(formData.get("website_url") ?? "").trim() || null;
  const logoUrl = String(formData.get("logo_url") ?? "").trim() || null;
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;

  if (name.length < 2) fail("/sponsors", "Sponsor name is too short.");

  const { error } = await supabase.from("sponsors").insert({
    name,
    description,
    website_url: websiteUrl,
    logo_url: logoUrl,
    contact_email: contactEmail,
    created_by: user.id,
    active: true,
  });

  if (error) fail("/sponsors", error.message);

  done("/sponsors", "Sponsor added.");
}

export async function linkSponsorAction(formData: FormData) {
  const { supabase } = await requireUser();
  const sponsorId = String(formData.get("sponsor_id") ?? "");
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const bannerUrl = String(formData.get("banner_url") ?? "").trim() || null;
  const note = String(formData.get("contribution_note") ?? "").trim() || null;

  if (!sponsorId || !tournamentId) fail("/sponsors", "Pick a sponsor and a tournament.");

  const { error } = await supabase
    .from("sponsor_tournaments")
    .upsert(
      {
        sponsor_id: sponsorId,
        tournament_id: tournamentId,
        banner_url: bannerUrl,
        contribution_note: note,
      },
      { onConflict: "sponsor_id,tournament_id" },
    );

  if (error) fail("/sponsors", error.message);

  done("/sponsors", "Sponsor linked to tournament.");
}
