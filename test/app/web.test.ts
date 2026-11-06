import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.ts";
import { FplError, type Report } from "../../src/core/index.ts";
import type { Senders } from "../../src/delivery/index.ts";
import { createApp, type WebCore } from "../../src/web/app.tsx";
import { fakeReport, memRepo } from "./helpers.ts";

const ORIGIN = "http://localhost:3000";

function setup() {
  const repo = memRepo();
  const config = loadConfig({ APP_URL: ORIGIN, SESSION_SECRET: "test-secret-test-secret" });
  const core: WebCore = {
    parseLeagueId: (s: string) => (/(\d+)/.exec(s) ? Number(/(\d+)/.exec(s)![1]) : null),
    getLeagueInfo: vi.fn(async (id: number) => {
      if (id === 404) throw new FplError("not_found", "nope", 404);
      if (id === 503) throw new FplError("updating", "updating", 503);
      return { id, name: `League ${id}`, memberCount: 10 };
    }),
    buildGameweekReport: vi.fn(async (id: number): Promise<Report> => fakeReport({ leagueId: id, leagueName: `League ${id}` })),
    buildMonthlyReport: vi.fn(async (id: number) => fakeReport({ kind: "monthly", leagueId: id, period: { month: 10, year: 2026 } })),
    buildStandingsReport: vi.fn(async (id: number) => fakeReport({ kind: "standings", leagueId: id, period: {} })),
  };
  const senders: Senders = { telegram: vi.fn(), discord: vi.fn(async () => {}), email: vi.fn(async () => {}) };
  const app = createApp({ config, repo, senders, core });
  let cookie = "";
  const req = async (path: string, init: { method?: string; form?: Record<string, string>; origin?: string | null } = {}) => {
    const headers: Record<string, string> = { cookie };
    if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
    let body: string | undefined;
    if (init.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(init.form).toString();
    }
    const res = await app.request(`${ORIGIN}${path}`, { method: init.method ?? (init.form ? "POST" : "GET"), headers, body });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [name] = pair!.split("=");
      const jar = new Map(cookie.split("; ").filter(Boolean).map((p) => [p.split("=")[0]!, p] as const));
      if (/Max-Age=0/i.test(c)) jar.delete(name!);
      else jar.set(name!, pair!);
      cookie = [...jar.values()].join("; ");
    }
    return res;
  };
  return { repo, app, req, core, senders };
}

describe("web app", () => {
  it("blocks cross-site POSTs", async () => {
    const t = setup();
    expect((await t.req("/signup", { form: { email: "a@b.com", password: "password1" }, origin: "https://evil.com" })).status).toBe(403);
    expect((await t.req("/signup", { form: { email: "a@b.com", password: "password1" }, origin: null })).status).toBe(403);
  });

  it("protects the dashboard", async () => {
    const t = setup();
    const res = await t.req("/dashboard");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("validates signup", async () => {
    const t = setup();
    expect((await t.req("/signup", { form: { email: "bad", password: "password1" } })).status).toBe(400);
    expect((await t.req("/signup", { form: { email: "a@b.com", password: "short" } })).status).toBe(400);
  });

  it("signup → add league → generate → public report with WhatsApp link", async () => {
    const t = setup();
    const signup = await t.req("/signup", { form: { email: "a@b.com", password: "password1" } });
    expect(signup.status).toBe(303);
    expect(signup.headers.getSetCookie().join()).toMatch(/pundit_session=.*HttpOnly/i);

    await t.req("/leagues", { form: { league: "https://fantasy.premierleague.com/leagues/777/standings/c" } });
    const dash = await (await t.req("/dashboard")).text();
    expect(dash).toContain("League 777");
    expect(dash).toContain("Added League 777");

    const [league] = t.repo.listLeagues(1);
    const gen = await t.req(`/leagues/${league!.id}/generate`, { form: { kind: "gameweek" } });
    expect(gen.status).toBe(303);
    const loc = gen.headers.get("location")!;
    expect(loc).toMatch(/^\/r\/[\w-]+$/);

    // public: logged-out viewers can see it
    const pub = await t.app.request(`${ORIGIN}${loc}`);
    const html = await pub.text();
    expect(pub.status).toBe(200);
    expect(html).toContain("https://wa.me/?text=");
    expect(html).toContain("og:title");
    expect(html).toContain("Made with");
    expect(html).not.toContain("Post to my channels"); // owner-only controls hidden
  });

  it("friendly league errors", async () => {
    const t = setup();
    await t.req("/signup", { form: { email: "a@b.com", password: "password1" } });
    await t.req("/leagues", { form: { league: "404" } });
    expect(await (await t.req("/dashboard")).text()).toContain("couldn&#39;t find that league");
    await t.req("/leagues", { form: { league: "503" } });
    expect(await (await t.req("/dashboard")).text()).toContain("updating right now");
    await t.req("/leagues", { form: { league: "abc" } });
    expect(await (await t.req("/dashboard")).text()).toContain("look like a league ID");
  });

  it("enforces league limit via the UI", async () => {
    const t = setup();
    await t.req("/signup", { form: { email: "a@b.com", password: "password1" } });
    for (const id of ["1", "2", "3", "4"]) await t.req("/leagues", { form: { league: id } });
    expect(t.repo.countLeagues(1)).toBe(3);
  });

  it("users cannot touch each other's leagues", async () => {
    const a = setup();
    await a.req("/signup", { form: { email: "a@b.com", password: "password1" } });
    await a.req("/leagues", { form: { league: "1" } });
    const id = a.repo.listLeagues(1)[0]!.id;
    await a.req("/logout", { form: {} });
    await a.req("/signup", { form: { email: "b@b.com", password: "password1" } });
    expect((await a.req(`/leagues/${id}`)).status).toBe(404);
    expect((await a.req(`/leagues/${id}/delete`, { form: {} })).status).toBe(404);
    expect(a.repo.getLeagueById(id)).toBeDefined();
  });

  it("login works and wrong password fails", async () => {
    const t = setup();
    await t.req("/signup", { form: { email: "a@b.com", password: "password1" } });
    await t.req("/logout", { form: {} });
    expect((await t.req("/login", { form: { email: "a@b.com", password: "nope-nope" } })).status).toBe(401);
    expect((await t.req("/login", { form: { email: "A@B.com", password: "password1" } })).status).toBe(303);
    expect((await t.req("/dashboard")).status).toBe(200);
  });

  it("validates Discord webhooks and sends a test", async () => {
    const t = setup();
    await t.req("/signup", { form: { email: "a@b.com", password: "password1" } });
    await t.req("/channels/discord", { form: { webhook: "https://evil.com/x" } });
    expect(t.repo.listChannels(1)).toHaveLength(0);
    await t.req("/channels/discord", { form: { webhook: "https://discord.com/api/webhooks/1/abc", label: "#fpl" } });
    expect(t.repo.listChannels(1)).toHaveLength(1);
    expect(t.senders.discord).toHaveBeenCalledOnce();
  });
});
