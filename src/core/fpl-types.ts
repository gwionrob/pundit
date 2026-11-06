/** Typed subsets of the raw FPL API responses we consume. */

export interface RawEvent {
  id: number;
  name: string;
  deadline_time: string;
  average_entry_score: number;
  finished: boolean;
  data_checked: boolean;
  highest_score: number | null;
  is_previous: boolean;
  is_current: boolean;
  is_next: boolean;
}

export interface RawElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
}

export interface RawBootstrap {
  events: RawEvent[];
  elements: RawElement[];
}

export interface RawStandingRow {
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  last_rank: number;
  rank_sort: number;
  total: number;
  event_total: number;
}

export interface RawStandingsPage {
  league: { id: number; name: string };
  standings: { has_next: boolean; page: number; results: RawStandingRow[] };
}

export interface RawStandings {
  league: { id: number; name: string };
  results: RawStandingRow[];
}

export interface RawEntryEventHistory {
  event: number;
  points: number;
  total_points: number;
  rank: number | null;
  overall_rank: number | null;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
}

export interface RawChipPlay {
  name: string;
  time: string;
  event: number;
}

export interface RawEntryHistory {
  current: RawEntryEventHistory[];
  chips: RawChipPlay[];
}

export interface RawPick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface RawPicks {
  active_chip: string | null;
  entry_history: RawEntryEventHistory;
  picks: RawPick[];
}

export interface RawLiveElement {
  id: number;
  stats: { total_points: number; minutes: number };
}

export interface RawLive {
  elements: RawLiveElement[];
}
