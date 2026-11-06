/** /api/leagues: list, add, detail, update, delete, generate a bulletin. */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Report } from "../../core/index.ts";
import { limitsFor, type League } from "../../db/repo.ts";
import type { LeaguesResponse } from "../../shared/api.ts";
import {
  apiError,
  currentUser,
  errorResponse,
  idParam,
  parseJson,
  requireUser,
  type Env,
  type WebContext,
} from "../context.ts";
import { toLeagueDetail, toLeagueSummary, toReportResponse } from "../dto.ts";

const AddBody = z.object({ league: z.string().max(500) });
const UpdateBody = z.object({
  gameweekEnabled: z.boolean().optional(),
  monthlyEnabled: z.boolean().optional(),
  channelIds: z.array(z.number().int()).max(100).optional(),
});
const GenerateBody = z.object({ kind: z.enum(["gameweek", "monthly", "standings"]) });

export function leagueRoutes(ctx: WebContext) {
  const { config, repo, core } = ctx;
  const app = new Hono<Env>();
  app.use("*", requireUser);

  /** The league from the :id param if it belongs to the current user. */
  const ownedLeague = (c: Context<Env>): League | undefined => {
    const id = idParam(c);
    return id ? repo.getLeague(currentUser(c).id, id) : undefined;
  };
  const notFound = (c: Context) => apiError(c, 404, "League not found.", "not_found");

  app.get("/", (c) => {
    const user = currentUser(c);
    const leagues = repo.listLeagues(user.id).map((l) => toLeagueSummary(repo, l));
    const body: LeaguesResponse = {
      leagues,
      limits: { maxLeagues: limitsFor(user.plan).maxLeagues, used: leagues.length },
    };
    return c.json(body);
  });

  app.post("/", async (c) => {
    const user = currentUser(c);
    const body = await parseJson(c, AddBody);
    if (body instanceof Response) return body;
    const fplId = core.parseLeagueId(body.league);
    if (fplId == null) {
      return apiError(
        c,
        422,
        "That doesn't look like a league ID or link. It should contain a number like 123456.",
        "validation",
      );
    }
    if (repo.findLeagueByFplId(user.id, fplId))
      return apiError(c, 409, "You've already added that league.", "conflict");
    // Check the plan limit before calling FPL, so we don't hit their API for nothing.
    const { maxLeagues } = limitsFor(user.plan);
    if (repo.countLeagues(user.id) >= maxLeagues) {
      return apiError(
        c,
        409,
        `Your plan allows ${maxLeagues} league${maxLeagues === 1 ? "" : "s"}. Remove one to add another.`,
        "limit",
      );
    }
    try {
      const info = await core.getLeagueInfo(fplId);
      const league = repo.addLeague(user, info.id, info.name);
      return c.json(toLeagueSummary(repo, league), 201);
    } catch (e) {
      return errorResponse(c, e);
    }
  });

  app.get("/:id", (c) => {
    const league = ownedLeague(c);
    return league ? c.json(toLeagueDetail(repo, league)) : notFound(c);
  });

  app.patch("/:id", async (c) => {
    const user = currentUser(c);
    const league = ownedLeague(c);
    if (!league) return notFound(c);
    const body = await parseJson(c, UpdateBody);
    if (body instanceof Response) return body;
    repo.updateLeagueSettings(user.id, league.id, {
      gameweek_enabled: body.gameweekEnabled ?? league.gameweek_enabled,
      monthly_enabled: body.monthlyEnabled ?? league.monthly_enabled,
    });
    if (body.channelIds) repo.setLeagueChannels(user.id, league.id, body.channelIds);
    return c.json(toLeagueDetail(repo, repo.getLeague(user.id, league.id)!));
  });

  app.delete("/:id", (c) => {
    const league = ownedLeague(c);
    if (!league) return notFound(c);
    repo.deleteLeague(currentUser(c).id, league.id);
    return c.json({ ok: true as const });
  });

  app.post("/:id/generate", async (c) => {
    const league = ownedLeague(c);
    if (!league) return notFound(c);
    const body = await parseJson(c, GenerateBody);
    if (body instanceof Response) return body;
    try {
      const build: Record<typeof body.kind, () => Promise<Report>> = {
        gameweek: () => core.buildGameweekReport(league.fpl_league_id),
        monthly: () => core.buildMonthlyReport(league.fpl_league_id),
        standings: () => core.buildStandingsReport(league.fpl_league_id),
      };
      const report = await build[body.kind]();
      if (report.leagueName && report.leagueName !== league.name) repo.updateLeagueName(league.id, report.leagueName);
      const { stored } = repo.saveReport(league.id, report, { replace: true });
      return c.json(toReportResponse(repo, config.appUrl, stored, league.id), 201);
    } catch (e) {
      return errorResponse(c, e);
    }
  });

  return app;
}
