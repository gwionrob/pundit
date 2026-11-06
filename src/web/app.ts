/**
 * The Hono app: JSON API under /api, server-rendered landing (/) and bulletin (/r/:slug) pages,
 * and, in production, the built React app for every other GET.
 */
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import * as coreModule from "../core/index.ts";
import type { DeliveryDeps } from "../delivery/index.ts";
import { adminRoutes } from "./api/admin.ts";
import { authRoutes } from "./api/auth.ts";
import { channelRoutes } from "./api/channels.ts";
import { leagueRoutes } from "./api/leagues.ts";
import { reportRoutes } from "./api/reports.ts";
import { RateLimiter, SESSION_COOKIE, userForToken } from "./auth.ts";
import { apiError, type AppDeps, type Env, type WebContext } from "./context.ts";
import { toReportResponse } from "./dto.ts";
import { mountIcons } from "./icons.ts";
import { createSpa, DEFAULT_SPA_DIR } from "./spa.ts";
import { renderLandingPage, renderNotFoundPage, renderReportPage } from "./ssr.tsx";

export type { AppDeps, WebCore } from "./context.ts";

const AUTH_ATTEMPTS = 10;
const AUTH_WINDOW_MS = 15 * 60_000;

export function createApp(deps: AppDeps) {
  const { config, repo } = deps;
  const delivery: DeliveryDeps = { repo, senders: deps.senders, appUrl: config.appUrl };
  const ctx: WebContext = {
    config,
    repo,
    core: deps.core ?? coreModule,
    delivery,
    authLimiter: new RateLimiter(AUTH_ATTEMPTS, AUTH_WINDOW_MS),
  };
  const appOrigin = new URL(config.appUrl).origin;
  const spaDir = deps.spaDir !== undefined ? deps.spaDir : config.NODE_ENV === "production" ? DEFAULT_SPA_DIR : null;
  const spa = spaDir ? createSpa(spaDir) : null;

  const app = new Hono<Env>();

  app.use(secureHeaders({ contentSecurityPolicy: undefined, crossOriginEmbedderPolicy: false }));

  // The URL the browser actually used. Behind a TLS-terminating proxy (Fly) the request
  // arrives as http://, so trust X-Forwarded-Proto when TRUST_PROXY is set.
  const publicOrigin = (c: Context<Env>) => {
    const url = new URL(c.req.url);
    const proto = config.TRUST_PROXY ? c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() : undefined;
    if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
    return url.origin;
  };

  // One canonical address: in production, send www.pundit.chat, the fly.dev address etc. to
  // APP_URL, so shared links, cookies and the CSRF origin check all agree. /healthz is exempt
  // because the platform's health checks hit the machine directly.
  if (config.NODE_ENV === "production") {
    const appHost = new URL(config.appUrl).host;
    app.use(async (c, next) => {
      const host = c.req.header("host");
      if (!host || host === appHost || c.req.path === "/healthz") return next();
      if (c.req.method !== "GET" && c.req.method !== "HEAD") return next(); // writes fall through to the CSRF check
      const url = new URL(c.req.url);
      return c.redirect(`${config.appUrl}${url.pathname}${url.search}`, 301);
    });
  }

  // CSRF: state-changing requests must come from our own origin, and API writes must be JSON
  // (a cross-site HTML form can't send application/json without a CORS preflight).
  app.use(async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
    const reqOrigin = publicOrigin(c);
    const origin = c.req.header("origin");
    const referer = c.req.header("referer");
    let source: string | undefined;
    try {
      source = origin && origin !== "null" ? origin : referer ? new URL(referer).origin : undefined;
    } catch {
      source = undefined;
    }
    if (!source || (source !== appOrigin && source !== reqOrigin)) {
      return apiError(c, 403, "Cross-site request blocked.", "forbidden");
    }
    const contentType = c.req.header("content-type") ?? "";
    if (c.req.path.startsWith("/api/") && !/^application\/json\b/i.test(contentType)) {
      return apiError(c, 403, "API requests must send Content-Type: application/json.", "forbidden");
    }
    await next();
  });

  // Session
  app.use(async (c, next) => {
    c.set("user", userForToken(repo, getCookie(c, SESSION_COOKIE), config.SESSION_SECRET));
    await next();
  });

  // ---------- JSON API ----------
  const api = new Hono<Env>();
  api.route("/", authRoutes(ctx));
  api.route("/leagues", leagueRoutes(ctx));
  api.route("/reports", reportRoutes(ctx));
  api.route("/channels", channelRoutes(ctx));
  api.route("/admin", adminRoutes(ctx));
  api.notFound((c) => apiError(c, 404, "Not found.", "not_found"));
  app.route("/api", api);

  // ---------- server-rendered pages ----------
  app.get("/healthz", (c) => c.text("ok"));
  mountIcons(app);

  app.get("/", (c) => c.html(renderLandingPage({ loggedIn: Boolean(c.get("user")), appUrl: config.appUrl })));

  app.get("/r/:slug", (c) => {
    const user = c.get("user");
    const stored = repo.getReportBySlug(c.req.param("slug"));
    if (!stored) return c.html(renderNotFoundPage({ loggedIn: Boolean(user) }), 404);
    // The public page never shows the owner's delivery panel; owners use the app for that.
    return c.html(renderReportPage(toReportResponse(repo, config.appUrl, stored), { loggedIn: Boolean(user) }));
  });

  // ---------- React app ----------
  if (spa) {
    app.get("/assets/*", (c) => spa.asset(c));
    app.get("*", (c) => spa.index(c));
  } else {
    // Development: Vite serves the React app and proxies /api, / and /r/* here.
    app.get("*", (c) =>
      c.text(`This is the API server. In development, open the app via Vite: http://localhost:5173${c.req.path}`, 404),
    );
  }

  app.notFound((c) => c.html(renderNotFoundPage({ loggedIn: Boolean(c.get("user")) }), 404));
  app.onError((err, c) => {
    console.error("[web] unhandled error:", err);
    return c.req.path.startsWith("/api/")
      ? apiError(c, 500, "Something went wrong.")
      : c.text("Something went wrong.", 500);
  });

  return app;
}
