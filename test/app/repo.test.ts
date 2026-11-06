import { describe, expect, it } from "vitest";
import { LimitError, limitsFor, periodKeyFor } from "../../src/db/repo.ts";
import { fakeReport, memRepo } from "./helpers.ts";

describe("plan limits", () => {
  it("free plan allows 3 leagues", () => {
    const repo = memRepo();
    const user = repo.createUser("a@b.com", "h");
    for (const id of [1, 2, 3]) repo.addLeague(user, id, `L${id}`);
    expect(() => repo.addLeague(user, 4, "L4")).toThrow(LimitError);
    // re-adding an existing league is a no-op, not a limit error
    expect(repo.addLeague(user, 2, "L2").fpl_league_id).toBe(2);
    expect(repo.countLeagues(user.id)).toBe(limitsFor("free").maxLeagues);
  });
  it("pro plan allows more", () => {
    expect(limitsFor("pro").maxLeagues).toBeGreaterThan(limitsFor("free").maxLeagues);
  });
});

describe("leagues & channels", () => {
  it("links new channels to existing leagues and vice versa", () => {
    const repo = memRepo();
    const user = repo.createUser("a@b.com", "h");
    const l1 = repo.addLeague(user, 1, "L1");
    const ch = repo.addChannel(user.id, "discord", "D", { webhookUrl: "x" });
    const l2 = repo.addLeague(user, 2, "L2");
    expect(repo.channelsForLeague(l1.id).map((c) => c.id)).toEqual([ch.id]);
    expect(repo.channelsForLeague(l2.id).map((c) => c.id)).toEqual([ch.id]);
    repo.setLeagueChannels(user.id, l1.id, []);
    expect(repo.channelsForLeague(l1.id)).toEqual([]);
  });
  it("cannot link another user's channel", () => {
    const repo = memRepo();
    const a = repo.createUser("a@b.com", "h");
    const b = repo.createUser("b@b.com", "h");
    const la = repo.addLeague(a, 1, "L");
    const chB = repo.addChannel(b.id, "discord", "D", { webhookUrl: "x" });
    repo.setLeagueChannels(a.id, la.id, [chB.id]);
    expect(repo.channelsForLeague(la.id)).toEqual([]);
  });
});

describe("reports", () => {
  it("dedupes by period and supports replace", () => {
    const repo = memRepo();
    const user = repo.createUser("a@b.com", "h");
    const l = repo.addLeague(user, 1, "L");
    const first = repo.saveReport(l.id, fakeReport());
    expect(first.created).toBe(true);
    expect(first.stored.slug.length).toBeGreaterThanOrEqual(16);
    const again = repo.saveReport(l.id, fakeReport({ title: "changed" }));
    expect(again.created).toBe(false);
    expect(again.stored.report.title).toBe("Gameweek 9 Bulletin");
    const replaced = repo.saveReport(l.id, fakeReport({ title: "changed" }), { replace: true });
    expect(replaced.stored.slug).toBe(first.stored.slug);
    expect(replaced.stored.report.title).toBe("changed");
  });
  it("period keys", () => {
    expect(periodKeyFor(fakeReport())).toBe("gw9");
    expect(periodKeyFor(fakeReport({ kind: "monthly", period: { month: 3, year: 2027 } }))).toBe("2027-03");
    expect(periodKeyFor(fakeReport({ kind: "standings", period: {} }))).toMatch(/^standings-\d+$/);
  });
});

describe("telegram codes", () => {
  it("are single use and expire", () => {
    const repo = memRepo();
    const user = repo.createUser("a@b.com", "h");
    const code = repo.createTelegramCode(user.id);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(repo.consumeTelegramCode(code)).toBe(user.id);
    expect(repo.consumeTelegramCode(code)).toBeUndefined();
    const c2 = repo.createTelegramCode(user.id, 30);
    expect(repo.consumeTelegramCode(c2, new Date(Date.now() + 31 * 60_000))).toBeUndefined();
  });
});
