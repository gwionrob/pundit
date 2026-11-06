import { describe, expect, it } from "vitest";
import type { RawBootstrap, RawEntryHistory, RawLive, RawPicks, RawStandings } from "../../src/core/fpl-types.ts";
import {
  buildManagerGameweeks,
  competitionRanks,
  gameweeksInMonth,
  gameweekStats,
  monthlyTable,
  movementArrow,
  net,
  resolveCaptain,
  livePointsMap,
} from "../../src/core/stats.ts";
import { fixture, makeLive, makePicks, row } from "./helpers.ts";

const names: Record<number, string> = { 1: "Haaland", 2: "Salah", 3: "Palmer", 4: "Saka" };
const nameOf = (id: number) => names[id] ?? `#${id}`;

describe("net points & ties", () => {
  it("subtracts transfer hits", () => {
    expect(net(70, 8)).toBe(62);
  });

  it("uses net points for winner, so a hit can cost the win", () => {
    const rows = [row(1, "Ann"), row(2, "Ben"), row(3, "Cat")];
    const picks = new Map<number, RawPicks>([
      [1, makePicks({ points: 70, cost: 8, total: 600, captain: 1, vice: 2 })],
      [2, makePicks({ points: 65, total: 610, captain: 1, vice: 2 })],
      [3, makePicks({ points: 40, total: 500, captain: 1, vice: 2 })],
    ]);
    const s = gameweekStats(buildManagerGameweeks(rows, picks, makeLive({ 1: [5, 90] }), nameOf));
    expect(s.winners.map((m) => m.managerName)).toEqual(["Ben"]);
    expect(s.spoons.map((m) => m.managerName)).toEqual(["Cat"]);
    expect(s.hits.map((m) => [m.managerName, m.transfersCost])).toEqual([["Ann", 8]]);
    expect(s.leagueAverage).toBe(55.7);
  });

  it("reports every tied winner", () => {
    const rows = [row(1, "Ann"), row(2, "Ben"), row(3, "Cat")];
    const picks = new Map<number, RawPicks>([
      [1, makePicks({ points: 60, total: 600, captain: 1, vice: 2 })],
      [2, makePicks({ points: 64, cost: 4, total: 610, captain: 1, vice: 2 })],
      [3, makePicks({ points: 40, total: 500, captain: 1, vice: 2 })],
    ]);
    const s = gameweekStats(buildManagerGameweeks(rows, picks, makeLive({}), nameOf));
    expect(s.winners.map((m) => m.managerName)).toEqual(["Ann", "Ben"]);
  });

  it("competition ranks share places", () => {
    expect(competitionRanks([10, 20, 20, 5])).toEqual([3, 1, 1, 4]);
  });
});

describe("climbers & fallers", () => {
  it("computes rank movement from totals before/after the gameweek", () => {
    const rows = [row(1, "Ann"), row(2, "Ben"), row(3, "Cat")];
    // before: Ann 550, Ben 540, Cat 530  -> after: Cat 630, Ben 590, Ann 560
    const picks = new Map<number, RawPicks>([
      [1, makePicks({ points: 10, total: 560, captain: 1, vice: 2 })],
      [2, makePicks({ points: 50, total: 590, captain: 1, vice: 2 })],
      [3, makePicks({ points: 100, total: 630, captain: 1, vice: 2 })],
    ]);
    const m = buildManagerGameweeks(rows, picks, makeLive({}), nameOf);
    expect(m.map((x) => [x.managerName, x.prevRank, x.rank])).toEqual([
      ["Ann", 1, 3],
      ["Ben", 2, 2],
      ["Cat", 3, 1],
    ]);
    const s = gameweekStats(m);
    expect(s.climbers).toMatchObject({ places: 2 });
    expect(s.climbers!.managers.map((x) => x.managerName)).toEqual(["Cat"]);
    expect(s.fallers).toMatchObject({ places: 2 });
    expect(s.fallers!.managers.map((x) => x.managerName)).toEqual(["Ann"]);
  });

  it("treats managers with no prior total as new (no movement)", () => {
    const rows = [row(1, "Ann"), row(2, "New")];
    const picks = new Map<number, RawPicks>([
      [1, makePicks({ points: 50, total: 500, captain: 1, vice: 2 })],
      [2, makePicks({ points: 90, total: 90, captain: 1, vice: 2 })],
    ]);
    const m = buildManagerGameweeks(rows, picks, makeLive({}), nameOf);
    expect(m[1]!.prevRank).toBeNull();
    expect(movementArrow(m[1]!.prevRank, m[1]!.rank)).toBe("NEW");
    expect(gameweekStats(m).climbers).toBeNull();
  });

  it("skips standings rows without picks (e.g. joined later)", () => {
    const picks = new Map<number, RawPicks>([[1, makePicks({ points: 50, total: 500, captain: 1, vice: 2 })]]);
    expect(buildManagerGameweeks([row(1, "Ann"), row(2, "Ghost")], picks, makeLive({}), nameOf)).toHaveLength(1);
  });
});

describe("captaincy", () => {
  it("doubles the captain's points", () => {
    const c = resolveCaptain(
      makePicks({ points: 0, total: 0, captain: 1, vice: 2 }),
      livePointsMap(makeLive({ 1: [9, 90], 2: [3, 90] })),
      nameOf,
    );
    expect(c).toMatchObject({ name: "Haaland", haul: 18, multiplier: 2, tripleCaptain: false, viceUsed: false });
  });

  it("triples on Triple Captain", () => {
    const p = makePicks({ points: 0, total: 0, captain: 2, vice: 1, chip: "3xc" });
    const c = resolveCaptain(p, livePointsMap(makeLive({ 2: [12, 90] })), nameOf);
    expect(c).toMatchObject({ name: "Salah", haul: 36, multiplier: 3, tripleCaptain: true });
  });

  it("falls back to the vice-captain when the captain didn't play", () => {
    const c = resolveCaptain(
      makePicks({ points: 0, total: 0, captain: 1, vice: 3 }),
      livePointsMap(makeLive({ 1: [0, 0], 3: [7, 80] })),
      nameOf,
    );
    expect(c).toMatchObject({ name: "Palmer", haul: 14, viceUsed: true });
  });

  it("finds best, worst and most captained", () => {
    const rows = [row(1, "Ann"), row(2, "Ben"), row(3, "Cat")];
    const picks = new Map<number, RawPicks>([
      [1, makePicks({ points: 50, total: 500, captain: 1, vice: 2 })],
      [2, makePicks({ points: 50, total: 500, captain: 1, vice: 2 })],
      [3, makePicks({ points: 50, total: 500, captain: 4, vice: 2, chip: "3xc" })],
    ]);
    const s = gameweekStats(buildManagerGameweeks(rows, picks, makeLive({ 1: [2, 90], 4: [10, 90] }), nameOf));
    expect(s.bestCaptains.map((m) => m.managerName)).toEqual(["Cat"]);
    expect(s.bestCaptains[0]!.captain!.haul).toBe(30);
    expect(s.worstCaptains.map((m) => m.managerName)).toEqual(["Ann", "Ben"]);
    expect(s.mostCaptained).toEqual({ name: "Haaland", count: 2 });
    expect(s.chips.map((m) => m.chip)).toEqual(["3xc"]);
  });
});

describe("real league fixture (GW9)", () => {
  const standings = fixture<RawStandings>("standings");
  const picksJson = fixture<Record<string, RawPicks>>("picks-gw9");
  const live = fixture<RawLive>("live-gw9");
  const bs = fixture<RawBootstrap>("bootstrap");
  const elementName = (id: number) => bs.elements.find((e) => e.id === id)?.web_name ?? "?";
  const picks = new Map(Object.entries(picksJson).map(([k, v]) => [Number(k), v]));

  it("produces sane stats from real data", () => {
    const m = buildManagerGameweeks(standings.results, picks, live, elementName);
    expect(m).toHaveLength(4);
    const s = gameweekStats(m);
    expect(s.winners[0]!.managerName).toBe("Rik Doornenbal");
    expect(s.winners[0]!.net).toBe(74);
    expect(s.mostCaptained?.name).toBe("Haaland");
    // Totals from the picks endpoint agree with the standings endpoint.
    for (const x of m) {
      expect(x.total).toBe(standings.results.find((r) => r.entry === x.entryId)!.total);
    }
  });
});

describe("monthly", () => {
  const bs = fixture<RawBootstrap>("bootstrap");

  it("selects gameweeks by deadline month (UTC)", () => {
    expect(gameweeksInMonth(bs.events, 10, 2026)).toEqual([6, 7, 8, 9]);
    expect(gameweeksInMonth(bs.events, 7, 2026)).toEqual([]);
  });

  it("handles deadlines right at a month boundary", () => {
    const ev = (id: number, deadline_time: string) => ({ ...bs.events[0]!, id, deadline_time });
    const events = [
      ev(1, "2026-09-30T23:59:00Z"),
      ev(2, "2026-10-01T00:00:00Z"),
      ev(3, "2026-10-31T23:59:59Z"),
      ev(4, "2026-11-01T00:00:00Z"),
    ];
    expect(gameweeksInMonth(events, 10, 2026)).toEqual([2, 3]);
    expect(gameweeksInMonth(events, 10, 2025)).toEqual([]);
  });

  it("sums net points across the month and ranks with ties", () => {
    const h = (gws: [number, number, number][]): RawEntryHistory => ({
      chips: [],
      current: gws.map(([event, points, cost]) => ({
        event,
        points,
        event_transfers_cost: cost,
        total_points: 0,
        rank: null,
        overall_rank: null,
        bank: 0,
        value: 0,
        event_transfers: 0,
        points_on_bench: 0,
      })),
    });
    const histories = new Map([
      [
        1,
        h([
          [5, 100, 0],
          [6, 50, 4],
          [7, 60, 0],
        ]),
      ], // GW6-7: 106
      [
        2,
        h([
          [6, 56, 0],
          [7, 50, 0],
        ]),
      ], // 106
      [
        3,
        h([
          [6, 40, 0],
          [7, 30, 0],
        ]),
      ], // 70
    ]);
    const t = monthlyTable([row(1, "Ann"), row(2, "Ben"), row(3, "Cat")], histories, [6, 7]);
    expect(t.map((r) => [r.managerName, r.points, r.rank])).toEqual([
      ["Ann", 106, 1],
      ["Ben", 106, 1],
      ["Cat", 70, 3],
    ]);
  });

  it("works on a real history fixture", () => {
    const hist = fixture<RawEntryHistory>("history");
    const standings = fixture<RawStandings>("standings");
    const t = monthlyTable(standings.results.slice(0, 1), new Map([[standings.results[0]!.entry, hist]]), [6, 7, 8, 9]);
    const expected = hist.current
      .filter((e) => e.event >= 6 && e.event <= 9)
      .reduce((s, e) => s + e.points - e.event_transfers_cost, 0);
    expect(t[0]!.points).toBe(expected);
  });
});
