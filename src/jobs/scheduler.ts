import { Cron } from "croner";
import type { GameEvent, GameState, Report } from "../core/index.ts";
import type { League, Repo, StoredReport } from "../db/repo.ts";

export const LAST_GW_KEY = "last_gw_processed";
/** JSON {at, status} of the most recent scheduler pass, shown on the admin dashboard. */
export const LAST_TICK_KEY = "scheduler_last_tick";

/** The subset of the stats engine the scheduler needs (injectable for tests). */
export interface SchedulerCore {
  getGameState(): Promise<GameState>;
  buildGameweekReport(leagueId: number, opts: { gameweek: number }): Promise<Report>;
  buildMonthlyReport(leagueId: number, opts: { month: number; year: number }): Promise<Report>;
  /** true when FPL is mid-update and we should retry later */
  isUpdating(err: unknown): boolean;
}

export interface TickDeps {
  repo: Repo;
  core: SchedulerCore;
  deliver(stored: StoredReport): Promise<unknown>;
  log?: (msg: string) => void;
}

export type TickResult =
  | { status: "no-data" }
  | { status: "initialised"; gameweek: number }
  | { status: "up-to-date"; gameweek: number }
  | { status: "updating" }
  | { status: "processed"; gameweek: number; reports: number; monthly: { month: number; year: number }[] };

class UpdatingSignal extends Error {}

function ym(iso: string): { month: number; year: number } {
  const d = new Date(iso);
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

/** True when `gw` is the last gameweek whose deadline falls in its calendar month. */
export function isLastGameweekOfMonth(events: GameEvent[], gw: number): boolean {
  const ev = events.find((e) => e.id === gw);
  if (!ev) return false;
  const next = events.find((e) => e.id === gw + 1);
  if (!next) return true;
  const a = ym(ev.deadline);
  const b = ym(next.deadline);
  return a.month !== b.month || a.year !== b.year;
}

/**
 * One scheduler pass. Detects newly completed gameweeks, builds + stores
 * bulletins for subscribed leagues and delivers them. Safe to call
 * repeatedly: reports are de-duplicated and deliveries are idempotent.
 */
export async function runTick(deps: TickDeps): Promise<TickResult> {
  const { repo, core } = deps;
  const log = deps.log ?? ((m: string) => console.log(`[scheduler] ${m}`));

  let state: GameState;
  try {
    state = await core.getGameState();
  } catch (e) {
    if (core.isUpdating(e)) {
      log("FPL is updating; will retry next tick");
      return { status: "updating" };
    }
    throw e;
  }

  const latest = state.lastCompletedEvent;
  if (latest == null) return { status: "no-data" };

  const stored = repo.getState(LAST_GW_KEY);
  if (stored === undefined) {
    // First run: don't backfill old gameweeks.
    repo.setState(LAST_GW_KEY, String(latest));
    log(`initialised at GW${latest}`);
    return { status: "initialised", gameweek: latest };
  }
  const processed = Number(stored);
  if (latest <= processed) return { status: "up-to-date", gameweek: processed };

  if (latest - processed > 1) {
    log(`catching up GW${processed + 1}–GW${latest}; only GW${latest} gets a gameweek bulletin`);
  }

  // Run a job per league; a FPL "updating" error aborts the whole tick so we
  // retry later without advancing state. Other errors are per-league.
  const forEachLeague = async (leagues: League[], job: (l: League) => Promise<void>) => {
    for (const league of leagues) {
      try {
        await job(league);
      } catch (e) {
        if (core.isUpdating(e)) throw new UpdatingSignal();
        log(`league ${league.id} (${league.fpl_league_id}) failed: ${(e as Error).message}`);
      }
    }
  };

  let reports = 0;
  const monthly: { month: number; year: number }[] = [];
  try {
    await forEachLeague(repo.leaguesWithAuto("gameweek"), async (league) => {
      const report = await core.buildGameweekReport(league.fpl_league_id, { gameweek: latest });
      const { stored: saved } = repo.saveReport(league.id, report);
      if (report.leagueName && report.leagueName !== league.name) repo.updateLeagueName(league.id, report.leagueName);
      await deps.deliver(saved);
      reports += 1;
    });

    // Monthly bulletins: the most recent month that closed within the new range.
    for (let gw = latest; gw > processed; gw--) {
      if (!isLastGameweekOfMonth(state.events, gw)) continue;
      const ev = state.events.find((e) => e.id === gw)!;
      const period = ym(ev.deadline);
      await forEachLeague(repo.leaguesWithAuto("monthly"), async (league) => {
        const report = await core.buildMonthlyReport(league.fpl_league_id, period);
        const { stored: saved } = repo.saveReport(league.id, report);
        await deps.deliver(saved);
        reports += 1;
      });
      monthly.push(period);
      break;
    }
  } catch (e) {
    if (e instanceof UpdatingSignal) {
      log("FPL started updating mid-run; will retry next tick");
      return { status: "updating" };
    }
    throw e;
  }

  repo.setState(LAST_GW_KEY, String(latest));
  log(
    `processed GW${latest}: ${reports} bulletin(s)${monthly.length ? `, monthly ${monthly[0]!.year}-${monthly[0]!.month}` : ""}`,
  );
  return { status: "processed", gameweek: latest, reports, monthly };
}

/** Starts the recurring scheduler (every 15 min + once shortly after boot). */
export function startScheduler(deps: TickDeps, { bootDelayMs = 10_000 } = {}): { stop(): void } {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    let status: string;
    try {
      status = (await runTick(deps)).status;
    } catch (e) {
      status = "error";
      console.error("[scheduler] tick failed:", e);
    }
    try {
      deps.repo.setState(LAST_TICK_KEY, JSON.stringify({ at: new Date().toISOString(), status }));
    } catch (e) {
      console.error("[scheduler] couldn't record tick:", e);
    } finally {
      running = false;
    }
  };
  const job = new Cron("*/15 * * * *", { protect: true }, tick);
  const boot = setTimeout(tick, bootDelayMs);
  return {
    stop() {
      job.stop();
      clearTimeout(boot);
    },
  };
}
