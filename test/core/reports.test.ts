import { describe, expect, it, vi } from "vitest";
import { FplClient } from "../../src/core/fpl-client.ts";
import { buildGameweekReport, buildMonthlyReport, buildStandingsReport } from "../../src/core/reports.ts";
import { renderReport } from "../../src/core/render.ts";
import { fixture } from "./helpers.ts";

/** A client backed by fixtures — no network. */
function fixtureClient() {
  const bs = fixture("bootstrap");
  const standings = fixture<{ league: unknown; results: unknown[] }>("standings");
  const picks = fixture<Record<string, unknown>>("picks-gw9");
  const live = fixture("live-gw9");
  const history = fixture("history");
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    let body: unknown;
    if (path.endsWith("/bootstrap-static/")) body = bs;
    else if (path.includes("/standings/"))
      body = { league: standings.league, standings: { page: 1, has_next: false, results: standings.results } };
    else if (path.includes("/event/9/live/")) body = live;
    else if (/\/entry\/\d+\/event\/9\/picks\//.test(path)) body = picks[path.split("/")[3]!];
    else if (/\/entry\/\d+\/history\//.test(path)) body = history;
    return body ? new Response(JSON.stringify(body)) : new Response("", { status: 404 });
  });
  return new FplClient({ fetch });
}

describe("report builders (fixture-backed)", () => {
  it("builds a gameweek bulletin", async () => {
    const r = await buildGameweekReport(340312, { client: fixtureClient() });
    expect(r).toMatchObject({ kind: "gameweek", title: "Gameweek 9 Bulletin", period: { gameweek: 9 } });
    const text = renderReport(r, "whatsapp");
    expect(text).toContain("🏆 Gameweek winner");
    expect(text).toContain("*Rik Doornenbal* (Borussia Teeth) — *74 pts*");
    expect(text).toContain("🔝 Top 5");
    // official ranks from standings used for the current GW
    expect(text).toContain("1. *Rik Doornenbal* — 655 (▲2)");
  });

  it("builds a monthly report and an empty-month report", async () => {
    const r = await buildMonthlyReport(340312, { month: 10, year: 2026, client: fixtureClient() });
    expect(r.subtitle).toContain("GW6–9");
    // every fixture entry shares one history fixture, so they all tie
    expect(r.sections[0]!.heading).toBe("👑 Joint Managers of the Month");
    const empty = await buildMonthlyReport(340312, { month: 7, year: 2026, client: fixtureClient() });
    expect(empty.sections).toHaveLength(1);
  });

  it("defaults to the month of the latest finished gameweek, not the calendar month", async () => {
    // Fixture: GW9 (deadline 31 Oct) is the latest finished gameweek. Early November should
    // still give October's Manager of the Month rather than an empty November.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    const r = await buildMonthlyReport(340312, { client: fixtureClient() });
    vi.useRealTimers();
    expect(r.period).toEqual({ month: 10, year: 2026 });
  });

  it("builds standings", async () => {
    const r = await buildStandingsReport(340312, { top: 3, client: fixtureClient() });
    expect(r.sections[0]!.lines).toHaveLength(3);
    expect(renderReport(r, "plain")).toContain("3. Daniel Loukachouk (DLouk) — 650 (▼2)");
  });
});
