/**
 * Bracket generation (pure functions, unit-tested).
 *
 * The Next.js organizer console and any future edge function call these to
 * produce a match skeleton; Supabase stores the matches and advances winners.
 */

export type BracketSide = "winners" | "losers" | "grand_final" | "round_robin";
export type MatchState = "pending" | "ready" | "bye";

export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  bracket: BracketSide;
  homeId: string | null;
  awayId: string | null;
  nextMatchId: string | null;
  nextSlot: "home" | "away" | null;
  loserGoesTo: string | null;
  status: MatchState;
}

export interface RoundRobinMatch {
  round: number;
  homeId: string;
  awayId: string;
}

function nextPowerOfTwo(value: number): number {
  let size = 2;
  while (size < value) size *= 2;
  return size;
}

/** Standard bracket seed order: 1 v 16, 8 v 9, 5 v 12, ... */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next: number[] = [];
    const total = order.length * 2;
    for (const seed of order) {
      next.push(seed, total + 1 - seed);
    }
    order = next;
  }
  return order.slice(0, size);
}

export function generateSingleElimination(participantIds: string[]): BracketMatch[] {
  if (participantIds.length < 2) return [];

  const size = nextPowerOfTwo(participantIds.length);
  const order = seedOrder(size);
  const matches: BracketMatch[] = [];

  /**
   * A slot is either a real participant, a permanent bye (empty seed), or TBD
   * (the winner of an earlier match has not been decided yet). Keeping the
   * `tbd` flag stops a half-filled match from being mistaken for a bye.
   */
  interface Slot {
    id: string | null;
    tbd: boolean;
  }

  let slots: Slot[] = order.map((seed) => ({
    id: seed <= participantIds.length ? participantIds[seed - 1] : null,
    tbd: false,
  }));

  let round = 1;
  const rounds: BracketMatch[][] = [];

  while (slots.length > 1) {
    const pairs: Array<[Slot, Slot]> = [];
    for (let index = 0; index < slots.length; index += 2) {
      pairs.push([slots[index], slots[index + 1]]);
    }

    const roundMatches: BracketMatch[] = pairs.map(([home, away], index) => {
      const hasBoth = Boolean(home.id && away.id);
      const hasOne = Boolean(home.id || away.id);
      const waiting = home.tbd || away.tbd;
      return {
        id: `W-${round}-${index + 1}`,
        round,
        position: index + 1,
        bracket: "winners",
        homeId: home.id,
        awayId: away.id,
        nextMatchId: null,
        nextSlot: null,
        loserGoesTo: null,
        status: hasBoth ? "ready" : !waiting && hasOne ? "bye" : "pending",
      };
    });

    rounds.push(roundMatches);
    matches.push(...roundMatches);

    // A bye propagates its participant immediately; every other match leaves
    // its next slot TBD until a winner is recorded.
    slots = roundMatches.map((match) =>
      match.status === "bye"
        ? { id: match.homeId ?? match.awayId, tbd: false }
        : { id: null, tbd: true },
    );
    round += 1;
  }

  // Link each match to its successor.
  for (let r = 0; r < rounds.length - 1; r += 1) {
    for (const match of rounds[r]) {
      const nextIndex = Math.floor((match.position - 1) / 2);
      const nextMatch = rounds[r + 1][nextIndex];
      if (!nextMatch) continue;
      match.nextMatchId = nextMatch.id;
      match.nextSlot = (match.position - 1) % 2 === 0 ? "home" : "away";
    }
  }

  return matches;
}

export function generateDoubleElimination(participantIds: string[]): BracketMatch[] {
  if (participantIds.length < 2) return [];

  const size = nextPowerOfTwo(participantIds.length);
  const matches: BracketMatch[] = [];
  const winners = generateSingleElimination(participantIds);
  matches.push(...winners);

  const wbRounds = new Set(winners.map((match) => match.round)).size;
  const lbCounts: number[] = [];
  for (let count = size / 4; count >= 1; count /= 2) {
    lbCounts.push(count, count);
  }

  let lbRound = 1;
  let previousRoundIds: string[] = [];
  for (const count of lbCounts) {
    const roundIds: string[] = [];
    for (let position = 1; position <= count; position += 1) {
      const id = `L-${lbRound}-${position}`;
      roundIds.push(id);
      matches.push({
        id,
        round: lbRound,
        position,
        bracket: "losers",
        homeId: null,
        awayId: null,
        nextMatchId: null,
        nextSlot: null,
        loserGoesTo: null,
        status: "pending",
      });
    }
    // Previous LB winners advance into this round.
    previousRoundIds.forEach((sourceId, index) => {
      const target = matches.find((match) => match.id === roundIds[Math.floor(index / 2)]);
      const source = matches.find((match) => match.id === sourceId);
      if (target && source) {
        source.nextMatchId = target.id;
        source.nextSlot = index % 2 === 0 ? "home" : "away";
      }
    });
    previousRoundIds = roundIds;
    lbRound += 1;
  }

  // Winners-bracket losers drop into the losers bracket.
  for (const match of winners) {
    if (match.round === 1) {
      const targetIndex = Math.floor((match.position - 1) / 2);
      match.loserGoesTo = `L-1-${targetIndex + 1}`;
    } else if (match.round <= wbRounds) {
      const targetRound = Math.min((match.round - 1) * 2, lbRound - 1);
      const targetPosition = Math.max(1, Math.ceil(match.position / 2));
      match.loserGoesTo = `L-${targetRound}-${targetPosition}`;
    }
  }

  matches.push({
    id: "GF-1",
    round: 1,
    position: 1,
    bracket: "grand_final",
    homeId: null,
    awayId: null,
    nextMatchId: null,
    nextSlot: null,
    loserGoesTo: null,
    status: "pending",
  });

  return matches;
}

/** Circle-method round robin. Every pair meets exactly once. */
export function generateRoundRobin(participantIds: string[]): RoundRobinMatch[] {
  if (participantIds.length < 2) return [];

  const entrants: Array<string | null> = [...participantIds];
  if (entrants.length % 2 === 1) entrants.push(null);

  const rounds = entrants.length - 1;
  const half = entrants.length / 2;
  const fixtures: RoundRobinMatch[] = [];

  let rotation = [...entrants];
  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < half; index += 1) {
      const home = rotation[index];
      const away = rotation[rotation.length - 1 - index];
      if (home && away) {
        // Alternate home/away for fairness.
        fixtures.push(
          round % 2 === 0
            ? { round: round + 1, homeId: home, awayId: away }
            : { round: round + 1, homeId: away, awayId: home },
        );
      }
    }
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop() as string | null);
    rotation = [fixed, ...rest];
  }

  return fixtures;
}

/** Battle-royale standings: placement points + kill points, kills as tiebreak. */
export interface BrEntry {
  playerId: string;
  placement: number;
  kills: number;
}

export interface BrStanding {
  playerId: string;
  placement: number;
  kills: number;
  points: number;
  rank: number;
}

export interface PlacementConfig {
  placementPoints: Record<number, number>;
  killPoints: number;
}

export function calculateBattleRoyaleStandings(
  entries: BrEntry[],
  config: PlacementConfig,
): BrStanding[] {
  const scored = entries.map((entry) => ({
    playerId: entry.playerId,
    placement: entry.placement,
    kills: Math.max(0, entry.kills),
    points:
      (config.placementPoints[entry.placement] ?? 0) + Math.max(0, entry.kills) * config.killPoints,
    rank: 0,
  }));

  scored.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.placement - b.placement;
  });

  scored.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return scored;
}

/** Greedy conflict-free scheduler used by the organizer console. */
export interface ScheduleSlot {
  start: number;
  end: number;
}

export interface ScheduleMatch {
  id: string;
  durationMinutes: number;
}

export interface ScheduledMatch {
  id: string;
  start: number;
  end: number;
}

export function suggestSchedule(
  slots: ScheduleSlot[],
  matchesToSchedule: ScheduleMatch[],
): ScheduledMatch[] {
  const sortedSlots = [...slots].sort((a, b) => a.start - b.start);
  const pending = [...matchesToSchedule].sort(
    (a, b) => b.durationMinutes - a.durationMinutes,
  );
  const result: ScheduledMatch[] = [];

  for (const slot of sortedSlots) {
    let cursor = slot.start;
    for (let index = 0; index < pending.length; index += 1) {
      const match = pending[index];
      const duration = match.durationMinutes * 60_000;
      if (cursor + duration <= slot.end) {
        result.push({ id: match.id, start: cursor, end: cursor + duration });
        cursor += duration;
        pending.splice(index, 1);
        index -= 1;
      }
    }
    if (pending.length === 0) break;
  }

  return result;
}
