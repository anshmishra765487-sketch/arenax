import { describe, expect, it } from "vitest";

import {
  calculateBattleRoyaleStandings,
  generateDoubleElimination,
  generateRoundRobin,
  generateSingleElimination,
  seedOrder,
  suggestSchedule,
} from "./bracket";

const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

describe("seedOrder", () => {
  it("produces standard seeding for 8", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("always pairs the top seed with the lowest seed", () => {
    const order = seedOrder(16);
    expect(order[0]).toBe(1);
    expect(order[1]).toBe(16);
    expect(order[2]).toBe(8);
    expect(order[3]).toBe(9);
  });
});

describe("generateSingleElimination", () => {
  it("creates N-1 matches with unique ids", () => {
    const matches = generateSingleElimination(players);
    expect(matches).toHaveLength(7);
    expect(new Set(matches.map((match) => match.id)).size).toBe(7);
  });

  it("seeds the first round correctly", () => {
    const matches = generateSingleElimination(players);
    const firstRound = matches.filter((match) => match.round === 1);
    expect(firstRound.map((match) => [match.homeId, match.awayId])).toEqual([
      ["p1", "p8"],
      ["p4", "p5"],
      ["p2", "p7"],
      ["p3", "p6"],
    ]);
  });

  it("links winners into the next round", () => {
    const matches = generateSingleElimination(players);
    const first = matches.find((match) => match.id === "W-1-1")!;
    expect(first.nextMatchId).toBe("W-2-1");
    expect(first.nextSlot).toBe("home");

    const second = matches.find((match) => match.id === "W-1-2")!;
    expect(second.nextMatchId).toBe("W-2-1");
    expect(second.nextSlot).toBe("away");
  });

  it("handles byes for non power-of-two fields", () => {
    const matches = generateSingleElimination(["a", "b", "c", "d", "e"]);
    // The skeleton has 7 slots (next power of two), of which 3 are byes and
    // 4 are actually played (5 players => N-1 real matches).
    expect(matches).toHaveLength(7);
    expect(matches.filter((match) => match.status !== "bye")).toHaveLength(4);
  });

  it("returns an empty bracket for fewer than two players", () => {
    expect(generateSingleElimination(["solo"])).toEqual([]);
    expect(generateSingleElimination([])).toEqual([]);
  });
});

describe("generateDoubleElimination", () => {
  it("creates winners, losers and a grand final", () => {
    const matches = generateDoubleElimination(players);
    const winners = matches.filter((match) => match.bracket === "winners");
    const losers = matches.filter((match) => match.bracket === "losers");
    const finals = matches.filter((match) => match.bracket === "grand_final");

    expect(winners).toHaveLength(7);
    expect(losers).toHaveLength(6);
    expect(finals).toHaveLength(1);
    expect(matches).toHaveLength(14);
  });

  it("gives every match a unique id", () => {
    const matches = generateDoubleElimination(players);
    expect(new Set(matches.map((match) => match.id)).size).toBe(matches.length);
  });
});

describe("generateRoundRobin", () => {
  it("pairs every player with every other player exactly once", () => {
    const fixtures = generateRoundRobin(players.slice(0, 4));
    expect(fixtures).toHaveLength(6);
    const pairs = fixtures.map((fixture) => [fixture.homeId, fixture.awayId].sort().join("-"));
    expect(new Set(pairs).size).toBe(6);
  });

  it("handles odd participant counts without duplicates", () => {
    const fixtures = generateRoundRobin(players.slice(0, 5));
    expect(fixtures).toHaveLength(10);
    const pairs = fixtures.map((fixture) => [fixture.homeId, fixture.awayId].sort().join("-"));
    expect(new Set(pairs).size).toBe(10);
  });
});

describe("calculateBattleRoyaleStandings", () => {
  const config = {
    placementPoints: { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6 },
    killPoints: 1,
  };

  it("adds placement and kill points", () => {
    const standings = calculateBattleRoyaleStandings(
      [
        { playerId: "a", placement: 1, kills: 2 }, // 17
        { playerId: "b", placement: 2, kills: 5 }, // 17
        { playerId: "c", placement: 3, kills: 0 }, // 10
      ],
      config,
    );

    expect(standings.map((standing) => standing.playerId)).toEqual(["b", "a", "c"]);
    expect(standings[0].points).toBe(17);
    expect(standings[0].rank).toBe(1);
  });

  it("breaks ties on kills, then on better placement", () => {
    const standings = calculateBattleRoyaleStandings(
      [
        { playerId: "a", placement: 5, kills: 3 }, // 9
        { playerId: "b", placement: 1, kills: 0 }, // 15
        { playerId: "c", placement: 4, kills: 1 }, // 9
      ],
      config,
    );
    expect(standings[0].playerId).toBe("b");
    // a and c both have 9 points; a has more kills.
    expect(standings.map((standing) => standing.playerId).slice(1)).toEqual(["a", "c"]);
  });

  it("treats unknown placements as zero points and ignores negative kills", () => {
    const standings = calculateBattleRoyaleStandings(
      [{ playerId: "a", placement: 99, kills: -4 }],
      config,
    );
    expect(standings[0].points).toBe(0);
    expect(standings[0].kills).toBe(0);
  });
});

describe("suggestSchedule", () => {
  it("packs matches into free slots without overlap", () => {
    const slots = [{ start: 0, end: 5 * 3_600_000 }];
    const matches = [
      { id: "m1", durationMinutes: 60 },
      { id: "m2", durationMinutes: 90 },
      { id: "m3", durationMinutes: 120 },
    ];

    const scheduled = suggestSchedule(slots, matches);
    expect(scheduled).toHaveLength(3);
    for (let index = 1; index < scheduled.length; index += 1) {
      expect(scheduled[index].start).toBeGreaterThanOrEqual(scheduled[index - 1].end);
    }
  });

  it("leaves matches unscheduled when slots overflow", () => {
    const scheduled = suggestSchedule([{ start: 0, end: 60 * 60_000 }], [
      { id: "m1", durationMinutes: 60 },
      { id: "m2", durationMinutes: 60 },
    ]);
    expect(scheduled).toHaveLength(1);
  });
});
