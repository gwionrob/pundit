/**
 * Pure argument parsing and platform helpers for the `pundit` command.
 * No I/O here so it's unit-testable; src/cli/main.ts does the side effects.
 */
import { parseArgs } from "node:util";
import { parseLeagueId } from "../core/league-id.ts";
import type { RenderFormat } from "../core/types.ts";

export const COMMANDS = ["gameweek", "monthly", "standings"] as const;
export type Command = (typeof COMMANDS)[number];

export const FORMATS = ["whatsapp", "telegram", "discord", "plain"] as const satisfies readonly RenderFormat[];
export type CliFormat = (typeof FORMATS)[number];

export type CliAction =
  | { kind: "help"; topic?: Command }
  | { kind: "version" }
  | {
      kind: "report";
      command: Command;
      leagueId: number;
      gameweek?: number;
      month?: number;
      year?: number;
      top?: number;
      format: CliFormat;
      copy: boolean;
      whatsapp: boolean;
    };

/** Bad usage: main prints the message plus usage and exits 2. */
export class UsageError extends Error {
  constructor(message: string, readonly topic?: Command) {
    super(message);
    this.name = "UsageError";
  }
}

const GLOBAL_OPTIONS = `Options:
  --format <fmt>  whatsapp | telegram | discord | plain  (default: whatsapp)
  --copy          copy the bulletin to your clipboard
  --whatsapp      open WhatsApp with the bulletin ready to send
  -h, --help      show help
  -v, --version   show version`;

export const HELP: Record<"main" | Command, string> = {
  main: `pundit: weekly bulletins for your Fantasy Premier League mini-league

Usage:
  pundit gameweek  <league> [--gw N]
  pundit monthly   <league> [--month M] [--year Y]
  pundit standings <league> [--top N]
  pundit help <command>

<league> is a league ID (e.g. 340312) or a league URL from the FPL site.

${GLOBAL_OPTIONS}

Examples:
  pundit gameweek 340312
  pundit monthly 340312 --month 10 --copy
  pundit standings https://fantasy.premierleague.com/leagues/340312/standings/c --whatsapp`,
  gameweek: `Usage: pundit gameweek <league> [--gw N]

Gameweek bulletin: winner, wooden spoon, averages, climbers and fallers,
captaincy, bench of shame, hits, chips and the top 5.

  --gw N   gameweek to report (default: latest completed gameweek)

${GLOBAL_OPTIONS}`,
  monthly: `Usage: pundit monthly <league> [--month M] [--year Y]

Manager of the Month: net points across gameweeks whose deadline falls in the month.

  --month M   month 1-12 (default: month of the latest gameweek)
  --year Y    year (default: current year)

${GLOBAL_OPTIONS}`,
  standings: `Usage: pundit standings <league> [--top N]

Current league table with movement since last gameweek.

  --top N   number of places to show (default: 10)

${GLOBAL_OPTIONS}`,
};

const COMMAND_FLAGS: Record<Command, string[]> = {
  gameweek: ["gw"],
  monthly: ["month", "year"],
  standings: ["top"],
};

const isCommand = (s: string | undefined): s is Command => COMMANDS.includes(s as Command);

function positiveInt(value: string | undefined, flag: string, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1 || n > max) {
    throw new UsageError(`--${flag} must be a whole number${max < Number.MAX_SAFE_INTEGER ? ` from 1 to ${max}` : " above 0"}, got "${value}"`);
  }
  return n;
}

export function parseCli(argv: string[]): CliAction {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        gw: { type: "string" },
        month: { type: "string" },
        year: { type: "string" },
        top: { type: "string" },
        format: { type: "string" },
        copy: { type: "boolean", default: false },
        whatsapp: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (err) {
    // Keep the first sentence of node's message, e.g. "Unknown option '--foo'"
    throw new UsageError((err as Error).message.split(". ")[0]!);
  }
  const { values, positionals } = parsed;
  const [first, second, ...extra] = positionals;

  if (values.version) return { kind: "version" };
  if (first === "help") {
    if (second !== undefined && !isCommand(second)) throw new UsageError(`Unknown command "${second}"`);
    return { kind: "help", topic: second };
  }
  if (values.help || first === undefined) return { kind: "help", topic: isCommand(first) ? first : undefined };
  if (!isCommand(first)) throw new UsageError(`Unknown command "${first}". Try: ${COMMANDS.join(", ")}`);

  const command = first;
  if (second === undefined) throw new UsageError("Missing <league>: give a league ID or league URL", command);
  if (extra.length) throw new UsageError(`Unexpected argument "${extra[0]}"`, command);
  const leagueId = parseLeagueId(second);
  if (leagueId === null) {
    throw new UsageError(`"${second}" isn't a league ID or FPL league URL`, command);
  }

  for (const flag of ["gw", "month", "year", "top"] as const) {
    if (values[flag] !== undefined && !COMMAND_FLAGS[command].includes(flag)) {
      throw new UsageError(`--${flag} doesn't apply to "${command}"`, command);
    }
  }

  const format = (values.format ?? "whatsapp") as CliFormat;
  if (!FORMATS.includes(format)) {
    throw new UsageError(`Unknown format "${values.format}". Choose: ${FORMATS.join(", ")}`, command);
  }
  if (values.whatsapp && values.format && format !== "whatsapp") {
    throw new UsageError("--whatsapp always uses WhatsApp formatting; drop --format", command);
  }

  return {
    kind: "report",
    command,
    leagueId,
    gameweek: positiveInt(values.gw, "gw", 38),
    month: positiveInt(values.month, "month", 12),
    year: positiveInt(values.year, "year", 9999),
    top: positiveInt(values.top, "top"),
    format,
    copy: values.copy,
    whatsapp: values.whatsapp,
  };
}

// api.whatsapp.com, not wa.me: wa.me's redirect turns emoji into "�" (see src/delivery/whatsapp.ts).
export const whatsappShareUrl = (text: string): string =>
  `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

/** Candidate clipboard commands for a platform, tried in order. */
export function clipboardCommands(platform: NodeJS.Platform): Array<[cmd: string, args: string[]]> {
  if (platform === "darwin") return [["pbcopy", []]];
  if (platform === "win32") return [["clip", []]];
  return [
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]],
  ];
}

/** Command to open a URL in the default browser. */
export function openCommand(platform: NodeJS.Platform, url: string): [cmd: string, args: string[]] {
  if (platform === "darwin") return ["open", [url]];
  // `start` goes through cmd.exe, which mangles '&' in URLs; this doesn't.
  if (platform === "win32") return ["rundll32", ["url.dll,FileProtocolHandler", url]];
  return ["xdg-open", [url]];
}
