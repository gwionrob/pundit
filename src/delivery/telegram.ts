import type { Repo } from "../db/repo.ts";
import { chunkText } from "./chunk.ts";

export const TELEGRAM_MAX = 4096;

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** true when the bot can no longer post to the chat (kicked, chat gone) */
    readonly chatGone: boolean,
  ) {
    super(message);
  }
}

async function call<T>(
  token: string,
  method: string,
  body: object,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!res.ok || !json.ok) {
    const desc = json.description ?? `HTTP ${res.status}`;
    const gone = res.status === 403 || /chat not found|kicked|blocked|deactivated/i.test(desc);
    throw new TelegramError(`Telegram ${method} failed: ${desc}`, res.status, gone);
  }
  return json.result as T;
}

/** Sends an HTML-formatted message, splitting on section boundaries if needed. */
export async function sendTelegram(
  token: string,
  chatId: number,
  html: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (const chunk of chunkText(html, TELEGRAM_MAX)) {
    await call(
      token,
      "sendMessage",
      { chat_id: chatId, text: chunk, parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      fetchImpl,
    );
  }
}

/**
 * Parses `/start <code>` or `/start@BotName <code>`. Returns the code, or
 * null if this isn't a start command (addressed to us) with a code.
 */
export function parseStartCommand(text: string | undefined, botUsername?: string): string | null {
  if (!text) return null;
  // Trimmed first, so no trailing \s* is needed (it would let \s+ and \s* fight over spaces).
  const m = /^\/start(?:@(\w+))?(?:\s+([\w-]{1,64}))?$/.exec(text.trim());
  if (!m) return null;
  const [, addressedTo, code] = m;
  if (addressedTo && botUsername && addressedTo.toLowerCase() !== botUsername.toLowerCase()) return null;
  return code ?? null;
}

// --- minimal Telegram update types we care about ---
interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}
interface TgMessage {
  message_id: number;
  chat: TgChat;
  text?: string;
  migrate_to_chat_id?: number;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  my_chat_member?: { chat: TgChat; new_chat_member: { status: string } };
}

export interface TelegramBotDeps {
  token: string;
  username: string;
  repo: Repo;
  appUrl: string;
  fetchImpl?: typeof fetch;
}

/** Handles a single update. Exported for tests. */
export async function handleUpdate(deps: TelegramBotDeps, update: TgUpdate): Promise<void> {
  const { repo, token, username, fetchImpl = fetch } = deps;
  const reply = (chatId: number, text: string) =>
    call(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" }, fetchImpl).catch((e) =>
      console.warn("[telegram] reply failed:", (e as Error).message),
    );

  const member = update.my_chat_member;
  if (member && ["left", "kicked"].includes(member.new_chat_member.status)) {
    for (const ch of repo.telegramChannelsByChat(member.chat.id)) repo.updateChannel(ch.id, { active: false });
    return;
  }

  const msg = update.message;
  if (!msg) return;

  // Group upgraded to supergroup: chat id changes.
  if (msg.migrate_to_chat_id) {
    for (const ch of repo.telegramChannelsByChat(msg.chat.id)) {
      repo.updateChannel(ch.id, { config: { ...ch.config, chatId: msg.migrate_to_chat_id } });
    }
    return;
  }

  const isStart = /^\/start(?:@\w+)?(?:\s|$)/.test(msg.text?.trim() ?? "");
  if (!isStart) return;
  const code = parseStartCommand(msg.text, username);

  if (msg.chat.type === "private") {
    await reply(
      msg.chat.id,
      `👋 I post Pundit bulletins into <b>group chats</b>. Link a group from ${deps.appUrl}/channels.`,
    );
    return;
  }
  if (msg.chat.type !== "group" && msg.chat.type !== "supergroup") return;
  if (!code) return; // a bare /start in a group — ignore

  const userId = repo.consumeTelegramCode(code);
  if (!userId) {
    await reply(msg.chat.id, `That link has expired. Generate a fresh one at ${deps.appUrl}/channels.`);
    return;
  }
  const title = msg.chat.title ?? "Telegram group";
  const existing = repo.findChannel(userId, "telegram", (c) => c.config.chatId === msg.chat.id);
  if (existing) {
    repo.updateChannel(existing.id, { label: title, config: { chatId: msg.chat.id, title }, active: true });
  } else {
    repo.addChannel(userId, "telegram", title, { chatId: msg.chat.id, title });
  }
  await reply(msg.chat.id, `✅ Connected! Pundit bulletins will be posted in <b>${escapeHtml(title)}</b>.`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Long-polls getUpdates until the signal aborts. */
export async function runTelegramPoller(deps: TelegramBotDeps, signal: AbortSignal): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let offset = 0;
  let backoff = 1000;
  console.log(`[telegram] polling as @${deps.username}`);
  while (!signal.aborted) {
    try {
      const updates = await call<TgUpdate[]>(
        deps.token,
        "getUpdates",
        { offset, timeout: 30, allowed_updates: ["message", "my_chat_member"] },
        fetchImpl,
        signal,
      );
      backoff = 1000;
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          await handleUpdate(deps, u);
        } catch (e) {
          console.error("[telegram] update handling failed:", e);
        }
      }
    } catch (e) {
      if (signal.aborted) break;
      console.warn("[telegram] poll error:", (e as Error).message);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}
