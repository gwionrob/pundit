/**
 * GET /api/admin: the read-only operator dashboard.
 *
 * Safety rules for this file:
 * - GET only. Nothing here changes data.
 * - Admins only (ADMIN_EMAILS); everyone else gets a plain 404.
 * - Never return secrets: no password hashes, session tokens or channel config (Discord
 *   webhook URLs, Telegram chat ids). Delivery errors are scrubbed of anything token-like.
 * - Responses are never cached (Cache-Control: no-store).
 */
import { Hono } from "hono";
import { LAST_GW_KEY, LAST_TICK_KEY } from "../../jobs/scheduler.ts";
import type { AdminResponse } from "../../shared/api.ts";
import { currentUser, requireAdmin, type Env, type WebContext } from "../context.ts";

const ROWS = 25;
const WINDOW_DAYS = 7;
const ERROR_MAX = 300;

/** Removes webhook URLs, bot tokens and API keys that a provider might echo back in an error. */
export function scrubError(error: string | null): string | null {
  if (error == null) return null;
  return error
    .replace(/https?:\/\/\S*\/api\/webhooks\/\S+/gi, "[webhook URL]")
    .replace(/\bbot\d+:[\w-]+/gi, "bot[token]")
    .replace(/\b(re|sk|pk)_[A-Za-z0-9_]{8,}/g, "[key]")
    .slice(0, ERROR_MAX);
}

function parseTick(raw: string | undefined): { at: string | null; status: string | null } {
  if (!raw) return { at: null, status: null };
  try {
    const v = JSON.parse(raw) as { at?: unknown; status?: unknown };
    return { at: typeof v.at === "string" ? v.at : null, status: typeof v.status === "string" ? v.status : null };
  } catch {
    return { at: null, status: null };
  }
}

export function adminRoutes(ctx: WebContext) {
  const { config, repo } = ctx;
  const app = new Hono<Env>();
  app.use("*", requireAdmin(config));
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex");
  });

  app.get("/", (c) => {
    console.log(`[admin] dashboard viewed by user ${currentUser(c).id}`);
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const state = repo.allState();
    const lastGw = state[LAST_GW_KEY];
    const tick = parseTick(state[LAST_TICK_KEY]);
    const body: AdminResponse = {
      generatedAt: new Date().toISOString(),
      counts: repo.adminCounts(since),
      scheduler: {
        lastGameweekProcessed: lastGw != null && Number.isFinite(Number(lastGw)) ? Number(lastGw) : null,
        lastTickAt: tick.at,
        lastTickStatus: tick.status,
      },
      users: repo.adminRecentUsers(ROWS).map((u) => ({
        id: u.id,
        email: u.email,
        plan: u.plan,
        createdAt: u.created_at,
        leagues: u.leagues,
        channels: u.channels,
      })),
      leagues: repo.adminRecentLeagues(ROWS).map((l) => ({
        id: l.id,
        fplLeagueId: l.fpl_league_id,
        name: l.name,
        owner: l.owner,
        gameweekEnabled: l.gameweek_enabled,
        monthlyEnabled: l.monthly_enabled,
        createdAt: l.created_at,
      })),
      reports: repo.adminRecentReports(ROWS).map((r) => ({
        slug: r.slug,
        kind: r.kind,
        title: r.title,
        league: r.league,
        createdAt: r.created_at,
        url: `/r/${r.slug}`,
      })),
      deliveries: repo.adminRecentDeliveries(ROWS).map((d) => ({
        slug: d.slug,
        league: d.league,
        kind: d.kind,
        label: d.label,
        status: d.status,
        error: scrubError(d.error),
        at: d.created_at,
      })),
    };
    return c.json(body);
  });

  return app;
}
