import type { GameEvent, GameState, Report } from "../../src/core/index.ts";
import { openDb } from "../../src/db/db.ts";
import { Repo } from "../../src/db/repo.ts";

export const memRepo = () => new Repo(openDb(":memory:"));

export function fakeReport(over: Partial<Report> = {}): Report {
  return {
    kind: "gameweek",
    leagueId: 123,
    leagueName: "Test League",
    title: "Gameweek 9 Bulletin",
    period: { gameweek: 9 },
    generatedAt: "2026-11-02T22:00:00.000Z",
    sections: [{ heading: "🏆 Gameweek winner", lines: [{ segments: [{ bold: "Ann" }, " — 80 pts"] }] }],
    ...over,
  };
}

export function ev(id: number, deadline: string, extra: Partial<GameEvent> = {}): GameEvent {
  return {
    id,
    name: `Gameweek ${id}`,
    deadline,
    finished: true,
    dataChecked: true,
    isCurrent: false,
    isNext: false,
    ...extra,
  };
}

export function state(events: GameEvent[], lastCompletedEvent: number | null): GameState {
  return { events, currentEvent: lastCompletedEvent, lastCompletedEvent };
}
