import { describe, expect, it, vi } from "vitest";
import type { Report } from "../../src/core/index.ts";
import {
  isLastGameweekOfMonth,
  LAST_GW_KEY,
  LAST_TICK_KEY,
  runTick,
  startScheduler,
  type SchedulerCore,
} from "../../src/jobs/scheduler.ts";
import { ev, fakeReport, memRepo, state } from "./helpers.ts";

class Updating extends Error {}

const EVENTS = [
  ev(8, "2026-10-24T10:00:00Z"),
  ev(9, "2026-10-31T11:00:00Z"),
  ev(10, "2026-11-07T11:00:00Z"),
  ev(11, "2026-11-21T11:00:00Z", { finished: false, dataChecked: false }),
];

function setup(last: number | null) {
  const repo = memRepo();
  const user = repo.createUser("a@b.com", "h");
  const l1 = repo.addLeague(user, 111, "One");
  const l2 = repo.addLeague(user, 222, "Two");
  const gs = { current: state(EVENTS, last) };
  const core = {
    getGameState: vi.fn(async () => gs.current),
    buildGameweekReport: vi.fn(async (id: number, o: { gameweek: number }): Promise<Report> =>
      fakeReport({ leagueId: id, title: `GW${o.gameweek}`, period: { gameweek: o.gameweek } }),
    ),
    buildMonthlyReport: vi.fn(async (id: number, o: { month: number; year: number }): Promise<Report> =>
      fakeReport({ kind: "monthly", leagueId: id, title: "MoM", period: o }),
    ),
    isUpdating: (e: unknown) => e instanceof Updating,
  } satisfies SchedulerCore;
  const deliver = vi.fn(async () => {});
  return { repo, l1, l2, gs, core, deliver, deps: { repo, core, deliver, log: () => {} } };
}

describe("isLastGameweekOfMonth", () => {
  it("detects month boundaries", () => {
    expect(isLastGameweekOfMonth(EVENTS, 8)).toBe(false);
    expect(isLastGameweekOfMonth(EVENTS, 9)).toBe(true);
    expect(isLastGameweekOfMonth(EVENTS, 10)).toBe(false);
    expect(isLastGameweekOfMonth(EVENTS, 11)).toBe(true); // no next event
    expect(isLastGameweekOfMonth(EVENTS, 99)).toBe(false);
  });
});

describe("runTick", () => {
  it("initialises without backfilling", async () => {
    const t = setup(8);
    expect(await runTick(t.deps)).toEqual({ status: "initialised", gameweek: 8 });
    expect(t.repo.getState(LAST_GW_KEY)).toBe("8");
    expect(t.core.buildGameweekReport).not.toHaveBeenCalled();
  });

  it("does nothing before the season", async () => {
    const t = setup(null);
    expect((await runTick(t.deps)).status).toBe("no-data");
  });

  it("processes a newly completed gameweek, plus monthly at month end", async () => {
    const t = setup(8);
    await runTick(t.deps);
    t.gs.current = state(EVENTS, 9);
    const res = await runTick(t.deps);
    expect(res).toMatchObject({ status: "processed", gameweek: 9, reports: 4, monthly: [{ month: 10, year: 2026 }] });
    expect(t.core.buildGameweekReport).toHaveBeenCalledWith(111, { gameweek: 9 });
    expect(t.core.buildMonthlyReport).toHaveBeenCalledWith(222, { month: 10, year: 2026 });
    expect(t.deliver).toHaveBeenCalledTimes(4);
    expect(
      t.repo
        .listReports(t.l1.id)
        .map((r) => r.kind)
        .sort(),
    ).toEqual(["gameweek", "monthly"]);
    expect(t.repo.getState(LAST_GW_KEY)).toBe("9");
    // idempotent
    expect((await runTick(t.deps)).status).toBe("up-to-date");
    expect(t.deliver).toHaveBeenCalledTimes(4);
  });

  it("no monthly mid-month and respects per-league toggles", async () => {
    const t = setup(9);
    await runTick(t.deps);
    t.repo.updateLeagueSettings(t.l2.user_id, t.l2.id, { gameweek_enabled: false, monthly_enabled: true });
    t.gs.current = state(EVENTS, 10);
    const res = await runTick(t.deps);
    expect(res).toMatchObject({ status: "processed", gameweek: 10, reports: 1, monthly: [] });
    expect(t.core.buildGameweekReport).toHaveBeenCalledTimes(1);
    expect(t.core.buildMonthlyReport).not.toHaveBeenCalled();
  });

  it("retries without advancing when FPL is updating", async () => {
    const t = setup(8);
    await runTick(t.deps);
    t.gs.current = state(EVENTS, 9);
    t.core.buildGameweekReport.mockRejectedValueOnce(new Updating());
    expect((await runTick(t.deps)).status).toBe("updating");
    expect(t.repo.getState(LAST_GW_KEY)).toBe("8");
    t.core.getGameState.mockRejectedValueOnce(new Updating());
    expect((await runTick(t.deps)).status).toBe("updating");
    expect((await runTick(t.deps)).status).toBe("processed");
    expect(t.repo.getState(LAST_GW_KEY)).toBe("9");
  });

  it("isolates per-league failures", async () => {
    const t = setup(9);
    await runTick(t.deps);
    t.gs.current = state(EVENTS, 10);
    t.core.buildGameweekReport.mockRejectedValueOnce(new Error("boom"));
    const res = await runTick(t.deps);
    expect(res).toMatchObject({ status: "processed", reports: 1 });
    expect(t.repo.getState(LAST_GW_KEY)).toBe("10");
  });
});

describe("startScheduler", () => {
  it("records when it last ran and how it went (for the admin dashboard)", async () => {
    const { repo, core } = setup(9);
    const scheduler = startScheduler({ repo, core, deliver: async () => {}, log: () => {} }, { bootDelayMs: 0 });
    try {
      await vi.waitFor(() => expect(repo.getState(LAST_TICK_KEY)).toBeDefined());
      const tick = JSON.parse(repo.getState(LAST_TICK_KEY)!) as { at: string; status: string };
      expect(tick.status).toBe("initialised");
      expect(Date.parse(tick.at)).toBeGreaterThan(Date.now() - 60_000);
    } finally {
      scheduler.stop();
    }
  });
});
