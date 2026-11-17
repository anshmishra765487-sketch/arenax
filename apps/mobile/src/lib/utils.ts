import ARENA_CONFIG, { type ArenaGame } from "@arenax/config";

/**
 * Low-end Android note: avoid `Intl.DateTimeFormat` here. Formatting is done
 * manually so 2 GB RAM / older Hermes builds behave identically offline.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatClock(date: Date): string {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${pad(date.getMinutes())} ${hours24 >= 12 ? "PM" : "AM"}`;
}

export function getGame(gameId: string): ArenaGame | null {
  return ARENA_CONFIG.games.find((game) => game.id === gameId) ?? null;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} · ${formatClock(date)}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return formatClock(date);
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function getCountdown(targetIso: string, nowMs = Date.now()): Countdown {
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }
  const diff = Math.max(0, target - nowMs);
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
    done: diff === 0,
  };
}

export function countdownLabel(countdown: Countdown): string {
  if (countdown.done) return "Starting now";
  if (countdown.days > 0) {
    return `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m`;
  }
  return `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`;
}

export function isValidInGameId(gameId: string, uid: string): boolean {
  const game = getGame(gameId);
  if (!game) return false;
  try {
    return new RegExp(game.uidPattern).test(uid.trim());
  } catch {
    return uid.trim().length >= 3;
  }
}

export function gameLabel(gameId: string): string {
  return getGame(gameId)?.shortName ?? gameId.toUpperCase();
}

/** Registration closes 15 minutes before start (mirrors the DB rule). */
export function isRegistrationClosed(startTimeIso: string, nowMs = Date.now()): boolean {
  const start = new Date(startTimeIso).getTime();
  if (Number.isNaN(start)) return true;
  return nowMs >= start - ARENA_CONFIG.rules.registrationClosesMinutesBeforeStart * 60_000;
}

/** Room details unlock 10 minutes before start (mirrors room_details.revealed_at). */
export function roomRevealAt(startTimeIso: string): string {
  const start = new Date(startTimeIso).getTime();
  const reveal = start - ARENA_CONFIG.rules.roomRevealMinutesBeforeStart * 60_000;
  return new Date(reveal).toISOString();
}
