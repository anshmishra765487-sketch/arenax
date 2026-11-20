/**
 * Demo mode.
 *
 * ArenaX normally talks to Supabase. When no project is configured (or when
 * NEXT_PUBLIC_DEMO_MODE=true) the console runs on the sample data below so that
 * the product can be reviewed end to end without a database:
 *
 *   - `/login` accepts the demo organizer credentials
 *   - every console screen renders realistic (read-only) data
 *   - every write action explains that demo mode is read-only
 *
 * Adding real NEXT_PUBLIC_SUPABASE_* keys switches everything back to Supabase;
 * nothing in this file is used in production mode.
 *
 * This module must stay dependency-free: it is imported by the Next `proxy`
 * (edge runtime) as well as by server components.
 */

export const DEMO_COOKIE = "arenax_demo";

export const DEMO_EMAIL = "organizer@arenax.demo";
export const DEMO_PASSWORD = "ArenaX!demo123";

export const DEMO_PROFILE = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "arenax_demo",
  display_name: "ArenaX Demo Organizer",
  role: "admin",
  is_banned: false,
  email: DEMO_EMAIL,
};

/**
 * Demo mode turns itself on when the project has no usable Supabase config, so
 * a fresh clone (or a Vercel preview without secrets) is never a dead page.
 */
export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) return true;
  if (url.includes("your-project-ref")) return true;
  return false;
}

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const TOURNAMENT_1 = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_2 = "22222222-2222-4222-8222-222222222222";
const TOURNAMENT_3 = "33333333-3333-4333-8333-333333333333";

const reg = (n: number) => `aaaaaaa${n}-0000-4000-8000-00000000000${n}`;

export const DEMO_STATS = {
  users: 4821,
  banned_users: 17,
  organizers: 24,
  tournaments: 63,
  live_tournaments: 1,
  registrations: 1492,
  open_reports: 2,
  open_disputes: 1,
  pending_results: 3,
  active_vip: 96,
};

export const DEMO_TOURNAMENTS = [
  {
    id: TOURNAMENT_1,
    title: "Friday Night BGMI Open",
    game_id: "bgmi",
    mode: "squad",
    format: "battle_royale",
    status: "live",
    start_time: minutesFromNow(25),
    end_time: minutesFromNow(145),
    slots_left: 2,
    slots_total: 16,
    map: "Erangel",
    prize_info: "₹5,000 prize pool funded by Acme Energy",
    rules: "No emulators. No teaming. Room ID drops 10 minutes before start.",
    bracket_generated_at: null,
    organizer_id: DEMO_PROFILE.id,
    created_at: minutesFromNow(-60 * 24 * 3),
  },
  {
    id: TOURNAMENT_2,
    title: "Valorant Weekend Clash",
    game_id: "valorant",
    mode: "squad",
    format: "single_elim",
    status: "upcoming",
    start_time: minutesFromNow(60 * 26),
    end_time: minutesFromNow(60 * 30),
    slots_left: 0,
    slots_total: 8,
    map: "Ascent",
    prize_info: "₹8,000 prize pool funded by Nova Peripherals",
    rules: "Best of one. Overtime enabled. Screenshot required after every map.",
    bracket_generated_at: minutesFromNow(-90),
    organizer_id: DEMO_PROFILE.id,
    created_at: minutesFromNow(-60 * 24 * 5),
  },
  {
    id: TOURNAMENT_3,
    title: "Free Fire Solo Sprint",
    game_id: "freefire",
    mode: "solo",
    format: "battle_royale",
    status: "completed",
    start_time: minutesFromNow(-60 * 48),
    end_time: minutesFromNow(-60 * 47),
    slots_left: 0,
    slots_total: 48,
    map: "Bermuda",
    prize_info: "₹2,000 prize pool funded by Acme Energy",
    rules: "Solo only. Placement plus 1 point per kill.",
    bracket_generated_at: null,
    organizer_id: DEMO_PROFILE.id,
    created_at: minutesFromNow(-60 * 24 * 8),
  },
];

const REGISTRATIONS_T2 = [
  { id: reg(1), player_id: "bbbbbbb1-0000-4000-8000-000000000001", status: "confirmed", in_game_id: "GhostOP", created_at: minutesFromNow(-600) },
  { id: reg(2), player_id: "bbbbbbb2-0000-4000-8000-000000000002", status: "confirmed", in_game_id: "RaviX", created_at: minutesFromNow(-580) },
  { id: reg(3), player_id: "bbbbbbb3-0000-4000-8000-000000000003", status: "confirmed", in_game_id: "NovaAce", created_at: minutesFromNow(-540) },
  { id: reg(4), player_id: "bbbbbbb4-0000-4000-8000-000000000004", status: "confirmed", in_game_id: "KaiZenn", created_at: minutesFromNow(-520) },
  { id: reg(5), player_id: "bbbbbbb5-0000-4000-8000-000000000005", status: "confirmed", in_game_id: "ShreyG", created_at: minutesFromNow(-500) },
  { id: reg(6), player_id: "bbbbbbb6-0000-4000-8000-000000000006", status: "confirmed", in_game_id: "Volt", created_at: minutesFromNow(-480) },
  { id: reg(7), player_id: "bbbbbbb7-0000-4000-8000-000000000007", status: "confirmed", in_game_id: "Mirage", created_at: minutesFromNow(-460) },
  { id: reg(8), player_id: "bbbbbbb8-0000-4000-8000-000000000008", status: "confirmed", in_game_id: "Astra", created_at: minutesFromNow(-440) },
];

const REGISTRATIONS_T1 = [
  { id: reg(1), player_id: "bbbbbbb1-0000-4000-8000-000000000001", status: "confirmed", in_game_id: "GhostOP", created_at: minutesFromNow(-1800) },
  { id: reg(2), player_id: "bbbbbbb2-0000-4000-8000-000000000002", status: "confirmed", in_game_id: "RaviX", created_at: minutesFromNow(-1750) },
  { id: reg(3), player_id: "bbbbbbb3-0000-4000-8000-000000000003", status: "confirmed", in_game_id: "NovaAce", created_at: minutesFromNow(-1700) },
  { id: reg(4), player_id: "bbbbbbb4-0000-4000-8000-000000000004", status: "waitlist", in_game_id: "KaiZenn", created_at: minutesFromNow(-1650) },
];

const match = (
  n: number,
  bracket: string,
  home: string | null,
  away: string | null,
  status: string,
  winner: string | null = null,
) => ({
  id: `ccccccc${n}-0000-4000-8000-00000000000${n}`,
  match_number: n,
  bracket,
  home_registration_id: home,
  away_registration_id: away,
  home_score: status === "completed" ? 13 : null,
  away_score: status === "completed" ? 9 : null,
  winner_registration_id: winner,
  status,
});

const MATCHES_T2 = [
  match(1, "winners", reg(1), reg(2), "completed", reg(1)),
  match(2, "winners", reg(3), reg(4), "completed", reg(4)),
  match(3, "winners", reg(5), reg(6), "completed", reg(5)),
  match(4, "winners", reg(7), reg(8), "completed", reg(8)),
  match(5, "winners", reg(1), reg(4), "ready"),
  match(6, "winners", reg(5), reg(8), "ready"),
];

const BR_MATCHES_T1 = [
  match(1, "battle_royale", reg(1), null, "ready"),
  match(2, "battle_royale", reg(2), null, "ready"),
];

export const DEMO_DETAILS: Record<
  string,
  {
    tournament: (typeof DEMO_TOURNAMENTS)[number];
    room: { room_id: string; room_password: string; revealed_at: string | null } | null;
    registrations: typeof REGISTRATIONS_T1;
    matches: typeof MATCHES_T2;
    submissions: Array<{
      id: string;
      match_id: string | null;
      submitted_by: string;
      screenshot_url: string;
      claimed_winner: string | null;
      status: string;
      created_at: string;
    }>;
    disputes: Array<{ id: string; tournament_id: string; opened_by: string; reason: string; status: string; created_at: string }>;
    announcements: Array<{ id: string; body: string; created_at: string }>;
    streams: Array<{ id: string; title: string; url: string; platform: string; is_live: boolean }>;
  }
> = {
  [TOURNAMENT_1]: {
    tournament: DEMO_TOURNAMENTS[0],
    room: { room_id: "8842190", room_password: "arenax", revealed_at: minutesFromNow(15) },
    registrations: REGISTRATIONS_T1,
    matches: [],
    submissions: [],
    disputes: [],
    announcements: [
      {
        id: "ddddddd1-0000-4000-8000-000000000001",
        body: "Room opens 10 minutes before start. Be in the lobby 5 minutes early.",
        created_at: minutesFromNow(-30),
      },
    ],
    streams: [
      {
        id: "eeeeeee1-0000-4000-8000-000000000001",
        title: "ArenaX Main Stream",
        url: "https://youtube.com/watch?v=demo",
        platform: "youtube",
        is_live: true,
      },
    ],
  },
  [TOURNAMENT_2]: {
    tournament: DEMO_TOURNAMENTS[1],
    room: { room_id: "5120394", room_password: "clash", revealed_at: minutesFromNow(60 * 25) },
    registrations: REGISTRATIONS_T2,
    matches: MATCHES_T2,
    submissions: [
      {
        id: "fffffff1-0000-4000-8000-000000000001",
        match_id: `ccccccc1-0000-4000-8000-000000000001`,
        submitted_by: "bbbbbbb1-0000-4000-8000-000000000001",
        screenshot_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e",
        claimed_winner: reg(1),
        status: "pending",
        created_at: minutesFromNow(-45),
      },
      {
        id: "fffffff2-0000-4000-8000-000000000002",
        match_id: `ccccccc2-0000-4000-8000-000000000002`,
        submitted_by: "bbbbbbb4-0000-4000-8000-000000000004",
        screenshot_url: "https://images.unsplash.com/photo-1511512578047-dfb367046420",
        claimed_winner: reg(4),
        status: "flagged",
        created_at: minutesFromNow(-40),
      },
    ],
    disputes: [
      {
        id: "99999999-9999-4999-8999-999999999991",
        tournament_id: TOURNAMENT_2,
        opened_by: "bbbbbbb2-0000-4000-8000-000000000002",
        reason: "Opponent used an emulator — asking for a re-check of match 1.",
        status: "open",
        created_at: minutesFromNow(-50),
      },
    ],
    announcements: [
      {
        id: "ddddddd2-0000-4000-8000-000000000002",
        body: "Bracket is live. Round 2 starts 10 minutes after round 1 ends.",
        created_at: minutesFromNow(-80),
      },
    ],
    streams: [],
  },
  [TOURNAMENT_3]: {
    tournament: DEMO_TOURNAMENTS[2],
    room: { room_id: "3312001", room_password: "sprint", revealed_at: minutesFromNow(-60 * 48 - 10) },
    registrations: REGISTRATIONS_T1,
    matches: BR_MATCHES_T1,
    submissions: [],
    disputes: [],
    announcements: [],
    streams: [],
  },
};

export const DEMO_USERS = [
  {
    id: "bbbbbbb1-0000-4000-8000-000000000001",
    username: "ghostop",
    display_name: "Ghost OP",
    role: "player",
    xp: 4210,
    level: 18,
    trust_score: 92,
    is_banned: false,
    created_at: minutesFromNow(-60 * 24 * 220),
  },
  {
    id: "bbbbbbb2-0000-4000-8000-000000000002",
    username: "ravix",
    display_name: "Ravi X",
    role: "player",
    xp: 2680,
    level: 12,
    trust_score: 74,
    is_banned: false,
    created_at: minutesFromNow(-60 * 24 * 150),
  },
  {
    id: "bbbbbbb3-0000-4000-8000-000000000003",
    username: "novaace",
    display_name: "Nova Ace",
    role: "organizer",
    xp: 7300,
    level: 26,
    trust_score: 97,
    is_banned: false,
    created_at: minutesFromNow(-60 * 24 * 300),
  },
  {
    id: "bbbbbbb4-0000-4000-8000-000000000004",
    username: "kaizenn",
    display_name: "Kai Zenn",
    role: "player",
    xp: 980,
    level: 6,
    trust_score: 38,
    is_banned: false,
    created_at: minutesFromNow(-60 * 24 * 40),
  },
  {
    id: "bbbbbbb5-0000-4000-8000-000000000005",
    username: "toxic_raj",
    display_name: "Raj",
    role: "player",
    xp: 120,
    level: 2,
    trust_score: 21,
    is_banned: true,
    created_at: minutesFromNow(-60 * 24 * 12),
  },
  {
    id: DEMO_PROFILE.id,
    username: DEMO_PROFILE.username,
    display_name: DEMO_PROFILE.display_name,
    role: "admin",
    xp: 15200,
    level: 44,
    trust_score: 100,
    is_banned: false,
    created_at: minutesFromNow(-60 * 24 * 420),
  },
];

export const DEMO_SPONSORS = [
  {
    id: "77777777-7777-4777-8777-777777777771",
    name: "Acme Energy",
    description: "Energy drink partner for the BGMI and Free Fire series.",
    website_url: "https://example.com/acme",
    active: true,
    created_at: minutesFromNow(-60 * 24 * 60),
  },
  {
    id: "77777777-7777-4777-8777-777777777772",
    name: "Nova Peripherals",
    description: "Gaming mice and keyboards — funds the Valorant circuit.",
    website_url: "https://example.com/nova",
    active: true,
    created_at: minutesFromNow(-60 * 24 * 30),
  },
];

export const DEMO_SPONSOR_LINKS = [
  {
    sponsor_id: "77777777-7777-4777-8777-777777777771",
    tournament_id: TOURNAMENT_1,
    impressions: 18420,
    clicks: 731,
    registrations: 44,
    contribution_note: "₹5,000 prize pool",
  },
  {
    sponsor_id: "77777777-7777-4777-8777-777777777772",
    tournament_id: TOURNAMENT_2,
    impressions: 9260,
    clicks: 402,
    registrations: 31,
    contribution_note: "₹8,000 prize pool + peripherals",
  },
];

export const DEMO_REPORTS = [
  {
    id: "88888888-8888-4888-8888-888888888881",
    reporter_id: "bbbbbbb2-0000-4000-8000-000000000002",
    reported_id: "bbbbbbb4-0000-4000-8000-000000000004",
    category: "cheating",
    description: "Same screenshot used in two different matches — duplicate hash detected.",
    status: "open",
    created_at: minutesFromNow(-120),
  },
  {
    id: "88888888-8888-4888-8888-888888888882",
    reporter_id: "bbbbbbb1-0000-4000-8000-000000000001",
    reported_id: "bbbbbbb5-0000-4000-8000-000000000005",
    category: "abuse",
    description: "Abusive messages in the tournament lobby chat.",
    status: "under_review",
    created_at: minutesFromNow(-300),
  },
];

export const DEMO_DISPUTES = [
  {
    id: "99999999-9999-4999-8999-999999999991",
    tournament_id: TOURNAMENT_2,
    opened_by: "bbbbbbb2-0000-4000-8000-000000000002",
    reason: "Opponent used an emulator — asking for a re-check of match 1.",
    status: "open",
    created_at: minutesFromNow(-50),
  },
  {
    id: "99999999-9999-4999-8999-999999999992",
    tournament_id: TOURNAMENT_1,
    opened_by: "bbbbbbb4-0000-4000-8000-000000000004",
    reason: "My kill count is wrong: I had 7, the sheet says 4.",
    status: "under_review",
    created_at: minutesFromNow(-400),
  },
];
