import type { Session, User } from "@supabase/supabase-js";

import type {
  AppNotification,
  GameAccount,
  LeaderboardEntry,
  Profile,
  Registration,
  RoomDetails,
  Tournament,
} from "./types";

/**
 * Demo mode for the mobile app (web preview / GitHub Pages deploy).
 *
 * When `EXPO_PUBLIC_DEMO_MODE=true` the app never touches Supabase for data:
 *   - the auth context starts a local demo session
 *   - API reads return realistic sample data
 *   - write paths are no-ops that succeed silently
 *
 * This makes the full player experience browsable without any backend.
 */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === "true";

export const DEMO_USER_ID = "bbbbbbb1-0000-4000-8000-000000000001";

export const DEMO_PROFILE = {
  id: DEMO_USER_ID,
  username: "ghostop",
  display_name: "Ghost OP",
  avatar_url: null,
  language: "en" as const,
  phone: "+919876543210",
  role: "player" as const,
  xp: 4210,
  level: 18,
  trust_score: 92,
  streak_days: 6,
  is_banned: false,
  referral_code: "ARENA1GHOST",
  referred_by: null,
  created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
};

export const DEMO_USER = {
  id: DEMO_USER_ID,
  email: "ghostop@arenax.demo",
  aud: "authenticated",
  role: "authenticated",
  email_confirmed_at: new Date().toISOString(),
  phone: "+919876543210",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_anonymous: false,
  app_metadata: { provider: "demo" },
  user_metadata: { demo: true },
} as unknown as User;

export const DEMO_SESSION = { ...({} as Session), user: DEMO_USER } as Session;

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

export const DEMO_TOURNAMENTS: Tournament[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    organizer_id: DEMO_USER_ID,
    game_id: "bgmi",
    title: "Friday Night BGMI Open",
    mode: "squad",
    status: "live",
    start_time: minutesFromNow(25),
    end_time: minutesFromNow(145),
    slots_total: 16,
    slots_left: 2,
    rules: "No emulators. No teaming. Room ID drops 10 minutes before start.",
    map: "Erangel",
    prize_info: "₹5,000 prize pool funded by Acme Energy",
    created_at: minutesFromNow(-60 * 24 * 3),
    updated_at: minutesFromNow(-60 * 24 * 2),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    organizer_id: "bbbbbbb3-0000-4000-8000-000000000003",
    game_id: "valorant",
    title: "Valorant Weekend Clash",
    mode: "squad",
    status: "upcoming",
    start_time: minutesFromNow(60 * 26),
    end_time: minutesFromNow(60 * 30),
    slots_total: 8,
    slots_left: 8,
    rules: "Best of one. Overtime enabled. Screenshot required after every map.",
    map: "Ascent",
    prize_info: "₹8,000 prize pool funded by Nova Peripherals",
    created_at: minutesFromNow(-60 * 24 * 5),
    updated_at: minutesFromNow(-60 * 24 * 5),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    organizer_id: "bbbbbbb3-0000-4000-8000-000000000003",
    game_id: "freefire",
    title: "Free Fire Solo Sprint",
    mode: "solo",
    status: "completed",
    start_time: minutesFromNow(-60 * 48),
    end_time: minutesFromNow(-60 * 47),
    slots_total: 48,
    slots_left: 0,
    rules: "Solo only. Placement plus 1 point per kill.",
    map: "Bermuda",
    prize_info: "₹2,000 prize pool funded by Acme Energy",
    created_at: minutesFromNow(-60 * 24 * 8),
    updated_at: minutesFromNow(-60 * 24 * 7),
  },
];

export const DEMO_REGISTRATIONS: Registration[] = [
  {
    id: "aaaaaaa1-0000-4000-8000-000000000001",
    tournament_id: DEMO_TOURNAMENTS[0].id,
    player_id: DEMO_USER_ID,
    team_id: null,
    status: "confirmed",
    in_game_id: "GhostOP",
    created_at: minutesFromNow(-1800),
  },
];

export const DEMO_ROOM: RoomDetails = {
  id: "11111111-1111-4111-8111-111111111111-room",
  tournament_id: DEMO_TOURNAMENTS[0].id,
  room_id: "8842190",
  room_password: "arenax",
  revealed_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  created_at: new Date().toISOString(),
};

export const DEMO_NOTIFICATIONS: AppNotification[] = [
  {
    id: "cccccccc1-0000-4000-8000-000000000001",
    user_id: DEMO_USER_ID,
    type: "room_revealed",
    title: "Room revealed",
    body: "Friday Night BGMI Open room 8842190 unlocked (password: arenax).",
    read: false,
    payload: null,
    created_at: minutesFromNow(-15),
  },
];

export const DEMO_GAME_ACCOUNTS: GameAccount[] = [
  {
    id: "dddddddd1-0000-4000-8000-000000000001",
    player_id: DEMO_USER_ID,
    game_id: "bgmi",
    game_uid: "GhostOP",
    region: "IN",
    is_primary: true,
    created_at: minutesFromNow(-60 * 24 * 30),
  },
];

export const DEMO_LEADERBOARD: LeaderboardEntry[] = [
  {
    id: "eeeeeeee1-0000-4000-8000-000000000001",
    scope: "tournament",
    game_id: "bgmi",
    tournament_id: DEMO_TOURNAMENTS[0].id,
    player_id: DEMO_USER_ID,
    team_id: null,
    points: 24,
    kills: 31,
    matches_played: 1,
    wins: 1,
    period_start: minutesFromNow(-60 * 24 * 2),
    updated_at: minutesFromNow(-60 * 24 * 1),
    username: "ghostop",
  },
];

export function isDemoMode(): boolean {
  return DEMO_MODE;
}
