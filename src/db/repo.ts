import { randomBytes } from "node:crypto";
import type { Report, ReportKind } from "../core/index.ts";
import type { Db } from "./db.ts";

// ---------- row types ----------

export type Plan = "free" | "pro";

export interface User {
  id: number;
  email: string;
  password_hash: string;
  plan: Plan;
  created_at: string;
}

export interface League {
  id: number;
  user_id: number;
  fpl_league_id: number;
  name: string;
  gameweek_enabled: boolean;
  monthly_enabled: boolean;
  created_at: string;
}

export type ChannelKind = "telegram" | "discord" | "email";

export interface TelegramChannelConfig {
  chatId: number;
  title?: string;
}
export interface DiscordChannelConfig {
  webhookUrl: string;
}
export interface EmailChannelConfig {
  email: string;
}

export interface Channel {
  id: number;
  user_id: number;
  kind: ChannelKind;
  label: string;
  config: Record<string, unknown>;
  active: boolean;
  created_at: string;
}

export interface StoredReport {
  id: number;
  slug: string;
  league_id: number;
  kind: ReportKind;
  period_key: string;
  report: Report;
  created_at: string;
}

export interface Delivery {
  report_id: number;
  channel_id: number;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

// ---------- plan limits ----------

export interface PlanLimits {
  maxLeagues: number;
}

/** Single source of truth for what each plan allows. */
export function limitsFor(plan: Plan | string): PlanLimits {
  switch (plan) {
    case "pro":
      return { maxLeagues: 25 };
    default:
      return { maxLeagues: 3 };
  }
}

export class LimitError extends Error {}

// ---------- helpers ----------

type Row = Record<string, unknown>;

const toLeague = (r: Row): League => ({
  id: Number(r.id),
  user_id: Number(r.user_id),
  fpl_league_id: Number(r.fpl_league_id),
  name: String(r.name),
  gameweek_enabled: Number(r.gameweek_enabled) === 1,
  monthly_enabled: Number(r.monthly_enabled) === 1,
  created_at: String(r.created_at),
});

const toChannel = (r: Row): Channel => ({
  id: Number(r.id),
  user_id: Number(r.user_id),
  kind: r.kind as ChannelKind,
  label: String(r.label),
  config: JSON.parse(String(r.config_json)) as Record<string, unknown>,
  active: Number(r.active) === 1,
  created_at: String(r.created_at),
});

const toReport = (r: Row): StoredReport => ({
  id: Number(r.id),
  slug: String(r.slug),
  league_id: Number(r.league_id),
  kind: r.kind as ReportKind,
  period_key: String(r.period_key),
  report: JSON.parse(String(r.report_json)) as Report,
  created_at: String(r.created_at),
});

const toUser = (r: Row): User => ({
  id: Number(r.id),
  email: String(r.email),
  password_hash: String(r.password_hash),
  plan: (r.plan as Plan) ?? "free",
  created_at: String(r.created_at),
});

export function newSlug(): string {
  return randomBytes(12).toString("base64url");
}

/** Stable key identifying a report's period, used for de-duplication. */
export function periodKeyFor(report: Report): string {
  if (report.kind === "gameweek") return `gw${report.period.gameweek ?? "?"}`;
  if (report.kind === "monthly") {
    const m = String(report.period.month ?? 0).padStart(2, "0");
    return `${report.period.year ?? "?"}-${m}`;
  }
  return `standings-${Date.parse(report.generatedAt) || Date.now()}`;
}

// ---------- repository ----------

export class Repo {
  constructor(readonly db: Db) {}

  // users
  createUser(email: string, passwordHash: string): User {
    const row = this.db
      .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING *")
      .get(email.trim().toLowerCase(), passwordHash) as Row;
    return toUser(row);
  }
  getUserByEmail(email: string): User | undefined {
    const r = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as
      | Row
      | undefined;
    return r ? toUser(r) : undefined;
  }
  getUser(id: number): User | undefined {
    const r = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
    return r ? toUser(r) : undefined;
  }

  // sessions
  createSession(tokenHash: string, userId: number, expiresAt: Date): void {
    this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash, userId, expiresAt.toISOString());
  }
  getSessionUser(tokenHash: string, now = new Date()): User | undefined {
    const r = this.db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, now.toISOString()) as Row | undefined;
    return r ? toUser(r) : undefined;
  }
  deleteSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }
  purgeExpiredSessions(now = new Date()): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
  }

  // leagues
  listLeagues(userId: number): League[] {
    return (
      this.db.prepare("SELECT * FROM leagues WHERE user_id = ? ORDER BY created_at, id").all(userId) as Row[]
    ).map(toLeague);
  }
  countLeagues(userId: number): number {
    const r = this.db.prepare("SELECT COUNT(*) AS n FROM leagues WHERE user_id = ?").get(userId) as Row;
    return Number(r.n);
  }
  getLeague(userId: number, id: number): League | undefined {
    const r = this.db.prepare("SELECT * FROM leagues WHERE id = ? AND user_id = ?").get(id, userId) as
      | Row
      | undefined;
    return r ? toLeague(r) : undefined;
  }
  getLeagueById(id: number): League | undefined {
    const r = this.db.prepare("SELECT * FROM leagues WHERE id = ?").get(id) as Row | undefined;
    return r ? toLeague(r) : undefined;
  }
  findLeagueByFplId(userId: number, fplLeagueId: number): League | undefined {
    const r = this.db
      .prepare("SELECT * FROM leagues WHERE user_id = ? AND fpl_league_id = ?")
      .get(userId, fplLeagueId) as Row | undefined;
    return r ? toLeague(r) : undefined;
  }
  /** Adds a league, enforcing the user's plan limit. Throws LimitError. */
  addLeague(user: Pick<User, "id" | "plan">, fplLeagueId: number, name: string): League {
    const existing = this.findLeagueByFplId(user.id, fplLeagueId);
    if (existing) return existing;
    const { maxLeagues } = limitsFor(user.plan);
    if (this.countLeagues(user.id) >= maxLeagues) {
      throw new LimitError(
        `Your plan allows ${maxLeagues} league${maxLeagues === 1 ? "" : "s"}. Remove one to add another.`,
      );
    }
    const r = this.db
      .prepare("INSERT INTO leagues (user_id, fpl_league_id, name) VALUES (?, ?, ?) RETURNING *")
      .get(user.id, fplLeagueId, name) as Row;
    const league = toLeague(r);
    // New leagues post to every channel the user already has.
    for (const ch of this.listChannels(user.id)) this.linkLeagueChannel(league.id, ch.id);
    return league;
  }
  updateLeagueSettings(
    userId: number,
    id: number,
    s: { gameweek_enabled: boolean; monthly_enabled: boolean },
  ): void {
    this.db
      .prepare("UPDATE leagues SET gameweek_enabled = ?, monthly_enabled = ? WHERE id = ? AND user_id = ?")
      .run(s.gameweek_enabled ? 1 : 0, s.monthly_enabled ? 1 : 0, id, userId);
  }
  updateLeagueName(id: number, name: string): void {
    this.db.prepare("UPDATE leagues SET name = ? WHERE id = ?").run(name, id);
  }
  deleteLeague(userId: number, id: number): void {
    this.db.prepare("DELETE FROM leagues WHERE id = ? AND user_id = ?").run(id, userId);
  }
  /** All leagues across all users with the given auto-bulletin enabled. */
  leaguesWithAuto(kind: "gameweek" | "monthly"): League[] {
    const col = kind === "gameweek" ? "gameweek_enabled" : "monthly_enabled";
    return (this.db.prepare(`SELECT * FROM leagues WHERE ${col} = 1 ORDER BY id`).all() as Row[]).map(toLeague);
  }

  // channels
  listChannels(userId: number): Channel[] {
    return (
      this.db.prepare("SELECT * FROM channels WHERE user_id = ? ORDER BY created_at, id").all(userId) as Row[]
    ).map(toChannel);
  }
  getChannel(userId: number, id: number): Channel | undefined {
    const r = this.db.prepare("SELECT * FROM channels WHERE id = ? AND user_id = ?").get(id, userId) as
      | Row
      | undefined;
    return r ? toChannel(r) : undefined;
  }
  findChannel(userId: number, kind: ChannelKind, predicate: (c: Channel) => boolean): Channel | undefined {
    return this.listChannels(userId).find((c) => c.kind === kind && predicate(c));
  }
  /** Creates a channel and links it to all of the user's leagues. */
  addChannel(userId: number, kind: ChannelKind, label: string, config: object): Channel {
    const r = this.db
      .prepare("INSERT INTO channels (user_id, kind, label, config_json) VALUES (?, ?, ?, ?) RETURNING *")
      .get(userId, kind, label, JSON.stringify(config)) as Row;
    const ch = toChannel(r);
    for (const lg of this.listLeagues(userId)) this.linkLeagueChannel(lg.id, ch.id);
    return ch;
  }
  updateChannel(id: number, fields: { label?: string; config?: object; active?: boolean }): void {
    if (fields.label !== undefined) this.db.prepare("UPDATE channels SET label = ? WHERE id = ?").run(fields.label, id);
    if (fields.config !== undefined)
      this.db.prepare("UPDATE channels SET config_json = ? WHERE id = ?").run(JSON.stringify(fields.config), id);
    if (fields.active !== undefined)
      this.db.prepare("UPDATE channels SET active = ? WHERE id = ?").run(fields.active ? 1 : 0, id);
  }
  deleteChannel(userId: number, id: number): void {
    this.db.prepare("DELETE FROM channels WHERE id = ? AND user_id = ?").run(id, userId);
  }
  telegramChannelsByChat(chatId: number): Channel[] {
    return (
      this.db
        .prepare("SELECT * FROM channels WHERE kind = 'telegram' AND json_extract(config_json, '$.chatId') = ?")
        .all(chatId) as Row[]
    ).map(toChannel);
  }

  // league <-> channel
  linkLeagueChannel(leagueId: number, channelId: number): void {
    this.db
      .prepare("INSERT OR IGNORE INTO league_channels (league_id, channel_id) VALUES (?, ?)")
      .run(leagueId, channelId);
  }
  setLeagueChannels(userId: number, leagueId: number, channelIds: number[]): void {
    const league = this.getLeague(userId, leagueId);
    if (!league) return;
    const owned = new Set(this.listChannels(userId).map((c) => c.id));
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM league_channels WHERE league_id = ?").run(leagueId);
      for (const id of channelIds) if (owned.has(id)) this.linkLeagueChannel(leagueId, id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  channelsForLeague(leagueId: number, { activeOnly = true } = {}): Channel[] {
    return (
      this.db
        .prepare(
          `SELECT c.* FROM channels c JOIN league_channels lc ON lc.channel_id = c.id
           WHERE lc.league_id = ? ${activeOnly ? "AND c.active = 1" : ""} ORDER BY c.id`,
        )
        .all(leagueId) as Row[]
    ).map(toChannel);
  }

  // reports
  /**
   * Stores a report. For gameweek/monthly reports the (league, kind, period)
   * is unique: with `replace` the existing row's content is refreshed (slug
   * kept), otherwise the existing row is returned untouched.
   * Returns the stored report and whether it was newly created.
   */
  saveReport(leagueId: number, report: Report, { replace = false } = {}): { stored: StoredReport; created: boolean } {
    const periodKey = periodKeyFor(report);
    const existing = this.db
      .prepare("SELECT * FROM reports WHERE league_id = ? AND kind = ? AND period_key = ?")
      .get(leagueId, report.kind, periodKey) as Row | undefined;
    if (existing) {
      if (replace) {
        this.db
          .prepare("UPDATE reports SET report_json = ?, created_at = ? WHERE id = ?")
          .run(JSON.stringify(report), new Date().toISOString(), Number(existing.id));
        return { stored: this.getReportBySlug(String(existing.slug))!, created: false };
      }
      return { stored: toReport(existing), created: false };
    }
    const r = this.db
      .prepare(
        "INSERT INTO reports (slug, league_id, kind, period_key, report_json) VALUES (?, ?, ?, ?, ?) RETURNING *",
      )
      .get(newSlug(), leagueId, report.kind, periodKey, JSON.stringify(report)) as Row;
    return { stored: toReport(r), created: true };
  }
  getReportBySlug(slug: string): StoredReport | undefined {
    const r = this.db.prepare("SELECT * FROM reports WHERE slug = ?").get(slug) as Row | undefined;
    return r ? toReport(r) : undefined;
  }
  getReport(leagueId: number, kind: ReportKind, periodKey: string): StoredReport | undefined {
    const r = this.db
      .prepare("SELECT * FROM reports WHERE league_id = ? AND kind = ? AND period_key = ?")
      .get(leagueId, kind, periodKey) as Row | undefined;
    return r ? toReport(r) : undefined;
  }
  listReports(leagueId: number, limit = 50): StoredReport[] {
    return (
      this.db
        .prepare("SELECT * FROM reports WHERE league_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(leagueId, limit) as Row[]
    ).map(toReport);
  }

  // deliveries
  getDelivery(reportId: number, channelId: number): Delivery | undefined {
    return this.db
      .prepare("SELECT * FROM deliveries WHERE report_id = ? AND channel_id = ?")
      .get(reportId, channelId) as Delivery | undefined;
  }
  recordDelivery(reportId: number, channelId: number, status: "sent" | "failed", error?: string): void {
    this.db
      .prepare(
        `INSERT INTO deliveries (report_id, channel_id, status, error) VALUES (?, ?, ?, ?)
         ON CONFLICT (report_id, channel_id) DO UPDATE SET status = excluded.status,
           error = excluded.error, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .run(reportId, channelId, status, error ?? null);
  }
  deliveriesForReport(reportId: number): (Delivery & { label: string; kind: ChannelKind })[] {
    return this.db
      .prepare(
        `SELECT d.*, c.label, c.kind FROM deliveries d JOIN channels c ON c.id = d.channel_id
         WHERE d.report_id = ? ORDER BY d.created_at`,
      )
      .all(reportId) as unknown as (Delivery & { label: string; kind: ChannelKind })[];
  }

  // telegram link codes
  createTelegramCode(userId: number, ttlMinutes = 30): string {
    const code = randomBytes(9).toString("base64url"); // 12 chars, [A-Za-z0-9_-] — valid for t.me start param
    const expires = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    this.db.prepare("INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)").run(code, userId, expires);
    return code;
  }
  /** Consumes a code, returning its user id if valid and unexpired. */
  consumeTelegramCode(code: string, now = new Date()): number | undefined {
    const r = this.db
      .prepare("DELETE FROM telegram_link_codes WHERE code = ? RETURNING user_id, expires_at")
      .get(code) as { user_id: number; expires_at: string } | undefined;
    if (!r || r.expires_at <= now.toISOString()) return undefined;
    return Number(r.user_id);
  }

  // job state
  getState(key: string): string | undefined {
    const r = this.db.prepare("SELECT value FROM job_state WHERE key = ?").get(key) as { value: string } | undefined;
    return r?.value;
  }
  setState(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO job_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }
}
