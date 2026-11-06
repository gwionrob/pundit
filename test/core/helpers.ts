import { readFileSync } from "node:fs";
import type { RawPicks, RawLive } from "../../src/core/fpl-types.ts";

export const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as T;

/** Build a minimal picks payload for synthetic tests. */
export function makePicks(opts: {
  event?: number;
  points: number;
  total: number;
  cost?: number;
  bench?: number;
  transfers?: number;
  chip?: string | null;
  captain: number;
  vice: number;
}): RawPicks {
  return {
    active_chip: opts.chip ?? null,
    entry_history: {
      event: opts.event ?? 9,
      points: opts.points,
      total_points: opts.total,
      rank: null,
      overall_rank: null,
      bank: 0,
      value: 1000,
      event_transfers: opts.transfers ?? 0,
      event_transfers_cost: opts.cost ?? 0,
      points_on_bench: opts.bench ?? 0,
    },
    picks: [
      { element: opts.captain, position: 1, multiplier: 2, is_captain: true, is_vice_captain: false },
      { element: opts.vice, position: 2, multiplier: 1, is_captain: false, is_vice_captain: true },
    ],
  };
}

export const makeLive = (players: Record<number, [points: number, minutes: number]>): RawLive => ({
  elements: Object.entries(players).map(([id, [points, minutes]]) => ({
    id: Number(id),
    stats: { total_points: points, minutes },
  })),
});

export const row = (entry: number, name: string, rank = 1, last_rank = 1, total = 0) => ({
  entry,
  entry_name: `${name} FC`,
  player_name: name,
  rank,
  last_rank,
  rank_sort: rank,
  total,
  event_total: 0,
});
