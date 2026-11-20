import { supabase } from "./supabase";
import {
  DEMO_GAME_ACCOUNTS,
  DEMO_LEADERBOARD,
  DEMO_NOTIFICATIONS,
  DEMO_PROFILE,
  DEMO_REGISTRATIONS,
  DEMO_TOURNAMENTS,
  isDemoMode,
} from "./demo";
import type {
  AppNotification,
  GameAccount,
  LeaderboardEntry,
  Profile,
  Registration,
  RpcResult,
  Tournament,
} from "./types";

function fail(message: string): never {
  throw new Error(message);
}

export async function fetchTournaments(): Promise<Tournament[]> {
  if (isDemoMode()) return DEMO_TOURNAMENTS;

  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .order("start_time", { ascending: true });

  if (error) fail(error.message);
  return (data ?? []) as Tournament[];
}

export async function fetchTournamentById(id: string): Promise<Tournament | null> {
  if (isDemoMode()) {
    return DEMO_TOURNAMENTS.find((tournament) => tournament.id === id) ?? null;
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) fail(error.message);
  return (data as Tournament | null) ?? null;
}

export async function fetchMyRegistration(
  tournamentId: string,
  playerId: string,
): Promise<Registration | null> {
  if (isDemoMode()) {
    return (
      DEMO_REGISTRATIONS.find(
        (registration) => registration.tournament_id === tournamentId && registration.player_id === playerId,
      ) ?? null
    );
  }

  const { data, error } = await supabase
    .from("registrations")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) fail(error.message);
  return (data as Registration | null) ?? null;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (isDemoMode()) return DEMO_PROFILE;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) fail(error.message);
  return (data as Profile | null) ?? null;
}

export async function fetchGameAccounts(playerId: string): Promise<GameAccount[]> {
  if (isDemoMode()) return DEMO_GAME_ACCOUNTS;

  const { data, error } = await supabase
    .from("game_accounts")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });

  if (error) fail(error.message);
  return (data ?? []) as GameAccount[];
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  if (isDemoMode()) return DEMO_NOTIFICATIONS;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) fail(error.message);
  return (data ?? []) as AppNotification[];
}

export async function fetchLeaderboard(
  scope: string,
  tournamentId: string | null = null,
): Promise<LeaderboardEntry[]> {
  if (isDemoMode()) {
    const entries = DEMO_LEADERBOARD.filter((entry) => entry.scope === scope);
    if (tournamentId) {
      return entries.filter((entry) => entry.tournament_id === tournamentId);
    }
    return entries;
  }
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("*")
    .eq("scope", scope)
    .eq("tournament_id", tournamentId ?? "__none__")
    .order("points", { ascending: false });
  if (error) fail(error.message);
  return (data ?? []) as LeaderboardEntry[];
}


/**
 * Registers the caller through the server-side RPC (slot lock, time window,
 * duplicate check, verified in-game ID). Team id is optional (Phase 2 UI).
 */
export async function joinTournament(
  tournamentId: string,
  teamId: string | null = null,
): Promise<RpcResult> {
  if (isDemoMode()) {
    return { ok: true, error: null, registration_id: "demo-registration" };
  }

  const { data, error } = await supabase.rpc("join_tournament", {
    p_tournament_id: tournamentId,
    p_team_id: teamId,
  });

  if (error) return { ok: false, error: error.message };
  const result = (data ?? {}) as Partial<RpcResult>;
  return {
    ok: Boolean(result.ok),
    error: result.error ?? null,
    registration_id: result.registration_id,
  };
}

export async function cancelRegistration(tournamentId: string): Promise<RpcResult> {
  if (isDemoMode()) {
    return { ok: true, error: null, registration_id: "demo-registration" };
  }

  const { data, error } = await supabase.rpc("cancel_registration", {
    p_tournament_id: tournamentId,
  });

  if (error) return { ok: false, error: error.message };
  const result = (data ?? {}) as Partial<RpcResult>;
  return { ok: Boolean(result.ok), error: result.error ?? null };
}

export function humanizeRpcError(error: string | null | undefined): string {
  switch (error) {
    case "no_slots":
      return "All free slots are taken.";
    case "already_registered":
      return "You are already registered for this tournament.";
    case "missing_game_account":
      return "Add your in-game ID for this game in Profile first.";
    case "registration_closed":
      return "Registration has closed for this tournament.";
    case "tournament_not_open":
      return "This tournament is not open for registration.";
    case "not_authenticated":
      return "Please sign in again.";
    case "invalid_team":
      return "That team cannot be registered for this tournament.";
    case "not_registered":
      return "You do not have an active registration here.";
    default:
      return error ? error.replace(/_/g, " ") : "Something went wrong. Please try again.";
  }
}
