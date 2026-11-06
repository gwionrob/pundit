import type { Config } from "../config.ts";
import { renderReport } from "../core/index.ts";
import type { Channel, Repo, StoredReport } from "../db/repo.ts";
import { sendDiscord } from "./discord.ts";
import { sendEmail, type EmailMessage } from "./email.ts";
import { sendTelegram, TelegramError } from "./telegram.ts";
import { reportFooter, reportUrl, whatsappShareUrl } from "./whatsapp.ts";

/** Transport functions — injectable so the dispatcher can be tested offline. */
export interface Senders {
  telegram(chatId: number, html: string): Promise<void>;
  discord(webhookUrl: string, content: string): Promise<void>;
  email(msg: EmailMessage): Promise<void>;
}

export function createSenders(config: Config): Senders {
  return {
    telegram: async (chatId, html) => {
      if (!config.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot is not configured");
      await sendTelegram(config.TELEGRAM_BOT_TOKEN, chatId, html);
    },
    discord: (url, content) => sendDiscord(url, content),
    email: (msg) => sendEmail(config, msg),
  };
}

export interface DeliveryDeps {
  repo: Repo;
  senders: Senders;
  appUrl: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildEmail(appUrl: string, stored: StoredReport, to: string): EmailMessage {
  const r = stored.report;
  const url = reportUrl(appUrl, stored.slug);
  const wa = whatsappShareUrl(renderReport(r, "whatsapp", { footer: reportFooter(appUrl, stored.slug) }));
  const subject = `${r.title} — ${r.leagueName}`;
  const text = `${renderReport(r, "plain")}\n\nView online: ${url}\nSend to your WhatsApp group: ${wa}\n`;
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 18px;margin:4px 8px 4px 0;border-radius:8px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${label}</a>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;line-height:1.5">
  <p>Your bulletin for <b>${escapeHtml(r.leagueName)}</b> is ready.</p>
  <p>${btn(wa, "Send to WhatsApp", "#25D366")}${btn(url, "View bulletin", "#4338ca")}</p>
  <hr style="border:none;border-top:1px solid #ddd">
  ${renderReport(r, "html")}
  <p style="color:#888;font-size:12px">Pundit · <a href="${escapeHtml(appUrl)}/dashboard">Manage bulletins</a></p>
</div>`;
  return { to, subject, text, html };
}

/** Sends one stored report to one channel. Throws on failure. */
export async function sendReportToChannel(deps: DeliveryDeps, stored: StoredReport, channel: Channel): Promise<void> {
  const footer = reportFooter(deps.appUrl, stored.slug);
  switch (channel.kind) {
    case "telegram":
      return deps.senders.telegram(Number(channel.config.chatId), renderReport(stored.report, "telegram", { footer }));
    case "discord":
      return deps.senders.discord(
        String(channel.config.webhookUrl),
        renderReport(stored.report, "discord", { footer }),
      );
    case "email":
      return deps.senders.email(buildEmail(deps.appUrl, stored, String(channel.config.email)));
  }
}

export type DeliveryOutcome = "sent" | "skipped" | "failed";

/**
 * Delivers a report to a channel and records the result. Idempotent: a
 * report already sent to a channel is skipped unless `force` is set.
 */
export async function deliver(
  deps: DeliveryDeps,
  stored: StoredReport,
  channel: Channel,
  { force = false } = {},
): Promise<DeliveryOutcome> {
  if (!channel.active) return "skipped";
  const prior = deps.repo.getDelivery(stored.id, channel.id);
  if (prior?.status === "sent" && !force) return "skipped";
  try {
    await sendReportToChannel(deps, stored, channel);
    deps.repo.recordDelivery(stored.id, channel.id, "sent");
    return "sent";
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    deps.repo.recordDelivery(stored.id, channel.id, "failed", message.slice(0, 500));
    if (e instanceof TelegramError && e.chatGone) deps.repo.updateChannel(channel.id, { active: false });
    console.warn(`[deliver] report ${stored.id} → channel ${channel.id} (${channel.kind}) failed: ${message}`);
    return "failed";
  }
}

/** Delivers a report to every active channel linked to its league. */
export async function deliverToLeagueChannels(
  deps: DeliveryDeps,
  stored: StoredReport,
  opts: { force?: boolean } = {},
): Promise<Record<DeliveryOutcome, number>> {
  const tally: Record<DeliveryOutcome, number> = { sent: 0, skipped: 0, failed: 0 };
  for (const ch of deps.repo.channelsForLeague(stored.league_id)) {
    tally[await deliver(deps, stored, ch, opts)] += 1;
  }
  return tally;
}

/** Sends a short "connected" message to verify a channel works. */
export async function sendTestMessage(deps: DeliveryDeps, channel: Channel, to?: string): Promise<void> {
  const text = "✅ Pundit is connected. Bulletins will appear here after each gameweek.";
  switch (channel.kind) {
    case "telegram":
      return deps.senders.telegram(Number(channel.config.chatId), text);
    case "discord":
      return deps.senders.discord(String(channel.config.webhookUrl), text);
    case "email":
      return deps.senders.email({
        to: to ?? String(channel.config.email),
        subject: "Pundit test email",
        text,
        html: `<p>${text}</p>`,
      });
  }
}
