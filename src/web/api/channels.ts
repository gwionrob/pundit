/** /api/channels: Telegram link codes, Discord webhooks, email toggle, test and delete. */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { isDiscordWebhookUrl } from "../../delivery/discord.ts";
import { sendTestMessage } from "../../delivery/index.ts";
import type { ChannelsResponse, TelegramLinkResponse } from "../../shared/api.ts";
import { apiError, currentUser, idParam, parseJson, requireUser, type Env, type WebContext } from "../context.ts";
import { toChannelDto } from "../dto.ts";

const TELEGRAM_CODE_TTL_MINUTES = 30;
const MAX_LABEL_LENGTH = 60;

const DiscordBody = z.object({ webhookUrl: z.string().max(500), label: z.string().max(200).optional() });
const EmailBody = z.object({ enabled: z.boolean() });

export function channelRoutes(ctx: WebContext) {
  const { config, repo, delivery } = ctx;
  const app = new Hono<Env>();
  app.use("*", requireUser);

  const list = (userId: number): ChannelsResponse => ({ channels: repo.listChannels(userId).map(toChannelDto) });
  const ownedChannel = (c: Context<Env>) => {
    const id = idParam(c);
    return id ? repo.getChannel(currentUser(c).id, id) : undefined;
  };
  const notFound = (c: Context) => apiError(c, 404, "Channel not found.", "not_found");

  app.get("/", (c) => c.json(list(currentUser(c).id)));

  app.post("/telegram/link", (c) => {
    if (!config.telegramEnabled) return apiError(c, 409, "Telegram isn't set up on this server.", "conflict");
    const code = repo.createTelegramCode(currentUser(c).id, TELEGRAM_CODE_TTL_MINUTES);
    const body: TelegramLinkResponse = {
      url: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?startgroup=${code}`,
      expiresAt: new Date(Date.now() + TELEGRAM_CODE_TTL_MINUTES * 60_000).toISOString(),
    };
    return c.json(body);
  });

  app.post("/discord", async (c) => {
    const user = currentUser(c);
    const body = await parseJson(c, DiscordBody);
    if (body instanceof Response) return body;
    const webhookUrl = body.webhookUrl.trim();
    const label = body.label?.trim().slice(0, MAX_LABEL_LENGTH) || "Discord channel";
    if (!isDiscordWebhookUrl(webhookUrl)) {
      return apiError(c, 422, "That isn't a Discord webhook URL. It should start with https://discord.com/api/webhooks/.", "validation");
    }
    if (repo.findChannel(user.id, "discord", (ch) => ch.config.webhookUrl === webhookUrl)) {
      return apiError(c, 409, "That Discord channel is already linked.", "conflict");
    }
    const channel = repo.addChannel(user.id, "discord", label, { webhookUrl });
    try {
      await sendTestMessage(delivery, channel);
      return c.json(toChannelDto(channel), 201);
    } catch (e) {
      repo.deleteChannel(user.id, channel.id);
      return apiError(c, 422, `Discord rejected the webhook: ${(e as Error).message}`, "validation");
    }
  });

  app.put("/email", async (c) => {
    const user = currentUser(c);
    const body = await parseJson(c, EmailBody);
    if (body instanceof Response) return body;
    const existing = repo.findChannel(user.id, "email", () => true);
    if (body.enabled && !existing) repo.addChannel(user.id, "email", `Email (${user.email})`, { email: user.email });
    if (!body.enabled && existing) repo.deleteChannel(user.id, existing.id);
    return c.json(list(user.id));
  });

  app.post("/:id/test", async (c) => {
    const channel = ownedChannel(c);
    if (!channel) return notFound(c);
    try {
      await sendTestMessage(delivery, channel);
      if (!channel.active) repo.updateChannel(channel.id, { active: true });
      return c.json({ ok: true as const });
    } catch (e) {
      return apiError(c, 502, `Test to ${channel.label} failed: ${(e as Error).message}`);
    }
  });

  app.delete("/:id", (c) => {
    const channel = ownedChannel(c);
    if (!channel) return notFound(c);
    repo.deleteChannel(currentUser(c).id, channel.id);
    return c.json({ ok: true as const });
  });

  return app;
}
