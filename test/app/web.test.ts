import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.ts";
import { FplError, type Report } from "../../src/core/index.ts";
import type { Senders } from "../../src/delivery/index.ts";
import type {
  ChannelDto,
  ChannelsResponse,
  LeagueDetail,
  LeaguesResponse,
  LeagueSummary,
  MeResponse,
  ReportResponse,
  TelegramLinkResponse,
} from "../../src/shared/api.ts";
import { createApp, type WebCore } from "../../src/web/app.ts";
import { fakeReport, memRepo } from "./helpers.ts";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "correct-horse";

interface ReqInit {
  method?: string;
  json?: unknown;
  origin?: string | null;
  contentType?: string;
}

function setup(env: Record<string, string> = {}, opts: { spaDir?: string | null } = {}) {
  const repo = memRepo();
  const config = loadConfig({ APP_URL: ORIGIN, SESSION_SECRET: "test-secret-test-secret", ...env });
  const core: WebCore = {
    parseLeagueId: (s: string) => (/(\d+)/.exec(s) ? Number(/(\d+)/.exec(s)![1]) : null),
    getLeagueInfo: vi.fn(async (id: number) => {
      if (id === 404) throw new FplError("not_found", "nope", 404);
      if (id === 503) throw new FplError("updating", "updating", 503);
      return { id, name: `League ${id}`, memberCount: 10 };
    }),
    buildGameweekReport: vi.fn(async (id: number): Promise<Report> => fakeReport({ leagueId: id, leagueName: `League ${id}` })),
    buildMonthlyReport: vi.fn(async (id: number) => fakeReport({ kind: "monthly", leagueId: id, leagueName: `League ${id}`, period: { month: 10, year: 2026 } })),
    buildStandingsReport: vi.fn(async (id: number) => fakeReport({ kind: "standings", leagueId: id, leagueName: `League ${id}`, period: {} })),
  };
  const senders: Senders = { telegram: vi.fn(async () => {}), discord: vi.fn(async () => {}), email: vi.fn(async () => {}) };
  const app = createApp({ config, repo, senders, core, spaDir: opts.spaDir ?? null });

  /** A browser-like client with its own cookie jar. */
  const client = () => {
    const jar = new Map<string, string>();
    const req = async (path: string, init: ReqInit = {}) => {
      const method = init.method ?? (init.json !== undefined ? "POST" : "GET");
      const headers: Record<string, string> = {};
      if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      if (init.origin !== null && method !== "GET") headers.origin = init.origin ?? ORIGIN;
      let body: string | undefined;
      if (method !== "GET") {
        headers["content-type"] = init.contentType ?? "application/json";
        body = init.json !== undefined ? JSON.stringify(init.json) : undefined;
      }
      const res = await app.request(`${ORIGIN}${path}`, { method, headers, body });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const eq = pair!.indexOf("=");
        const name = pair!.slice(0, eq);
        if (/Max-Age=0/i.test(c)) jar.delete(name);
        else jar.set(name, pair!.slice(eq + 1));
      }
      return res;
    };
    const signup = (email = "ann@example.com") => req("/api/signup", { json: { email, password: PASSWORD } });
    return { req, jar, signup };
  };

  return { app, repo, core, senders, client };
}

describe("auth", () => {
  it("signs up, sets an httpOnly session cookie, and /api/me reflects it", async () => {
    const { client } = setup();
    const a = client();
    expect(((await (await a.req("/api/me")).json()) as MeResponse).user).toBeNull();

    const res = await a.signup("Ann@Example.com");
    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie().join()).toMatch(/pundit_session=.*HttpOnly/i);
    const me = (await res.json()) as MeResponse;
    expect(me.user).toMatchObject({ email: "ann@example.com", plan: "free", limits: { maxLeagues: 3 } });
    expect(me.features).toEqual({ telegram: false, telegramBotUsername: null, email: true });

    expect(((await (await a.req("/api/me")).json()) as MeResponse).user?.email).toBe("ann@example.com");
  });

  it("validates signup input and rejects duplicate emails", async () => {
    const { client } = setup();
    const a = client();
    expect((await a.req("/api/signup", { json: { email: "nope", password: PASSWORD } })).status).toBe(422);
    const short = await a.req("/api/signup", { json: { email: "a@b.com", password: "short" } });
    expect(short.status).toBe(422);
    expect(await short.json()).toMatchObject({ code: "validation" });
    expect((await a.req("/api/signup", { json: { email: "a@b.com" } })).status).toBe(422);
    await a.signup("dup@example.com");
    const dup = await client().signup("dup@example.com");
    expect(dup.status).toBe(409);
  });

  it("logs in, rejects wrong passwords, and logs out", async () => {
    const { client } = setup();
    await client().signup("bob@example.com");
    const b = client();
    const wrong = await b.req("/api/login", { json: { email: "bob@example.com", password: "wrong-password" } });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ code: "unauthorized" });
    expect((await b.req("/api/login", { json: { email: "BOB@example.com", password: PASSWORD } })).status).toBe(200);
    expect((await b.req("/api/leagues")).status).toBe(200);
    expect(await (await b.req("/api/logout", { method: "POST" })).json()).toEqual({ ok: true });
    expect((await b.req("/api/leagues")).status).toBe(401);
  });

  it("rate limits repeated login attempts", async () => {
    const { client } = setup();
    const c = client();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await c.req("/api/login", { json: { email: "x@example.com", password: "whatever-pw" } })).status;
    }
    expect(last).toBe(429);
  });
});

describe("CSRF", () => {
  it("blocks non-GET requests from a foreign origin or without an origin", async () => {
    const { client } = setup();
    const c = client();
    const foreign = await c.req("/api/signup", { json: { email: "a@b.com", password: PASSWORD }, origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toMatchObject({ code: "forbidden" });
    expect((await c.req("/api/signup", { json: { email: "a@b.com", password: PASSWORD }, origin: null })).status).toBe(403);
  });

  it("requires a JSON content type for API writes", async () => {
    const { client } = setup();
    const c = client();
    const form = await c.req("/api/signup", { method: "POST", contentType: "application/x-www-form-urlencoded" });
    expect(form.status).toBe(403);
    const text = await c.req("/api/logout", { method: "POST", contentType: "text/plain" });
    expect(text.status).toBe(403);
  });
});

describe("leagues", () => {
  it("requires login", async () => {
    const { client } = setup();
    const res = await client().req("/api/leagues");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
  });

  it("adds by URL, lists, rejects duplicates, bad input, unknown leagues and FPL updates", async () => {
    const { client } = setup();
    const a = client();
    await a.signup();
    const add = await a.req("/api/leagues", { json: { league: "https://fantasy.premierleague.com/leagues/111/standings/c" } });
    expect(add.status).toBe(201);
    expect((await add.json()) as LeagueSummary).toMatchObject({ fplLeagueId: 111, name: "League 111", gameweekEnabled: true, latestReports: [] });

    expect((await a.req("/api/leagues", { json: { league: "111" } })).status).toBe(409);
    const bad = await a.req("/api/leagues", { json: { league: "not a league" } });
    expect(bad.status).toBe(422);
    const missing = await a.req("/api/leagues", { json: { league: "404" } });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "not_found" });
    const updating = await a.req("/api/leagues", { json: { league: "503" } });
    expect(updating.status).toBe(503);
    expect(await updating.json()).toMatchObject({ code: "fpl_updating" });

    const list = (await (await a.req("/api/leagues")).json()) as LeaguesResponse;
    expect(list.limits).toEqual({ maxLeagues: 3, used: 1 });
    expect(list.leagues.map((l) => l.fplLeagueId)).toEqual([111]);
  });

  it("enforces the free plan limit without calling FPL", async () => {
    const { client, core } = setup();
    const a = client();
    await a.signup();
    for (const id of [1, 2, 3]) expect((await a.req("/api/leagues", { json: { league: String(id) } })).status).toBe(201);
    const calls = vi.mocked(core.getLeagueInfo).mock.calls.length;
    const over = await a.req("/api/leagues", { json: { league: "4" } });
    expect(over.status).toBe(409);
    expect(await over.json()).toMatchObject({ code: "limit" });
    expect(vi.mocked(core.getLeagueInfo).mock.calls.length).toBe(calls);
  });

  it("gets detail, patches settings and channels, and deletes", async () => {
    const { client } = setup();
    const a = client();
    await a.signup();
    const { id } = (await (await a.req("/api/leagues", { json: { league: "111" } })).json()) as LeagueSummary;
    await a.req("/api/channels/email", { method: "PUT", json: { enabled: true } });

    const detail = (await (await a.req(`/api/leagues/${id}`)).json()) as LeagueDetail;
    expect(detail.channelIds).toHaveLength(1); // new channels link to existing leagues
    expect(detail.reports).toEqual([]);

    const patched = await a.req(`/api/leagues/${id}`, { method: "PATCH", json: { monthlyEnabled: false, channelIds: [] } });
    expect(patched.status).toBe(200);
    expect((await patched.json()) as LeagueDetail).toMatchObject({ gameweekEnabled: true, monthlyEnabled: false, channelIds: [] });

    expect((await a.req(`/api/leagues/${id}`, { method: "PATCH", json: { monthlyEnabled: "no" } })).status).toBe(422);
    expect(await (await a.req(`/api/leagues/${id}`, { method: "DELETE" })).json()).toEqual({ ok: true });
    expect((await a.req(`/api/leagues/${id}`)).status).toBe(404);
  });

  it("returns 404 for another user's league", async () => {
    const { client } = setup();
    const a = client();
    await a.signup("a@example.com");
    const { id } = (await (await a.req("/api/leagues", { json: { league: "111" } })).json()) as LeagueSummary;
    const b = client();
    await b.signup("b@example.com");
    expect((await b.req(`/api/leagues/${id}`)).status).toBe(404);
    expect((await b.req(`/api/leagues/${id}`, { method: "PATCH", json: { gameweekEnabled: false } })).status).toBe(404);
    expect((await b.req(`/api/leagues/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await b.req(`/api/leagues/${id}/generate`, { json: { kind: "gameweek" } })).status).toBe(404);
    expect((await a.req(`/api/leagues/${id}`)).status).toBe(200);
  });
});

describe("reports", () => {
  async function withReport() {
    const t = setup();
    const a = t.client();
    await a.signup();
    const league = (await (await a.req("/api/leagues", { json: { league: "111" } })).json()) as LeagueSummary;
    const res = await a.req(`/api/leagues/${league.id}/generate`, { json: { kind: "gameweek" } });
    return { ...t, a, league, res };
  }

  it("generates a bulletin with rendered text and a WhatsApp link", async () => {
    const { res, league } = await withReport();
    expect(res.status).toBe(201);
    const r = (await res.json()) as ReportResponse;
    expect(r.slug).toMatch(/^[\w-]{16}$/);
    expect(r.url).toBe(`${ORIGIN}/r/${r.slug}`);
    expect(r.report.title).toBe("Gameweek 9 Bulletin");
    expect(r.text.whatsapp).toContain("*Ann*");
    expect(r.text.whatsapp).toContain(`${ORIGIN}/r/${r.slug}`);
    expect(r.text.plain).not.toContain("*");
    expect(r.html).toContain("<");
    expect(r.whatsappUrl).toBe(`https://wa.me/?text=${encodeURIComponent(r.text.whatsapp)}`);
    expect(r.owner).toEqual({ leagueId: league.id, deliveries: [] });
  });

  it("validates the bulletin kind and maps FPL errors", async () => {
    const { a, league, core } = await withReport();
    expect((await a.req(`/api/leagues/${league.id}/generate`, { json: { kind: "weekly" } })).status).toBe(422);
    vi.mocked(core.buildMonthlyReport).mockRejectedValueOnce(new FplError("updating", "updating", 503));
    const res = await a.req(`/api/leagues/${league.id}/generate`, { json: { kind: "monthly" } });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "fpl_updating" });
  });

  it("regenerating the same period replaces the report", async () => {
    const { a, league } = await withReport();
    await a.req(`/api/leagues/${league.id}/generate`, { json: { kind: "gameweek" } });
    const detail = (await (await a.req(`/api/leagues/${league.id}`)).json()) as LeagueDetail;
    expect(detail.reports.filter((r) => r.kind === "gameweek")).toHaveLength(1);
    expect(detail.latestReports[0]).toMatchObject({ kind: "gameweek", title: "Gameweek 9 Bulletin", periodKey: "gw9" });
    expect(detail.latestReports[0]!.url).toMatch(/^\/r\//);
  });

  it("is public without the owner block, and includes it for the owner", async () => {
    const { a, res, client } = await withReport();
    const { slug } = (await res.json()) as ReportResponse;
    const anon = (await (await client().req(`/api/reports/${slug}`)).json()) as ReportResponse;
    expect(anon.slug).toBe(slug);
    expect(anon.owner).toBeUndefined();
    const other = client();
    await other.signup("other@example.com");
    expect(((await (await other.req(`/api/reports/${slug}`)).json()) as ReportResponse).owner).toBeUndefined();
    expect(((await (await a.req(`/api/reports/${slug}`)).json()) as ReportResponse).owner).toBeDefined();
    expect((await client().req("/api/reports/nope")).status).toBe(404);
  });

  it("delivers to linked channels (owner only) and reports delivery status", async () => {
    const { a, res, client, senders } = await withReport();
    const { slug } = (await res.json()) as ReportResponse;
    await a.req("/api/channels/email", { method: "PUT", json: { enabled: true } });

    expect((await client().req(`/api/reports/${slug}/deliver`, { method: "POST" })).status).toBe(401);
    const other = client();
    await other.signup("other@example.com");
    expect((await other.req(`/api/reports/${slug}/deliver`, { method: "POST" })).status).toBe(404);

    const delivered = (await (await a.req(`/api/reports/${slug}/deliver`, { method: "POST" })).json()) as ReportResponse;
    expect(senders.email).toHaveBeenCalledTimes(1);
    expect(delivered.owner?.deliveries).toEqual([
      expect.objectContaining({ kind: "email", label: "Email (ann@example.com)", status: "sent", error: null }),
    ]);
  });
});

describe("channels", () => {
  it("requires login", async () => {
    const { client } = setup();
    expect((await client().req("/api/channels")).status).toBe(401);
  });

  it("toggles email notifications", async () => {
    const { client } = setup();
    const a = client();
    await a.signup();
    const on = (await (await a.req("/api/channels/email", { method: "PUT", json: { enabled: true } })).json()) as ChannelsResponse;
    expect(on.channels).toEqual([expect.objectContaining({ kind: "email", label: "Email (ann@example.com)", active: true })]);
    await a.req("/api/channels/email", { method: "PUT", json: { enabled: true } }); // idempotent
    expect(((await (await a.req("/api/channels")).json()) as ChannelsResponse).channels).toHaveLength(1);
    const off = (await (await a.req("/api/channels/email", { method: "PUT", json: { enabled: false } })).json()) as ChannelsResponse;
    expect(off.channels).toEqual([]);
  });

  it("links Discord after a successful test message, and rejects bad or failing webhooks", async () => {
    const { client, senders } = setup();
    const a = client();
    await a.signup();
    const url = "https://discord.com/api/webhooks/123/abc";

    expect((await a.req("/api/channels/discord", { json: { webhookUrl: "https://example.com/hook" } })).status).toBe(422);

    vi.mocked(senders.discord).mockRejectedValueOnce(new Error("404 Unknown Webhook"));
    const failed = await a.req("/api/channels/discord", { json: { webhookUrl: url } });
    expect(failed.status).toBe(422);
    expect(((await failed.json()) as { error: string }).error).toContain("Unknown Webhook");
    expect(((await (await a.req("/api/channels")).json()) as ChannelsResponse).channels).toEqual([]);

    const ok = await a.req("/api/channels/discord", { json: { webhookUrl: url, label: "#banter" } });
    expect(ok.status).toBe(201);
    expect((await ok.json()) as ChannelDto).toMatchObject({ kind: "discord", label: "#banter", active: true });
    expect((await a.req("/api/channels/discord", { json: { webhookUrl: url } })).status).toBe(409);
  });

  it("sends a test message and deletes, scoped to the owner", async () => {
    const { client, senders } = setup();
    const a = client();
    await a.signup();
    const { id } = (await (await a.req("/api/channels/discord", { json: { webhookUrl: "https://discord.com/api/webhooks/1/x" } })).json()) as ChannelDto;

    const b = client();
    await b.signup("b@example.com");
    expect((await b.req(`/api/channels/${id}/test`, { method: "POST" })).status).toBe(404);
    expect((await b.req(`/api/channels/${id}`, { method: "DELETE" })).status).toBe(404);

    expect(await (await a.req(`/api/channels/${id}/test`, { method: "POST" })).json()).toEqual({ ok: true });
    vi.mocked(senders.discord).mockRejectedValueOnce(new Error("boom"));
    expect((await a.req(`/api/channels/${id}/test`, { method: "POST" })).status).toBe(502);
    expect(await (await a.req(`/api/channels/${id}`, { method: "DELETE" })).json()).toEqual({ ok: true });
    expect(((await (await a.req("/api/channels")).json()) as ChannelsResponse).channels).toEqual([]);
  });

  it("creates Telegram link codes only when the bot is configured", async () => {
    const off = setup().client();
    await off.signup();
    expect((await off.req("/api/channels/telegram/link", { method: "POST" })).status).toBe(409);

    const t = setup({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_BOT_USERNAME: "@PunditBot" });
    const a = t.client();
    const me = (await (await a.signup()).json()) as MeResponse;
    expect(me.features).toMatchObject({ telegram: true, telegramBotUsername: "PunditBot" });
    const link = (await (await a.req("/api/channels/telegram/link", { method: "POST" })).json()) as TelegramLinkResponse;
    expect(link.url).toMatch(/^https:\/\/t\.me\/PunditBot\?startgroup=[\w-]+$/);
    expect(Date.parse(link.expiresAt)).toBeGreaterThan(Date.now());
  });
});

describe("server-rendered pages", () => {
  it("renders the landing page with the sample bulletin", async () => {
    const { client } = setup();
    const res = await client().req("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Pundit");
    expect(html).toContain('property="og:title"');
    expect(html).toContain('href="/signup"');
  });

  it("renders a public bulletin page with OG tags, WhatsApp link and copy button", async () => {
    const { client } = setup();
    const a = client();
    await a.signup();
    const league = (await (await a.req("/api/leagues", { json: { league: "111" } })).json()) as LeagueSummary;
    const r = (await (await a.req(`/api/leagues/${league.id}/generate`, { json: { kind: "gameweek" } })).json()) as ReportResponse;

    const res = await client().req(`/r/${r.slug}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta property="og:title" content="Gameweek 9 Bulletin — League 111"/>');
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}/r/${r.slug}"/>`);
    expect(html).toContain('property="og:description" content="');
    expect(html).toContain("https://wa.me/?text=");
    expect(html).toContain('data-copy-target="pundit-report-text"');
    expect(html).toContain('id="pundit-report-text"');
    expect(html).toContain("[data-copy-target]"); // inline copy script
    expect(html).toContain("Ann");
  });

  it("returns a 404 page for an unknown bulletin", async () => {
    const res = await setup().client().req("/r/does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Not found");
  });

  it("serves health checks and points non-API pages to Vite in development", async () => {
    const { client } = setup();
    expect(await (await client().req("/healthz")).text()).toBe("ok");
    const dash = await client().req("/dashboard");
    expect(dash.status).toBe(404);
    expect(await dash.text()).toContain("localhost:5173");
    expect((await client().req("/api/nope")).status).toBe(404);
  });
});

describe("production SPA serving", () => {
  function distDir() {
    const dir = mkdtempSync(join(tmpdir(), "pundit-spa-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><div id=root></div>");
    writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
    return dir;
  }

  it("serves index.html for client routes and hashed assets with long caching", async () => {
    const { client } = setup({}, { spaDir: distDir() });
    const c = client();
    for (const path of ["/dashboard", "/leagues/1", "/login"]) {
      const res = await c.req(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<div id=root>');
    }
    const asset = await c.req("/assets/app-abc123.js");
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect((await c.req("/assets/missing.js")).status).toBe(404);
    expect((await c.req("/assets/..%2Findex.html")).status).toBe(404);
    // API and server-rendered routes still win
    expect((await c.req("/api/me")).headers.get("content-type")).toContain("json");
    expect(await (await c.req("/")).text()).toContain("og:title");
  });

  it("explains how to fix a missing build", async () => {
    const { client } = setup({}, { spaDir: join(tmpdir(), "pundit-no-such-dir") });
    const res = await client().req("/dashboard");
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("npm run build");
  });
});
