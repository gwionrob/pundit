/**
 * Shared contract between the stats engine (src/core) and the app
 * (src/web, src/db, src/delivery, src/jobs).
 *
 * The app ONLY imports from `src/core/index.ts`, which must export:
 *
 *   parseLeagueId(input: string): number | null
 *   getLeagueInfo(leagueId: number, client?: FplClient): Promise<LeagueInfo>
 *   getGameState(client?: FplClient): Promise<GameState>
 *   buildGameweekReport(leagueId: number, opts?: { gameweek?: number; client?: FplClient }): Promise<Report>
 *   buildMonthlyReport(leagueId: number, opts?: { month?: number; year?: number; client?: FplClient }): Promise<Report>
 *   buildStandingsReport(leagueId: number, opts?: { top?: number; client?: FplClient }): Promise<Report>
 *   renderReport(report: Report, format: RenderFormat, opts?: { footer?: string }): string
 *   FplClient (class), FplError (class)
 *   ...and re-export everything in this file.
 */

export type ReportKind = "gameweek" | "monthly" | "standings";

/** Formats a report can be rendered to. */
export type RenderFormat =
  | "whatsapp" // *bold*, plain text, emoji — also used for the WhatsApp share link
  | "telegram" // Telegram HTML parse_mode (<b>, escaped &<>)
  | "discord" // Discord markdown (**bold**), escaped
  | "plain" // no markup at all
  | "terminal" // ANSI bold/colour for a TTY (or no codes with { color: false }); indented, no * markup
  | "html"; // HTML fragment for the web preview (escaped, <section>/<h3>/<p>)

/** A run of inline text. Renderers decide how to mark up `bold`. */
export type Segment = string | { bold: string };

export interface ReportLine {
  segments: Segment[];
}

export interface ReportSection {
  /** e.g. "🏆 Gameweek winner" — emoji included in the heading text */
  heading: string;
  lines: ReportLine[];
}

export interface Report {
  kind: ReportKind;
  leagueId: number;
  leagueName: string;
  /** e.g. "Gameweek 9 Bulletin" / "Manager of the Month — October" / "League Standings" */
  title: string;
  /** e.g. "The Walrus League" or "GW9 · avg 47" */
  subtitle?: string;
  period: { gameweek?: number; month?: number; year?: number };
  sections: ReportSection[];
  /** ISO timestamp */
  generatedAt: string;
}

export interface LeagueInfo {
  id: number;
  name: string;
  memberCount: number;
}

export interface GameEvent {
  id: number;
  name: string;
  /** ISO timestamp */
  deadline: string;
  finished: boolean;
  /** true once FPL has finalised points (bonus etc.) for the gameweek */
  dataChecked: boolean;
  isCurrent: boolean;
  isNext: boolean;
}

export interface GameState {
  events: GameEvent[];
  /** id of the current gameweek, null before the season starts */
  currentEvent: number | null;
  /** most recent gameweek with dataChecked === true, null if none */
  lastCompletedEvent: number | null;
}
