/** Maps database rows to the JSON shapes in src/shared/api.ts. */
import { renderReport } from "../core/index.ts";
import { limitsFor, type Channel, type League, type Repo, type StoredReport, type User } from "../db/repo.ts";
import { reportFooter, reportUrl, whatsappShareUrl } from "../delivery/whatsapp.ts";
import type { ChannelDto, LeagueDetail, LeagueSummary, ReportResponse, ReportSummary, UserDto } from "../shared/api.ts";

export const toUserDto = (u: User, isAdmin = false): UserDto => ({
  id: u.id,
  email: u.email,
  plan: u.plan === "pro" ? "pro" : "free",
  limits: limitsFor(u.plan),
  isAdmin,
});

export const toReportSummary = (r: StoredReport): ReportSummary => ({
  slug: r.slug,
  kind: r.kind,
  title: r.report.title,
  periodKey: r.period_key,
  createdAt: r.created_at,
  url: `/r/${r.slug}`,
});

export const LATEST_REPORTS = 3;

export const toLeagueSummary = (repo: Repo, l: League): LeagueSummary => ({
  id: l.id,
  fplLeagueId: l.fpl_league_id,
  name: l.name,
  gameweekEnabled: l.gameweek_enabled,
  monthlyEnabled: l.monthly_enabled,
  createdAt: l.created_at,
  latestReports: repo.listReports(l.id, LATEST_REPORTS).map(toReportSummary),
});

export const toLeagueDetail = (repo: Repo, l: League): LeagueDetail => ({
  ...toLeagueSummary(repo, l),
  channelIds: repo.channelsForLeague(l.id, { activeOnly: false }).map((ch) => ch.id),
  reports: repo.listReports(l.id).map(toReportSummary),
});

export const toChannelDto = (ch: Channel): ChannelDto => ({
  id: ch.id,
  kind: ch.kind,
  label: ch.label,
  active: ch.active,
  createdAt: ch.created_at,
});

/** Full report payload. Pass `ownerLeagueId` to include the owner-only delivery block. */
export function toReportResponse(
  repo: Repo,
  appUrl: string,
  stored: StoredReport,
  ownerLeagueId?: number,
): ReportResponse {
  const whatsapp = renderReport(stored.report, "whatsapp", { footer: reportFooter(appUrl, stored.slug) });
  const res: ReportResponse = {
    slug: stored.slug,
    url: reportUrl(appUrl, stored.slug),
    report: stored.report,
    text: { whatsapp, plain: renderReport(stored.report, "plain") },
    html: renderReport(stored.report, "html"),
    whatsappUrl: whatsappShareUrl(whatsapp),
    createdAt: stored.created_at,
  };
  if (ownerLeagueId !== undefined) {
    res.owner = {
      leagueId: ownerLeagueId,
      deliveries: repo.deliveriesForReport(stored.id).map((d) => ({
        channelId: d.channel_id,
        label: d.label,
        kind: d.kind,
        status: d.status,
        error: d.error,
        at: d.created_at,
      })),
    };
  }
  return res;
}
