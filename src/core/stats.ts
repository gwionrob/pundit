/**
 * Pure stat functions over raw FPL data. No I/O here so everything is
 * testable from fixtures.
 */
import type {
  RawEntryHistory,
  RawEvent,
  RawLive,
  RawPicks,
  RawStandingRow,
} from "./fpl-types.ts";

/** Max members we fetch per-entry data for (keeps API load sane). */
export const ENTRY_FETCH_CAP = 50;

export interface CaptainResult {
  elementId: number;
  name: string;
  /** player's raw points this GW */
  basePoints: number;
  multiplier: number;
  /** basePoints * multiplier */
  haul: number;
  tripleCaptain: boolean;
  /** true when the captain didn't play and the vice-captain took the armband */
  viceUsed: boolean;
}

export interface ManagerGameweek {
  entryId: number;
  managerName: string;
  teamName: string;
  /** gross gameweek points */
  points: number;
  transfersCost: number;
  /** points - transfersCost */
  net: number;
  /** season total after this GW (FPL totals already include hits) */
  total: number;
  /** league rank after this GW (computed within the analysed set) */
  rank: number;
  /** league rank before this GW; null for managers with no prior total */
  prevRank: number | null;
  benchPoints: number;
  transfers: number;
  chip: string | null;
  captain: CaptainResult | null;
}

export const net = (points: number, transfersCost: number): number => points - transfersCost;

/**
 * Standard competition ranking ("1224"): equal values share a rank.
 * Returns ranks in the same order as `values` (higher value = better rank).
 */
export function competitionRanks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => b - a);
  return values.map((v) => sorted.indexOf(v) + 1);
}

/** All items sharing the maximum value of `fn` (empty input -> empty output). */
export function maxBy<T>(items: T[], fn: (t: T) => number): T[] {
  if (items.length === 0) return [];
  const best = Math.max(...items.map(fn));
  return items.filter((t) => fn(t) === best);
}

export function minBy<T>(items: T[], fn: (t: T) => number): T[] {
  return maxBy(items, (t) => -fn(t));
}

export function resolveCaptain(
  picks: RawPicks,
  livePoints: Map<number, { points: number; minutes: number }>,
  elementName: (id: number) => string,
): CaptainResult | null {
  const captain = picks.picks.find((p) => p.is_captain);
  if (!captain) return null;
  const vice = picks.picks.find((p) => p.is_vice_captain);
  const tripleCaptain = picks.active_chip === "3xc";
  const multiplier = tripleCaptain ? 3 : 2;

  let chosen = captain;
  let viceUsed = false;
  const capLive = livePoints.get(captain.element);
  if ((capLive?.minutes ?? 0) === 0 && vice && (livePoints.get(vice.element)?.minutes ?? 0) > 0) {
    chosen = vice;
    viceUsed = true;
  }
  const basePoints = livePoints.get(chosen.element)?.points ?? 0;
  return {
    elementId: chosen.element,
    name: elementName(chosen.element),
    basePoints,
    multiplier,
    haul: basePoints * multiplier,
    tripleCaptain,
    viceUsed,
  };
}

export function livePointsMap(live: RawLive): Map<number, { points: number; minutes: number }> {
  return new Map(
    live.elements.map((e) => [e.id, { points: e.stats.total_points, minutes: e.stats.minutes }]),
  );
}

/**
 * Combine standings rows with per-entry picks into per-manager gameweek
 * results, computing league rank before/after the gameweek from totals.
 * Rows without picks (e.g. joined after the GW) are skipped.
 */
export function buildManagerGameweeks(
  rows: RawStandingRow[],
  picksByEntry: Map<number, RawPicks>,
  live: RawLive,
  elementName: (id: number) => string,
): ManagerGameweek[] {
  const liveMap = livePointsMap(live);
  const base = rows.flatMap((row) => {
    const p = picksByEntry.get(row.entry);
    if (!p) return [];
    const h = p.entry_history;
    const n = net(h.points, h.event_transfers_cost);
    return [{
      entryId: row.entry,
      managerName: row.player_name,
      teamName: row.entry_name,
      points: h.points,
      transfersCost: h.event_transfers_cost,
      net: n,
      total: h.total_points,
      prevTotal: h.total_points - n,
      // prevTotal of 0 means GW1 or a manager who joined this GW: no movement.
      hadPrior: h.total_points - n !== 0,
      benchPoints: h.points_on_bench,
      transfers: h.event_transfers,
      chip: p.active_chip,
      captain: resolveCaptain(p, liveMap, elementName),
    }];
  });

  const ranks = competitionRanks(base.map((m) => m.total));
  const prevRanks = competitionRanks(base.map((m) => m.prevTotal));
  return base.map(({ prevTotal: _p, hadPrior, ...m }, i) => ({
    ...m,
    rank: ranks[i]!,
    prevRank: hadPrior ? prevRanks[i]! : null,
  }));
}

export interface GameweekStats {
  winners: ManagerGameweek[];
  spoons: ManagerGameweek[];
  leagueAverage: number;
  climbers: { managers: ManagerGameweek[]; places: number } | null;
  fallers: { managers: ManagerGameweek[]; places: number } | null;
  bestCaptains: ManagerGameweek[];
  worstCaptains: ManagerGameweek[];
  mostCaptained: { name: string; count: number } | null;
  benchShame: ManagerGameweek[];
  hits: ManagerGameweek[];
  chips: ManagerGameweek[];
  table: ManagerGameweek[];
}

export function gameweekStats(managers: ManagerGameweek[]): GameweekStats {
  const leagueAverage = managers.length
    ? Math.round((managers.reduce((s, m) => s + m.net, 0) / managers.length) * 10) / 10
    : 0;

  const movement = managers.filter((m) => m.prevRank !== null).map((m) => ({
    m,
    delta: m.prevRank! - m.rank,
  }));
  const up = maxBy(movement.filter((x) => x.delta > 0), (x) => x.delta);
  const down = minBy(movement.filter((x) => x.delta < 0), (x) => x.delta);

  const withCaptain = managers.filter((m) => m.captain);
  const captainCounts = new Map<string, number>();
  for (const m of withCaptain) {
    captainCounts.set(m.captain!.name, (captainCounts.get(m.captain!.name) ?? 0) + 1);
  }
  const topCap = [...captainCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const bestCaptains = maxBy(withCaptain, (m) => m.captain!.haul);
  const worstCaptains = minBy(withCaptain, (m) => m.captain!.haul);
  const benchMax = maxBy(managers, (m) => m.benchPoints);

  return {
    winners: maxBy(managers, (m) => m.net),
    spoons: managers.length > 1 ? minBy(managers, (m) => m.net) : [],
    leagueAverage,
    climbers: up.length ? { managers: up.map((x) => x.m), places: up[0]!.delta } : null,
    fallers: down.length ? { managers: down.map((x) => x.m), places: -down[0]!.delta } : null,
    bestCaptains,
    // Only interesting if it differs from the best.
    worstCaptains:
      bestCaptains[0] && worstCaptains[0] && worstCaptains[0].captain!.haul < bestCaptains[0].captain!.haul
        ? worstCaptains
        : [],
    mostCaptained: topCap ? { name: topCap[0], count: topCap[1] } : null,
    benchShame: benchMax[0] && benchMax[0].benchPoints > 0 ? benchMax : [],
    hits: managers.filter((m) => m.transfersCost > 0).sort((a, b) => b.transfersCost - a.transfersCost),
    chips: managers.filter((m) => m.chip),
    table: [...managers].sort((a, b) => a.rank - b.rank || b.net - a.net),
  };
}

/** Gameweek ids whose deadline falls in the given month (1-12) and year (UTC). */
export function gameweeksInMonth(events: RawEvent[], month: number, year: number): number[] {
  return events
    .filter((e) => {
      const d = new Date(e.deadline_time);
      return d.getUTCMonth() + 1 === month && d.getUTCFullYear() === year;
    })
    .map((e) => e.id);
}

export interface MonthlyRow {
  entryId: number;
  managerName: string;
  teamName: string;
  /** net points across the month's gameweeks */
  points: number;
  /** number of gameweeks counted (some may not have been played yet) */
  gameweeksPlayed: number;
  rank: number;
}

export function monthlyTable(
  rows: RawStandingRow[],
  histories: Map<number, RawEntryHistory>,
  gameweeks: number[],
): MonthlyRow[] {
  const gwSet = new Set(gameweeks);
  const base = rows.flatMap((row) => {
    const h = histories.get(row.entry);
    if (!h) return [];
    const counted = h.current.filter((e) => gwSet.has(e.event));
    return [{
      entryId: row.entry,
      managerName: row.player_name,
      teamName: row.entry_name,
      points: counted.reduce((s, e) => s + net(e.points, e.event_transfers_cost), 0),
      gameweeksPlayed: counted.length,
    }];
  });
  const ranks = competitionRanks(base.map((r) => r.points));
  return base
    .map((r, i) => ({ ...r, rank: ranks[i]! }))
    .sort((a, b) => a.rank - b.rank || a.managerName.localeCompare(b.managerName));
}

const CHIP_LABELS: Record<string, string> = {
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
  wildcard: "Wildcard",
  manager: "Assistant Manager",
};

export const chipLabel = (chip: string): string => CHIP_LABELS[chip] ?? chip;

/** "▲2", "▼1", "–" or "NEW" */
export function movementArrow(prevRank: number | null | undefined, rank: number): string {
  if (prevRank === null || prevRank === undefined || prevRank === 0) return "NEW";
  if (prevRank > rank) return `▲${prevRank - rank}`;
  if (prevRank < rank) return `▼${rank - prevRank}`;
  return "–";
}
