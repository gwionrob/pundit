import { defaultClient, FplClient, FplError } from "./fpl-client.ts";
import type { RawBootstrap, RawEntryHistory, RawPicks, RawStandingRow } from "./fpl-types.ts";
import {
  buildManagerGameweeks,
  chipLabel,
  ENTRY_FETCH_CAP,
  gameweeksInMonth,
  gameweekStats,
  maxBy,
  minBy,
  monthlyTable,
  movementArrow,
  type ManagerGameweek,
} from "./stats.ts";
import type { GameState, LeagueInfo, Report, ReportLine, ReportSection, Segment } from "./types.ts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const line = (...segments: Segment[]): ReportLine => ({ segments });
const b = (text: string | number): Segment => ({ bold: String(text) });
const pts = (n: number) => `${n} pt${Math.abs(n) === 1 ? "" : "s"}`;

/** "Alice & Bob" / "Alice, Bob & Carol" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

/** Max names listed for a tie before collapsing to "+ N others". */
const MAX_TIED_NAMES = 3;

/**
 * Bold manager names joined with "&". A lone manager gets their team name in
 * brackets; big ties collapse to "A, B, C + 4 others" to keep messages short.
 */
function managers(list: { managerName: string; teamName: string }[]): Segment[] {
  if (list.length === 1) return [b(list[0]!.managerName), ` (${list[0]!.teamName})`];
  const shown = list.slice(0, MAX_TIED_NAMES);
  const rest = list.length - shown.length;
  const out: Segment[] = [];
  shown.forEach((m, i) => {
    if (i > 0) out.push(i === shown.length - 1 && rest === 0 ? " & " : ", ");
    out.push(b(m.managerName));
  });
  if (rest > 0) out.push(` + ${rest} other${rest === 1 ? "" : "s"}`);
  return out;
}

const now = () => new Date().toISOString();

export async function getLeagueInfo(leagueId: number, client: FplClient = defaultClient): Promise<LeagueInfo> {
  const s = await client.standings(leagueId);
  return { id: s.league.id, name: s.league.name, memberCount: s.results.length };
}

export async function getGameState(client: FplClient = defaultClient): Promise<GameState> {
  const bs = await client.bootstrap();
  return gameStateFromBootstrap(bs);
}

export function gameStateFromBootstrap(bs: RawBootstrap): GameState {
  const events = bs.events.map((e) => ({
    id: e.id,
    name: e.name,
    deadline: e.deadline_time,
    finished: e.finished,
    dataChecked: e.data_checked,
    isCurrent: e.is_current,
    isNext: e.is_next,
  }));
  const current = events.find((e) => e.isCurrent);
  const completed = events.filter((e) => e.dataChecked);
  return {
    events,
    currentEvent: current?.id ?? null,
    lastCompletedEvent: completed.at(-1)?.id ?? null,
  };
}

/** Fetch per-entry data for up to ENTRY_FETCH_CAP rows; 404s are skipped. */
async function fetchPerEntry<T>(
  rows: RawStandingRow[],
  fetchOne: (entryId: number) => Promise<T>,
): Promise<Map<number, T>> {
  const out = new Map<number, T>();
  await Promise.all(
    rows.map(async (row) => {
      try {
        out.set(row.entry, await fetchOne(row.entry));
      } catch (err) {
        if (err instanceof FplError && err.code === "not_found") return;
        throw err;
      }
    }),
  );
  return out;
}

const STANDINGS_PAGE_SIZE = 50;
/** Standings pages needed to cover ENTRY_FETCH_CAP, plus one to detect "capped". */
const CAP_PAGES = Math.ceil(ENTRY_FETCH_CAP / STANDINGS_PAGE_SIZE) + 1;

function capRows(rows: RawStandingRow[]): { rows: RawStandingRow[]; capped: boolean } {
  const sorted = [...rows].sort((a, b) => a.rank_sort - b.rank_sort || a.rank - b.rank);
  return { rows: sorted.slice(0, ENTRY_FETCH_CAP), capped: sorted.length > ENTRY_FETCH_CAP };
}

const capNote = (): ReportSection => ({
  heading: "ℹ️ Note",
  lines: [line(`Big league! Detailed stats cover the top ${ENTRY_FETCH_CAP} managers.`)],
});

// ---------------------------------------------------------------------------
// Gameweek bulletin
// ---------------------------------------------------------------------------

export async function buildGameweekReport(
  leagueId: number,
  opts: { gameweek?: number; client?: FplClient } = {},
): Promise<Report> {
  const client = opts.client ?? defaultClient;
  const [bs, standings] = await Promise.all([client.bootstrap(), client.standings(leagueId, CAP_PAGES)]);
  const state = gameStateFromBootstrap(bs);
  const gameweek = opts.gameweek ?? state.lastCompletedEvent ?? state.currentEvent;
  if (!gameweek) throw new FplError("not_found", "The season hasn't started yet — no gameweeks to report.");
  const event = bs.events.find((e) => e.id === gameweek);
  if (!event) throw new FplError("not_found", `Gameweek ${gameweek} doesn't exist.`);

  const final = event.finished && event.data_checked;
  const { rows, capped } = capRows(standings.results);
  const [live, picks] = await Promise.all([
    client.live(gameweek, final),
    fetchPerEntry<RawPicks>(rows, (id) => client.picks(id, gameweek, final)),
  ]);

  const names = new Map(bs.elements.map((e) => [e.id, e.web_name]));
  let managersGw = buildManagerGameweeks(rows, picks, live, (id) => names.get(id) ?? `#${id}`);

  // Standings reflect the current gameweek; for it, prefer FPL's official ranks
  // (they include tie-breaks and cover managers beyond the fetch cap).
  if (gameweek === state.currentEvent) {
    const byEntry = new Map(rows.map((r) => [r.entry, r]));
    managersGw = managersGw.map((m) => {
      const row = byEntry.get(m.entryId)!;
      return { ...m, rank: row.rank, prevRank: row.last_rank > 0 ? row.last_rank : null };
    });
  }

  return composeGameweekReport({
    leagueId,
    leagueName: standings.league.name,
    gameweek,
    globalAverage: event.average_entry_score,
    provisional: !final,
    capped,
    managers: managersGw,
  });
}

export interface GameweekReportInput {
  leagueId: number;
  leagueName: string;
  gameweek: number;
  globalAverage: number;
  provisional: boolean;
  capped: boolean;
  managers: ManagerGameweek[];
}

/** Pure: turn computed manager results into a Report. */
export function composeGameweekReport(input: GameweekReportInput): Report {
  const s = gameweekStats(input.managers);
  const sections: ReportSection[] = [];

  if (input.managers.length === 0) {
    sections.push({ heading: "🤷 Nothing to report", lines: [line("No managers played this gameweek.")] });
  }

  if (s.winners.length) {
    const top = s.winners[0]!;
    sections.push({
      heading: s.winners.length > 1 ? "🏆 Gameweek winners" : "🏆 Gameweek winner",
      lines: [
        line(
          ...managers(s.winners),
          " — ",
          b(pts(top.net)),
          ...(s.winners.length === 1 && top.transfersCost ? [` (after a -${top.transfersCost} hit)`] : []),
        ),
      ],
    });
  }

  if (s.spoons.length && s.spoons[0]!.net !== s.winners[0]?.net) {
    const bottom = s.spoons[0]!;
    sections.push({
      heading: "🥄 Wooden spoon",
      lines: [
        line(
          ...managers(s.spoons),
          " — ",
          b(pts(bottom.net)),
          ...(s.spoons.length === 1 && bottom.transfersCost ? [` (incl. a -${bottom.transfersCost} hit 😬)`] : []),
        ),
      ],
    });
  }

  if (input.managers.length) {
    sections.push({
      heading: "📊 Averages",
      lines: [
        line("League: ", b(s.leagueAverage), " · Global: ", b(input.globalAverage)),
        line(
          s.leagueAverage >= input.globalAverage
            ? "The league beat the global average 💪"
            : "The league fell short of the global average 📉",
        ),
      ],
    });
  }

  if (s.climbers) {
    sections.push({
      heading: "📈 Biggest climber",
      lines: [
        line(...managers(s.climbers.managers), ` — up ${s.climbers.places} place${s.climbers.places === 1 ? "" : "s"}`),
      ],
    });
  }
  if (s.fallers) {
    sections.push({
      heading: "📉 Biggest faller",
      lines: [
        line(...managers(s.fallers.managers), ` — down ${s.fallers.places} place${s.fallers.places === 1 ? "" : "s"}`),
      ],
    });
  }

  const captainLines: ReportLine[] = [];
  if (s.bestCaptains.length) {
    const c = s.bestCaptains[0]!.captain!;
    captainLines.push(line("Best: ", ...managers(s.bestCaptains), ` — ${capDesc(s.bestCaptains)} `, b(pts(c.haul))));
  }
  if (s.worstCaptains.length) {
    const c = s.worstCaptains[0]!.captain!;
    captainLines.push(line("Worst: ", ...managers(s.worstCaptains), ` — ${capDesc(s.worstCaptains)} `, b(pts(c.haul))));
  }
  if (s.mostCaptained && input.managers.length > 1) {
    captainLines.push(
      line("Most captained: ", b(s.mostCaptained.name), ` (${s.mostCaptained.count}/${input.managers.length})`),
    );
  }
  if (captainLines.length) sections.push({ heading: "©️ Captaincy", lines: captainLines });

  if (s.benchShame.length) {
    sections.push({
      heading: "🪑 Bench of shame",
      lines: [line(...managers(s.benchShame), " left ", b(pts(s.benchShame[0]!.benchPoints)), " on the bench")],
    });
  }

  if (s.hits.length) {
    sections.push({
      heading: "💸 Transfer hits",
      lines: s.hits.map((m) => line(b(m.managerName), ` took a -${m.transfersCost} (${m.transfers} transfers)`)),
    });
  }

  if (s.chips.length) {
    sections.push({
      heading: "🃏 Chips played",
      lines: s.chips.map((m) => line(b(m.managerName), ` — ${chipLabel(m.chip!)} (${pts(m.net)})`)),
    });
  }

  if (s.table.length) {
    sections.push({
      heading: "🔝 Top 5",
      lines: s.table
        .slice(0, 5)
        .map((m) => line(`${m.rank}. `, b(m.managerName), ` — ${m.total} (${movementArrow(m.prevRank, m.rank)})`)),
    });
  }

  if (input.capped) sections.push(capNote());

  const subtitleBits = [input.leagueName];
  if (input.provisional) subtitleBits.push("provisional — bonus points may change");
  return {
    kind: "gameweek",
    leagueId: input.leagueId,
    leagueName: input.leagueName,
    title: `Gameweek ${input.gameweek} Bulletin`,
    subtitle: subtitleBits.join(" · "),
    period: { gameweek: input.gameweek },
    sections,
    generatedAt: now(),
  };
}

function capDesc(list: ManagerGameweek[]): string {
  const caps = [
    ...new Set(
      list.map((m) => {
        const c = m.captain!;
        const tags = [c.tripleCaptain ? "TC" : "", c.viceUsed ? "vice" : ""].filter(Boolean).join(", ");
        return tags ? `${c.name} (${tags})` : c.name;
      }),
    ),
  ];
  return joinNames(caps);
}

// ---------------------------------------------------------------------------
// Manager of the Month
// ---------------------------------------------------------------------------

export async function buildMonthlyReport(
  leagueId: number,
  opts: { month?: number; year?: number; client?: FplClient } = {},
): Promise<Report> {
  const client = opts.client ?? defaultClient;
  const [bs, standings] = await Promise.all([client.bootstrap(), client.standings(leagueId, CAP_PAGES)]);

  // Default to the month of the most recent finished gameweek, so early in a month (before any
  // gameweek has been played) you get last month's Manager of the Month rather than an empty one.
  const lastFinished = bs.events.filter((e) => e.finished).at(-1);
  const anchor = lastFinished ? new Date(lastFinished.deadline_time) : new Date();
  const month = opts.month ?? anchor.getUTCMonth() + 1;
  const year = opts.year ?? (opts.month != null ? new Date().getUTCFullYear() : anchor.getUTCFullYear());
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Month must be 1-12, got ${month}`);
  }

  const gameweeks = gameweeksInMonth(bs.events, month, year);
  const monthName = MONTHS[month - 1]!;
  const base = {
    kind: "monthly" as const,
    leagueId,
    leagueName: standings.league.name,
    title: `Manager of the Month — ${monthName}`,
    period: { month, year },
    generatedAt: now(),
  };

  if (gameweeks.length === 0) {
    return {
      ...base,
      subtitle: `${standings.league.name} · ${monthName} ${year}`,
      sections: [{ heading: "🤷 No gameweeks", lines: [line(`No gameweek deadlines fell in ${monthName} ${year}.`)] }],
    };
  }

  const playable = new Set(bs.events.filter((e) => e.finished || e.is_current).map((e) => e.id));
  const { rows, capped } = capRows(standings.results);
  const histories = await fetchPerEntry<RawEntryHistory>(rows, (id) => client.entryHistory(id));
  const table = monthlyTable(rows, histories, gameweeks);
  const allFinished = gameweeks.every((gw) => bs.events.find((e) => e.id === gw)?.finished);

  const gwLabel = gameweeks.length === 1 ? `GW${gameweeks[0]}` : `GW${gameweeks[0]}–${gameweeks.at(-1)}`;

  return {
    ...base,
    subtitle: [standings.league.name, `${monthName} ${year}`, gwLabel, allFinished ? "" : "so far"]
      .filter(Boolean)
      .join(" · "),
    sections: composeMonthlySections(table, capped, gameweeks.filter((g) => playable.has(g)).length === 0),
  };
}

export function composeMonthlySections(
  table: ReturnType<typeof monthlyTable>,
  capped: boolean,
  notStarted = false,
): ReportSection[] {
  if (notStarted || table.length === 0) {
    return [{ heading: "⏳ Not started", lines: [line("No gameweeks have been played this month yet.")] }];
  }
  const sections: ReportSection[] = [];
  const winners = maxBy(table, (r) => r.points);
  sections.push({
    heading: winners.length > 1 ? "👑 Joint Managers of the Month" : "👑 Manager of the Month",
    lines: [line(...managers(winners), " — ", b(pts(winners[0]!.points)))],
  });

  const medals = ["🥇", "🥈", "🥉"];
  sections.push({
    heading: "🏅 Monthly table",
    lines: table
      .slice(0, 10)
      .map((r) => line(`${r.rank <= 3 ? medals[r.rank - 1] : `${r.rank}.`} `, b(r.managerName), ` — ${pts(r.points)}`)),
  });

  if (table.length > 1) {
    const spoons = minBy(table, (r) => r.points);
    if (spoons[0]!.points !== winners[0]!.points) {
      sections.push({
        heading: "🥄 Wooden spoon of the month",
        lines: [line(...managers(spoons), " — ", b(pts(spoons[0]!.points)))],
      });
    }
  }
  if (capped) sections.push(capNote());
  return sections;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export async function buildStandingsReport(
  leagueId: number,
  opts: { top?: number; client?: FplClient } = {},
): Promise<Report> {
  const client = opts.client ?? defaultClient;
  const top = opts.top ?? 10;
  const [bs, standings] = await Promise.all([
    client.bootstrap(),
    client.standings(leagueId, Math.max(1, Math.ceil(top / STANDINGS_PAGE_SIZE))),
  ]);
  const state = gameStateFromBootstrap(bs);
  const rows = [...standings.results].sort((a, b) => a.rank_sort - b.rank_sort).slice(0, top);

  return {
    kind: "standings",
    leagueId,
    leagueName: standings.league.name,
    title: "League Standings",
    subtitle: [standings.league.name, state.currentEvent ? `after GW${state.currentEvent}` : ""]
      .filter(Boolean)
      .join(" · "),
    period: state.currentEvent ? { gameweek: state.currentEvent } : {},
    sections: rows.length
      ? [
          {
            heading: `📊 Top ${Math.min(top, standings.results.length)}`,
            lines: rows.map((r) =>
              line(
                `${r.rank}. `,
                b(r.player_name),
                ` (${r.entry_name}) — ${r.total} (${movementArrow(r.last_rank, r.rank)})`,
              ),
            ),
          },
        ]
      : [{ heading: "🤷 Empty league", lines: [line("No managers in this league yet.")] }],
    generatedAt: now(),
  };
}
