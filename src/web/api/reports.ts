/** /api/reports/:slug: public report payload, and owner-triggered delivery. */
import { Hono, type Context } from "hono";
import type { StoredReport } from "../../db/repo.ts";
import { deliverToLeagueChannels } from "../../delivery/index.ts";
import { apiError, requireUser, type Env, type WebContext } from "../context.ts";
import { toReportResponse } from "../dto.ts";

export function reportRoutes(ctx: WebContext) {
  const { config, repo, delivery } = ctx;
  const app = new Hono<Env>();

  /** The league id if the current user owns the report's league. */
  const ownerLeagueId = (c: Context<Env>, stored: StoredReport): number | undefined => {
    const user = c.get("user");
    const league = repo.getLeagueById(stored.league_id);
    return user && league && league.user_id === user.id ? league.id : undefined;
  };
  const notFound = (c: Context) => apiError(c, 404, "Bulletin not found.", "not_found");

  app.get("/:slug", (c) => {
    const stored = repo.getReportBySlug(c.req.param("slug"));
    if (!stored) return notFound(c);
    return c.json(toReportResponse(repo, config.appUrl, stored, ownerLeagueId(c, stored)));
  });

  app.post("/:slug/deliver", requireUser, async (c) => {
    const stored = repo.getReportBySlug(c.req.param("slug"));
    const leagueId = stored ? ownerLeagueId(c, stored) : undefined;
    if (!stored || leagueId === undefined) return notFound(c);
    await deliverToLeagueChannels(delivery, stored, { force: true });
    return c.json(toReportResponse(repo, config.appUrl, stored, leagueId));
  });

  return app;
}
