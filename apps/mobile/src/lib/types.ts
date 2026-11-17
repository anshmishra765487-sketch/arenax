export type Role = "player" | "team_captain" | "organizer" | "admin";
export type Language = "en" | "hi";
export type TournamentStatus = "upcoming" | "live" | "completed" | "cancelled";
export type TournamentMode = "solo" | "duo" | "squad" | "five";
export type RegistrationStatus = "confirmed" | "waitlisted" | "cancelled";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  language: Language;
  phone: string | null;
  role: Role;
  xp: number;
  level: number;
  trust_score: number;
  streak_days: number;
  is_banned: boolean;
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Game {
  id: string;
  name: string;
  publisher: string;
  short_name: string;
  active: boolean;
  created_at: string;
}

export interface GameAccount {
  id: string;
  player_id: string;
  game_id: string;
  game_uid: string;
  region: string;
  is_primary: boolean;
  created_at: string;
}

export interface Tournament {
  id: string;
  organizer_id: string;
  game_id: string;
  title: string;
  mode: TournamentMode;
  status: TournamentStatus;
  start_time: string;
  end_time: string;
  slots_total: number;
  slots_left: number;
  rules: string | null;
  map: string | null;
  prize_info: string | null;
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  tournament_id: string;
  player_id: string;
  team_id: string | null;
  status: RegistrationStatus;
  in_game_id: string;
  created_at: string;
}

export interface Team {
  id: string;
  captain_id: string;
  game_id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
}

export interface TeamMember {
  team_id: string;
  player_id: string;
  role: "captain" | "member";
  joined_at: string;
}

export interface RoomDetails {
  id: string;
  tournament_id: string;
  room_id: string | null;
  room_password: string | null;
  revealed_at: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type:
    | "registration_confirmed"
    | "registration_cancelled"
    | "room_revealed"
    | "match_starting"
    | "result_published"
    | "dispute_update"
    | "system";
  title: string;
  body: string;
  read: boolean;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Shape returned by the join_tournament / cancel_registration RPCs. */
export interface RpcResult {
  ok: boolean;
  error: string | null;
  registration_id?: string;
  status?: RegistrationStatus;
  waitlist_position?: number | null;
}

export interface LeaderboardEntry {
  id: string;
  scope: "tournament" | "weekly" | "monthly" | "all_time";
  game_id: string;
  tournament_id: string | null;
  player_id: string | null;
  team_id: string | null;
  points: number;
  kills: number;
  matches_played: number;
  wins: number;
  period_start: string;
  updated_at: string;
  username?: string;
}

export interface ChatMessage {
  id: string;
  tournament_id: string;
  user_id: string;
  body: string;
  is_announcement: boolean;
  is_deleted: boolean;
  created_at: string;
  username?: string;
}

export interface Clip {
  id: string;
  tournament_id: string | null;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  likes_count: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  username?: string;
}

export interface Scrim {
  id: string;
  posted_by: string;
  game_id: string;
  team_name: string;
  description: string | null;
  scheduled_at: string;
  slots: number;
  status: "open" | "matched" | "cancelled" | "completed";
  created_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
  unlocked_at?: string;
}

export interface Match {
  id: string;
  tournament_id: string;
  round_id: string | null;
  match_number: number;
  bracket: string;
  home_registration_id: string | null;
  away_registration_id: string | null;
  home_score: number | null;
  away_score: number | null;
  winner_registration_id: string | null;
  status: string;
  scheduled_at: string | null;
}

export interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  active: boolean;
}

export interface Stream {
  id: string;
  tournament_id: string;
  title: string;
  platform: "youtube" | "loco" | "twitch" | "other";
  url: string;
  starts_at: string | null;
  is_live: boolean;
}
