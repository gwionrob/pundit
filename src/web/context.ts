/**
 * Shared types and helpers for the web layer: dependency injection shape, the Hono env,
 * auth guard, JSON error responses and body validation.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { z } from "zod";
import type { Config } from "../config.ts";
import type * as coreModule from "../core/index.ts";
import { FplError } from "../core/index.ts";
import { LimitError, type Repo, type User } from "../db/repo.ts";
import type { DeliveryDeps, Senders } from "../delivery/index.ts";
import type { ApiError } from "../shared/api.ts";
import type { RateLimiter } from "./auth.ts";

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
  /**
   * Directory of the built React app (client/dist). Defaults to client/dist in production and
   * null in development (where Vite serves the SPA). Pass explicitly in tests.
   */
  spaDir?: string | null;
}

export type Env = { Variables: { user: User | undefined } };
export type AuthedEnv = { Variables: { user: User } };

/** Everything a route module needs, built once in createApp. */
export interface WebContext {
  config: Config;
  repo: Repo;
  core: WebCore;
  delivery: DeliveryDeps;
  authLimiter: RateLimiter;
}

export type ApiErrorCode = NonNullable<ApiError["code"]>;

export const apiError = (c: Context, status: ContentfulStatusCode, error: string, code?: ApiErrorCode) =>
  c.json<ApiError>(code ? { error, code } : { error }, status);

/** 401 unless a user is logged in; downstream handlers can rely on c.get("user"). */
export const requireUser: MiddlewareHandler<Env> = async (c, next) => {
  if (!c.get("user")) return apiError(c, 401, "Please log in.", "unauthorized");
  await next();
};

/** The logged-in user (only call behind requireUser). */
export const currentUser = (c: Context<Env>): User => c.get("user")!;

/** Maps stats-engine / repo errors to an HTTP status and a message safe to show users. */
export function errorResponse(c: Context, e: unknown) {
  if (e instanceof FplError) {
    switch (e.code) {
      case "not_found":
        return apiError(c, 404, "We couldn't find that league. Check the ID. Only classic leagues are supported.", "not_found");
      case "updating":
        return apiError(c, 503, "The FPL game is updating right now. Try again in a few minutes.", "fpl_updating");
      case "rate_limited":
        return apiError(c, 503, "FPL is busy right now. Try again in a minute.", "fpl_error");
      default:
        return apiError(c, 502, "We couldn't reach FPL just now. Try again shortly.", "fpl_error");
    }
  }
  if (e instanceof LimitError) return apiError(c, 409, e.message, "limit");
  console.error("[web]", e);
  return apiError(c, 500, "Something went wrong. Please try again.");
}

/**
 * Parses and validates a JSON body. Returns the data, or a 422 Response to return as-is.
 */
export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return apiError(c, 422, "Request body must be valid JSON.", "validation");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return apiError(c, 422, `Invalid request. ${where}${first?.message ?? ""}`.trim(), "validation");
  }
  return parsed.data;
}

/**
 * Client key for rate limiting. Only trusts forwarding headers behind a proxy we control;
 * otherwise they're spoofable and would let anyone dodge the login/signup rate limit.
 */
export function clientKey(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip");
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    return "local"; // no Node socket (e.g. app.request in tests)
  }
}

/** Parses a positive integer route param, or undefined. */
export function idParam(c: Context, name = "id"): number | undefined {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
