import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Config } from "../config.ts";
import * as coreModule from "../core/index.ts";
import { FplError, type Report, type ReportKind } from "../core/index.ts";
import { LimitError, limitsFor, type Repo, type User } from "../db/repo.ts";
import { isDiscordWebhookUrl } from "../delivery/discord.ts";
import { deliverToLeagueChannels, sendTestMessage, type DeliveryDeps, type Senders } from "../delivery/index.ts";
import { reportFooter, reportUrl, whatsappShareUrl } from "../delivery/whatsapp.ts";
import {
  endSession,
  MIN_PASSWORD_LENGTH,
  RateLimiter,
  SESSION_COOKIE,
  SESSION_DAYS,
  hashPassword,
  startSession,
  userForToken,
  validateEmail,
  verifyPassword,
} from "./auth.ts";
import type { Flash } from "./layout.tsx";
import {
  AuthPage,
  ChannelsPage,
  DashboardPage,
  LandingPage,
  LeaguePage,
  NotFoundPage,
  ReportPage,
} from "./pages.tsx";

/** Stats-engine functions the web layer uses (injectable for tests). */
export type WebCore = Pick<
  typeof coreModule,
  "parseLeagueId" | "getLeagueInfo" | "buildGameweekReport" | "buildMonthlyReport" | "buildStandingsReport"
>;

export interface AppDeps {
  config: Config;
  repo: Repo;
  senders: Senders;
  core?: WebCore;
}

type Env = { Variables: { user: User | undefined } };

const FLASH_COOKIE = "pundit_flash";

/** Human-friendly message for errors from the stats engine. */
export function friendlyError(e: unknown): string {
  if (e instanceof FplError) {
    switch (e.code) {
      case "not_found":
        return "We couldn't find that league. Check the ID. Only classic leagues are supported.";
      case "updating":
        return "The FPL game is updating right now. Try again in a few minutes.";
      case "rate_limited":
        return "FPL is busy right now. Try again in a minute.";
      default:
        return "We couldn't reach FPL just now. Try again shortly.";
    }
  }
  if (e instanceof LimitError) return e.message;
  console.error(e);
  return "Something went wrong. Please try again.";
}

export function createApp(deps: AppDeps) {
  const { config, repo } = deps;
  const core: WebCore = deps.core ?? coreModule;
  const delivery: DeliveryDeps = { repo, senders: deps.senders, appUrl: config.appUrl };
  const authLimiter = new RateLimiter(10, 15 * 60_000);
  const appOrigin = new URL(config.appUrl).origin;

  const app = new Hono<Env>();

  app.use(secureHeaders({ contentSecurityPolicy: undefined, crossOriginEmbedderPolicy: false }));

  // CSRF: state-changing requests must come from our own origin.
  app.use(async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const reqOrigin = new URL(c.req.url).origin;
      const origin = c.req.header("origin");
      const referer = c.req.header("referer");
      let source: string | undefined;
      try {
        source = origin && origin !== "null" ? origin : referer ? new URL(referer).origin : undefined;
      } catch {
        source = undefined;
      }
      if (!source || (source !== appOrigin && source !== reqOrigin)) {
        return c.text("Cross-site request blocked", 403);
      }
    }
    await next();
  });

  // Session
  app.use(async (c, next) => {
    c.set("user", userForToken(repo, getCookie(c, SESSION_COOKIE), config.SESSION_SECRET));
    await next();
  });

  const setFlash = (c: Context<Env>, kind: Flash["kind"], text: string) =>
    setCookie(c, FLASH_COOKIE, encodeURIComponent(JSON.stringify({ kind, text })), {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: config.secureCookies,
      maxAge: 60,
    });
  const takeFlash = (c: Context<Env>): Flash | undefined => {
    const raw = getCookie(c, FLASH_COOKIE);
    if (!raw) return undefined;
    deleteCookie(c, FLASH_COOKIE, { path: "/" });
    try {
      const f = JSON.parse(decodeURIComponent(raw)) as Flash;
      return (f.kind === "ok" || f.kind === "err") && typeof f.text === "string" ? f : undefined;
    } catch {
      return undefined;
    }
  };
  const redirectWith = (c: Context<Env>, to: string, kind: Flash["kind"], text: string) => {
    setFlash(c, kind, text);
    return c.redirect(to, 303);
  };

  const requireUser = (c: Context<Env>): User | Response => {
    const user = c.get("user");
    if (!user) return c.redirect("/login", 303);
    return user;
  };

  // Only trust forwarding headers behind a proxy we control; otherwise they're spoofable
  // and would let anyone dodge the login/signup rate limit.
  const clientKey = (c: Context<Env>) => {
    if (config.TRUST_PROXY) {
      const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip");
      if (forwarded) return forwarded;
    }
    try {
      return getConnInfo(c).remote.address ?? "local";
    } catch {
      return "local"; // no Node socket (e.g. app.request in tests)
    }
  };

  const loginUser = (c: Context<Env>, userId: number) => {
    const { token } = startSession(repo, userId, config.SESSION_SECRET);
    setCookie(c, SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: config.secureCookies,
      maxAge: SESSION_DAYS * 86_400,
    });
  };

  // ---------- public ----------

  app.get("/", (c) => c.html(<LandingPage user={c.get("user")} />));
  app.get("/healthz", (c) => c.text("ok"));

  app.get("/signup", (c) => (c.get("user") ? c.redirect("/dashboard") : c.html(<AuthPage mode="signup" flash={takeFlash(c)} />)));
  app.get("/login", (c) => (c.get("user") ? c.redirect("/dashboard") : c.html(<AuthPage mode="login" flash={takeFlash(c)} />)));

  app.post("/signup", async (c) => {
    if (!authLimiter.take(`signup:${clientKey(c)}`)) {
      return c.html(<AuthPage mode="signup" flash={{ kind: "err", text: "Too many attempts. Try again later." }} />, 429);
    }
    const form = await c.req.parseBody();
    const email = String(form.email ?? "").trim().toLowerCase();
    const password = String(form.password ?? "");
    const fail = (text: string, status: 400 | 409 = 400) =>
      c.html(<AuthPage mode="signup" email={email} flash={{ kind: "err", text }} />, status);
    if (!validateEmail(email)) return fail("Please enter a valid email address.");
    if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password.length > 200) return fail("Password is too long.");
    if (repo.getUserByEmail(email)) return fail("An account with that email already exists. Try logging in.", 409);
    const user = repo.createUser(email, await hashPassword(password));
    loginUser(c, user.id);
    return redirectWith(c, "/dashboard", "ok", "Welcome! Add your first league below.");
  });

  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const email = String(form.email ?? "").trim().toLowerCase();
    const password = String(form.password ?? "");
    if (!authLimiter.take(`login:${clientKey(c)}`) || !authLimiter.take(`login-email:${email}`)) {
      return c.html(<AuthPage mode="login" email={email} flash={{ kind: "err", text: "Too many attempts. Try again later." }} />, 429);
    }
    const user = repo.getUserByEmail(email);
    const ok = user ? await verifyPassword(password, user.password_hash) : await hashPassword(password).then(() => false);
    if (!user || !ok) {
      return c.html(<AuthPage mode="login" email={email} flash={{ kind: "err", text: "Wrong email or password." }} />, 401);
    }
    loginUser(c, user.id);
    return c.redirect("/dashboard", 303);
  });

  app.post("/logout", (c) => {
    endSession(repo, getCookie(c, SESSION_COOKIE), config.SESSION_SECRET);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect("/", 303);
  });

  // ---------- dashboard & leagues ----------

  app.get("/dashboard", (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const leagues = repo.listLeagues(user.id).map((league) => ({
      league,
      reports: repo.listReports(league.id, 5),
      channelCount: repo.channelsForLeague(league.id).length,
    }));
    return c.html(
      <DashboardPage
        user={user}
        flash={takeFlash(c)}
        leagues={leagues}
        limits={limitsFor(user.plan)}
        channelCount={repo.listChannels(user.id).length}
      />,
    );
  });

  app.post("/leagues", async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const form = await c.req.parseBody();
    const id = core.parseLeagueId(String(form.league ?? ""));
    if (id == null) {
      return redirectWith(c, "/dashboard", "err", "That doesn't look like a league ID or link. It should contain a number like 123456.");
    }
    if (repo.findLeagueByFplId(user.id, id)) return redirectWith(c, "/dashboard", "ok", "You've already added that league.");
    try {
      const info = await core.getLeagueInfo(id);
      const league = repo.addLeague(user, info.id, info.name);
      return redirectWith(c, "/dashboard", "ok", `Added ${league.name}. Your first bulletin arrives after the next gameweek, or generate one now.`);
    } catch (e) {
      return redirectWith(c, "/dashboard", "err", friendlyError(e));
    }
  });

  const ownedLeague = (c: Context<Env>, user: User) => {
    const id = Number(c.req.param("id"));
    return Number.isInteger(id) ? repo.getLeague(user.id, id) : undefined;
  };

  app.get("/leagues/:id", (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const league = ownedLeague(c, user);
    if (!league) return c.html(<NotFoundPage user={user} />, 404);
    return c.html(
      <LeaguePage
        user={user}
        flash={takeFlash(c)}
        league={league}
        channels={repo.listChannels(user.id)}
        linked={new Set(repo.channelsForLeague(league.id, { activeOnly: false }).map((ch) => ch.id))}
        reports={repo.listReports(league.id)}
      />,
    );
  });

  app.post("/leagues/:id/settings", async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const league = ownedLeague(c, user);
    if (!league) return c.html(<NotFoundPage user={user} />, 404);
    const form = await c.req.parseBody({ all: true });
    repo.updateLeagueSettings(user.id, league.id, {
      gameweek_enabled: form.gameweek_enabled === "1",
      monthly_enabled: form.monthly_enabled === "1",
    });
    const raw = form.channel;
    const channelIds = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((v) => Number(v)).filter(Number.isInteger);
    repo.setLeagueChannels(user.id, league.id, channelIds);
    return redirectWith(c, `/leagues/${league.id}`, "ok", "Settings saved.");
  });

  app.post("/leagues/:id/delete", (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const league = ownedLeague(c, user);
    if (!league) return c.html(<NotFoundPage user={user} />, 404);
    repo.deleteLeague(user.id, league.id);
    return redirectWith(c, "/dashboard", "ok", `Removed ${league.name}.`);
  });

  app.post("/leagues/:id/generate", async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const league = ownedLeague(c, user);
    if (!league) return c.html(<NotFoundPage user={user} />, 404);
    const form = await c.req.parseBody();
    const kind = String(form.kind) as ReportKind;
    try {
      let report: Report;
      if (kind === "gameweek") report = await core.buildGameweekReport(league.fpl_league_id);
      else if (kind === "monthly") report = await core.buildMonthlyReport(league.fpl_league_id);
      else if (kind === "standings") report = await core.buildStandingsReport(league.fpl_league_id);
      else return redirectWith(c, "/dashboard", "err", "Unknown bulletin type.");
      if (report.leagueName && report.leagueName !== league.name) repo.updateLeagueName(league.id, report.leagueName);
      const { stored } = repo.saveReport(league.id, report, { replace: true });
      return c.redirect(`/r/${stored.slug}`, 303);
    } catch (e) {
      return redirectWith(c, "/dashboard", "err", friendlyError(e));
    }
  });

  // ---------- reports ----------

  app.get("/r/:slug", (c) => {
    const stored = repo.getReportBySlug(c.req.param("slug"));
    const user = c.get("user");
    if (!stored) return c.html(<NotFoundPage user={user} />, 404);
    const league = repo.getLeagueById(stored.league_id);
    const isOwner = Boolean(user && league && league.user_id === user.id);
    const waText = coreModule.renderReport(stored.report, "whatsapp", { footer: reportFooter(config.appUrl, stored.slug) });
    return c.html(
      <ReportPage
        stored={stored}
        user={user}
        isOwner={isOwner}
        flash={takeFlash(c)}
        waText={waText}
        waUrl={whatsappShareUrl(waText)}
        pageUrl={reportUrl(config.appUrl, stored.slug)}
        appUrl={config.appUrl}
        deliveries={isOwner ? repo.deliveriesForReport(stored.id) : []}
        channelCount={isOwner && league ? repo.channelsForLeague(league.id).length : 0}
      />,
    );
  });

  app.post("/r/:slug/deliver", async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const stored = repo.getReportBySlug(c.req.param("slug"));
    const league = stored ? repo.getLeagueById(stored.league_id) : undefined;
    if (!stored || !league || league.user_id !== user.id) return c.html(<NotFoundPage user={user} />, 404);
    const t = await deliverToLeagueChannels(delivery, stored, { force: true });
    const kind = t.failed ? "err" : "ok";
    const text = t.failed
      ? `Posted to ${t.sent} channel(s); ${t.failed} failed. Check the channel and try again.`
      : `Posted to ${t.sent} channel(s).`;
    return redirectWith(c, `/r/${stored.slug}`, kind, text);
  });

  // ---------- channels ----------

  const channelsPage = (c: Context<Env>, user: User, telegramLink?: string) =>
    c.html(
      <ChannelsPage
        user={user}
        flash={takeFlash(c)}
        channels={repo.listChannels(user.id)}
        telegram={{ enabled: config.telegramEnabled, link: telegramLink, username: config.TELEGRAM_BOT_USERNAME }}
        emailChannel={repo.findChannel(user.id, "email", () => true)}
      />,
    );

  app.get("/channels", (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return channelsPage(c, user);
  });

  app.post("/channels/telegram", (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    if (!config.telegramEnabled) return redirectWith(c, "/channels", "err", "Telegram isn't set up on this server.");
    const code = repo.createTelegramCode(user.id);
    return channelsPage(c, user, `https://t.me/${config.TELEGRAM_BOT_USERNAME}?startgroup=${code}`);
  });

  app.post("/channels/discord", async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const form = await c.req.parseBody();
    const webhookUrl = String(form.webhook ?? "").trim();
    const label = String(form.label ?? "").trim().slice(0, 60) || "Discord channel";
    if (!isDiscordWebhookUrl(webhookUrl)) {
      return redirectWith(c, "/channels", "err", "That isn't a Discord webhook URL. It should start with https://discord.com/api/webhooks/.");
    }
    if (repo.findChannel(user.id, "discord", (ch) => ch.config.webhookUrl === webhookUrl)) {
      return redirectWith(c, "/channels", "ok", "That Discord channel is already linked.");
    }
    const channel = repo.addChannel(user.id, "discord", label, { webhookUrl });
    try {
      await sendTestMessage(delivery, channel);
      return redirectWith(c, "/channels", "ok", `Linked ${label}. We posted a test message there.`);
    } catch (e) {
      repo.deleteChannel(user.id, channel.id);
      return redirectWith(c, "/channels", "err", `Discord rejected the webhook: ${(e as Error).message}`);
    }
  });

  app.post("/channels/email", async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const form = await c.req.parseBody();
    const existing = repo.findChannel(user.id, "email", () => true);
    if (form.enabled === "1") {
      if (!existing) repo.addChannel(user.id, "email", `Email (${user.email})`, { email: user.email });
      return redirectWith(c, "/channels", "ok", `We'll email ${user.email} when a bulletin is ready.`);
    }
    if (existing) repo.deleteChannel(user.id, existing.id);
    return redirectWith(c, "/channels", "ok", "Email notifications turned off.");
  });

  app.post("/channels/:id/test", async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const channel = repo.getChannel(user.id, Number(c.req.param("id")));
    if (!channel) return c.html(<NotFoundPage user={user} />, 404);
    try {
      await sendTestMessage(delivery, channel);
      if (!channel.active) repo.updateChannel(channel.id, { active: true });
      return redirectWith(c, "/channels", "ok", `Test sent to ${channel.label}.`);
    } catch (e) {
      return redirectWith(c, "/channels", "err", `Test to ${channel.label} failed: ${(e as Error).message}`);
    }
  });

  app.post("/channels/:id/delete", (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const channel = repo.getChannel(user.id, Number(c.req.param("id")));
    if (!channel) return c.html(<NotFoundPage user={user} />, 404);
    repo.deleteChannel(user.id, channel.id);
    return redirectWith(c, "/channels", "ok", `Removed ${channel.label}.`);
  });

  app.notFound((c) => c.html(<NotFoundPage user={c.get("user")} />, 404));
  app.onError((err, c) => {
    console.error("[web] unhandled error:", err);
    return c.text("Something went wrong.", 500);
  });

  return app;
}
