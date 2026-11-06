import { chunkText } from "./chunk.ts";

export const DISCORD_MAX = 2000;

const WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/;

export function isDiscordWebhookUrl(url: string): boolean {
  return WEBHOOK_RE.test(url.trim());
}

export async function sendDiscord(webhookUrl: string, content: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!isDiscordWebhookUrl(webhookUrl)) throw new Error("Not a valid Discord webhook URL");
  for (const chunk of chunkText(content, DISCORD_MAX)) {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Never let a bulletin ping @everyone / roles.
      body: JSON.stringify({ content: chunk, allowed_mentions: { parse: [] }, username: "Pundit" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Discord webhook failed (${res.status}) ${body.slice(0, 200)}`);
    }
  }
}
