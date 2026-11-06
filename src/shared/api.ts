/**
 * JSON API contract between the Hono server (src/web) and the React client (client/).
 *
 * Conventions
 * - All endpoints live under /api, send/receive JSON, and use the session cookie for auth.
 * - Non-GET requests must send `Content-Type: application/json` and are Origin-checked (CSRF).
 * - Errors: non-2xx status with body `ApiError`. 401 = not logged in, 403 = forbidden/CSRF,
 *   404 = not found / not yours, 409 = conflict (duplicate, plan limit), 422 = validation,
 *   429 = rate limited, 502/503 = FPL problem (code "fpl_updating" while FPL is updating).
 *
 * Endpoints
 *   GET    /api/me                         -> MeResponse            (200 even when logged out: { user: null })
 *   POST   /api/signup   AuthRequest       -> MeResponse            (sets cookie)
 *   POST   /api/login    AuthRequest       -> MeResponse            (sets cookie)
 *   POST   /api/logout                     -> { ok: true }
 *
 *   GET    /api/leagues                    -> LeaguesResponse
 *   POST   /api/leagues  AddLeagueRequest  -> LeagueSummary         (201)
 *   GET    /api/leagues/:id                -> LeagueDetail
 *   PATCH  /api/leagues/:id UpdateLeagueRequest -> LeagueDetail
 *   DELETE /api/leagues/:id                -> { ok: true }
 *   POST   /api/leagues/:id/generate GenerateRequest -> ReportResponse (201; replaces same-period report)
 *
 *   GET    /api/reports/:slug              -> ReportResponse        (public; owner gets `owner` block)
 *   POST   /api/reports/:slug/deliver      -> ReportResponse        (owner only; sends to linked channels)
 *
 *   GET    /api/channels                   -> ChannelsResponse
 *   POST   /api/channels/telegram/link     -> TelegramLinkResponse  (409 if bot not configured)
 *   POST   /api/channels/discord DiscordRequest -> ChannelDto       (201; sends a test message first)
 *   PUT    /api/channels/email  EmailToggleRequest -> ChannelsResponse
 *   POST   /api/channels/:id/test          -> { ok: true }
 *   DELETE /api/channels/:id               -> { ok: true }
 *
 *   GET    /api/admin                      -> AdminResponse         (ADMIN_EMAILS only; 404 for everyone else)
 *
 * Server-rendered (not part of the SPA): GET / (landing) and GET /r/:slug (public bulletin page
 * with OG tags for WhatsApp/Telegram link previews). Every other non-/api GET serves the SPA.
 */

import type { Report, ReportKind } from "../core/types.ts";

export type { Report, ReportKind };

export interface ApiError {
  error: string; // human-readable, safe to show in the UI
  code?:
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "limit"
    | "validation"
    | "rate_limited"
    | "fpl_updating"
    | "fpl_error";
}

// ---------- auth ----------

export interface UserDto {
  id: number;
  email: string;
  plan: "free" | "pro";
  limits: { maxLeagues: number };
  /** true when this account is in ADMIN_EMAILS (shows the Admin link) */
  isAdmin: boolean;
}

export interface MeResponse {
  user: UserDto | null;
  /** feature flags the UI needs */
  features: { telegram: boolean; telegramBotUsername: string | null; email: boolean };
}

export interface AuthRequest {
  email: string;
  password: string;
}

// ---------- leagues ----------

export interface ReportSummary {
  slug: string;
  kind: ReportKind;
  title: string;
  periodKey: string;
  createdAt: string;
  /** path of the public server-rendered page, e.g. "/r/abc123" */
  url: string;
}

export interface LeagueSummary {
  id: number;
  fplLeagueId: number;
  name: string;
  gameweekEnabled: boolean;
  monthlyEnabled: boolean;
  createdAt: string;
  latestReports: ReportSummary[]; // newest first, max 3
}

export interface LeaguesResponse {
  leagues: LeagueSummary[];
  limits: { maxLeagues: number; used: number };
}

export interface AddLeagueRequest {
  /** league ID or FPL league URL */
  league: string;
}

export interface LeagueDetail extends LeagueSummary {
  /** ids of channels this league delivers to */
  channelIds: number[];
  reports: ReportSummary[]; // all, newest first
}

export interface UpdateLeagueRequest {
  gameweekEnabled?: boolean;
  monthlyEnabled?: boolean;
  channelIds?: number[];
}

export interface GenerateRequest {
  kind: ReportKind;
}

// ---------- reports ----------

export interface ReportResponse {
  slug: string;
  url: string; // absolute public URL (APP_URL + /r/slug)
  report: Report;
  /** pre-rendered texts so the client never needs the renderer */
  text: { whatsapp: string; plain: string };
  /** html fragment from renderReport(report, "html") — already escaped, safe to inject */
  html: string;
  whatsappUrl: string; // https://api.whatsapp.com/send?text=...
  createdAt: string;
  owner?: {
    leagueId: number;
    deliveries: Array<{
      channelId: number;
      label: string;
      kind: ChannelKind;
      status: "sent" | "failed";
      error: string | null;
      at: string;
    }>;
  };
}

// ---------- channels ----------

export type ChannelKind = "telegram" | "discord" | "email";

export interface ChannelDto {
  id: number;
  kind: ChannelKind;
  label: string; // e.g. Telegram group title, "#fpl-banter", email address
  active: boolean;
  createdAt: string;
}

export interface ChannelsResponse {
  channels: ChannelDto[];
}

export interface TelegramLinkResponse {
  url: string; // https://t.me/<bot>?startgroup=<code>
  expiresAt: string;
}

export interface DiscordRequest {
  webhookUrl: string;
  label?: string;
}

export interface EmailToggleRequest {
  enabled: boolean;
}

// ---------- admin (read-only) ----------

export interface AdminResponse {
  generatedAt: string;
  /** "since" counts are for the last 7 days */
  counts: {
    users: number;
    usersSince: number;
    leagues: number;
    fplLeagues: number;
    reports: number;
    reportsSince: number;
    channels: number;
    deliveriesSent: number;
    deliveriesFailed: number;
  };
  scheduler: {
    lastGameweekProcessed: number | null;
    lastTickAt: string | null;
    lastTickStatus: string | null;
  };
  users: Array<{ id: number; email: string; plan: string; createdAt: string; leagues: number; channels: number }>;
  leagues: Array<{
    id: number;
    fplLeagueId: number;
    name: string;
    owner: string;
    gameweekEnabled: boolean;
    monthlyEnabled: boolean;
    createdAt: string;
  }>;
  reports: Array<{ slug: string; kind: ReportKind; title: string; league: string; createdAt: string; url: string }>;
  deliveries: Array<{
    slug: string;
    league: string;
    kind: ChannelKind;
    label: string;
    status: "sent" | "failed";
    error: string | null;
    at: string;
  }>;
}
