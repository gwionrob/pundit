/**
 * `pundit`: generate a mini-league bulletin from the terminal.
 * Output goes to stdout (pipe-friendly); status notes go to stderr.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  buildGameweekReport,
  buildMonthlyReport,
  buildStandingsReport,
  FplError,
  renderReport,
  type Report,
} from "../core/index.ts";
import {
  clipboardCommands,
  HELP,
  openCommand,
  parseCli,
  UsageError,
  whatsappShareUrl,
  type CliAction,
} from "./args.ts";

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

/** Run a command, optionally feeding stdin. Rejects with ENOENT if missing. */
function exec(cmd: string, args: string[], input?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input === undefined ? "ignore" : "pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
    if (input !== undefined) child.stdin!.end(input);
  });
}

async function copyToClipboard(text: string): Promise<void> {
  const candidates = clipboardCommands(process.platform);
  for (const [cmd, args] of candidates) {
    try {
      await exec(cmd, args, text);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  throw new Error(`No clipboard tool found (tried ${candidates.map(([c]) => c).join(", ")}). Pipe the output instead.`);
}

async function openUrl(url: string): Promise<void> {
  const [cmd, args] = openCommand(process.platform, url);
  try {
    await exec(cmd, args);
  } catch (err) {
    throw new Error(`Couldn't open your browser (${cmd}): ${(err as Error).message}`);
  }
}

function buildReport(action: Extract<CliAction, { kind: "report" }>): Promise<Report> {
  switch (action.command) {
    case "gameweek":
      return buildGameweekReport(action.leagueId, { gameweek: action.gameweek });
    case "monthly":
      return buildMonthlyReport(action.leagueId, { month: action.month, year: action.year });
    case "standings":
      return buildStandingsReport(action.leagueId, { top: action.top });
  }
}

export function friendlyError(err: unknown): string {
  if (err instanceof FplError) {
    switch (err.code) {
      case "updating":
        return "FPL is updating, try again in a bit.";
      case "rate_limited":
        return "FPL is rate-limiting us, wait a minute and try again.";
      case "network":
        return "Couldn't reach the FPL website. Check your connection.";
      case "not_found":
        return err.message;
      case "bad_response":
        return `FPL sent back something unexpected (${err.message}).`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export async function main(argv: string[]): Promise<number> {
  let action: CliAction;
  try {
    action = parseCli(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`pundit: ${err.message}\n`);
      console.error(HELP[err.topic ?? "main"]);
      return 2;
    }
    throw err;
  }

  if (action.kind === "version") {
    console.log(version());
    return 0;
  }
  if (action.kind === "help") {
    console.log(HELP[action.topic ?? "main"]);
    return 0;
  }

  try {
    const report = await buildReport(action);
    const text = renderReport(report, action.whatsapp ? "whatsapp" : action.format);

    if (!action.copy && !action.whatsapp) {
      process.stdout.write(text + "\n");
      return 0;
    }
    if (action.copy) {
      await copyToClipboard(text);
      console.error(`✓ Copied "${report.title}" to your clipboard.`);
    }
    if (action.whatsapp) {
      await openUrl(whatsappShareUrl(text));
      console.error("✓ Opened WhatsApp. Choose your group and tap send.");
    }
    return 0;
  } catch (err) {
    console.error(`pundit: ${friendlyError(err)}`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
