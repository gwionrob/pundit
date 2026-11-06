import { describe, expect, it, vi } from "vitest";
import { chunkText } from "../../src/delivery/chunk.ts";
import { isDiscordWebhookUrl } from "../../src/delivery/discord.ts";
import type { EmailMessage } from "../../src/delivery/email.ts";
import { deliver, deliverToLeagueChannels, type Senders } from "../../src/delivery/index.ts";
import { handleUpdate, parseStartCommand, TelegramError } from "../../src/delivery/telegram.ts";
import { reportFooter, whatsappShareUrl } from "../../src/delivery/whatsapp.ts";
import { fakeReport, memRepo } from "./helpers.ts";

describe("chunkText", () => {
  it("returns short text unchanged", () => {
    expect(chunkText("hello", 10)).toEqual(["hello"]);
  });
  it("splits on section boundaries first", () => {
    const text = ["aaaa\naaaa", "bbbb\nbbbb", "cccc"].join("\n\n");
    const chunks = chunkText(text, 12);
    expect(chunks).toEqual(["aaaa\naaaa", "bbbb\nbbbb", "cccc"]);
    expect(chunks.every((c) => c.length <= 12)).toBe(true);
  });
  it("splits long sections by line and long lines hard", () => {
    const text = `${"x".repeat(25)}\nshort`;
    const chunks = chunkText(text, 10);
    expect(chunks.every((c) => c.length <= 10)).toBe(true);
    expect(chunks.join("")).toBe(text.replace("\n", ""));
  });
  it("packs multiple sections into one chunk when they fit", () => {
    expect(chunkText("a\n\nb\n\nc".padEnd(9, " "), 8)).toEqual(["a\n\nb", "c  "]);
  });
});

describe("whatsapp share link", () => {
  it("encodes text for the WhatsApp share link", () => {
    const url = whatsappShareUrl("*GW9* winner & loser\nline 2 😀");
    expect(url.startsWith("https://api.whatsapp.com/send?text=")).toBe(true);
    expect(decodeURIComponent(url.slice("https://api.whatsapp.com/send?text=".length))).toBe(
      "*GW9* winner & loser\nline 2 😀",
    );
  });
  it("footer links to the report", () => {
    expect(reportFooter("https://x.app/", "abc")).toContain("https://x.app/r/abc");
  });
});

describe("discord webhook validation", () => {
  it.each([
    ["https://discord.com/api/webhooks/123/abc-DEF_1", true],
    ["https://discordapp.com/api/webhooks/123/abc", true],
    ["https://canary.discord.com/api/webhooks/1/x", true],
    ["http://discord.com/api/webhooks/123/abc", false],
    ["https://evil.com/api/webhooks/123/abc", false],
    ["https://discord.com.evil.com/api/webhooks/1/x", false],
  ])("%s → %s", (url, ok) => expect(isDiscordWebhookUrl(url)).toBe(ok));
});

describe("parseStartCommand", () => {
  it.each([
    ["/start abc123", "abc123"],
    ["/start@PunditBot abc_-1", "abc_-1"],
    ["/start@punditbot abc", "abc"],
    ["/start", null],
    ["/start@OtherBot abc", null],
    ["hello /start abc", null],
    ["/startabc", null],
    [undefined, null],
  ])("%s → %s", (text, code) => expect(parseStartCommand(text as string | undefined, "PunditBot")).toBe(code));
});

describe("telegram handleUpdate", () => {
  const okFetch = () =>
    vi.fn(
      async () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }),
    ) as unknown as typeof fetch;

  it("links a group with a valid code and deactivates when kicked", async () => {
    const repo = memRepo();
    const user = repo.createUser("a@b.com", "h");
    const league = repo.addLeague(user, 1, "L");
    const code = repo.createTelegramCode(user.id);
    const fetchImpl = okFetch();
    const deps = { token: "t", username: "PunditBot", repo, appUrl: "http://x", fetchImpl };
    const chat = { id: -100, type: "supergroup" as const, title: "The Lads" };

    await handleUpdate(deps, { update_id: 1, message: { message_id: 1, chat, text: `/start@PunditBot ${code}` } });
    const [ch] = repo.listChannels(user.id);
    expect(ch).toMatchObject({ kind: "telegram", label: "The Lads", active: true, config: { chatId: -100 } });
    expect(repo.channelsForLeague(league.id)).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // confirmation reply

    // code is single-use
    await handleUpdate(deps, { update_id: 2, message: { message_id: 2, chat, text: `/start ${code}` } });
    expect(repo.listChannels(user.id)).toHaveLength(1);

    await handleUpdate(deps, { update_id: 3, my_chat_member: { chat, new_chat_member: { status: "kicked" } } });
    expect(repo.listChannels(user.id)[0]!.active).toBe(false);
  });

  it("follows group → supergroup migration", async () => {
    const repo = memRepo();
    const user = repo.createUser("a@b.com", "h");
    repo.addChannel(user.id, "telegram", "G", { chatId: -5, title: "G" });
    const deps = { token: "t", username: "PunditBot", repo, appUrl: "http://x", fetchImpl: okFetch() };
    await handleUpdate(deps, {
      update_id: 1,
      message: { message_id: 1, chat: { id: -5, type: "group" }, migrate_to_chat_id: -1005 },
    });
    expect(repo.listChannels(user.id)[0]!.config.chatId).toBe(-1005);
  });
});

describe("deliver", () => {
  function setup() {
    const repo = memRepo();
    const user = repo.createUser("a@b.com", "h");
    const league = repo.addLeague(user, 1, "L");
    const tg = repo.addChannel(user.id, "telegram", "TG", { chatId: -1 });
    const dc = repo.addChannel(user.id, "discord", "DC", { webhookUrl: "https://discord.com/api/webhooks/1/x" });
    const em = repo.addChannel(user.id, "email", "EM", { email: "a@b.com" });
    const { stored } = repo.saveReport(league.id, fakeReport());
    const senders = {
      telegram: vi.fn(async (_chatId: number, _html: string) => {}),
      discord: vi.fn(async (_url: string, _content: string) => {}),
      email: vi.fn(async (_msg: EmailMessage) => {}),
    } satisfies Senders;
    return { repo, league, tg, dc, em, stored, senders, deps: { repo, senders, appUrl: "https://app.test" } };
  }

  it("renders per channel, records, and is idempotent", async () => {
    const t = setup();
    expect(await deliverToLeagueChannels(t.deps, t.stored)).toEqual({ sent: 3, skipped: 0, failed: 0 });
    const [, html] = t.senders.telegram.mock.calls[0]!;
    expect(html).toContain("<b>");
    expect(html).toContain(`https://app.test/r/${t.stored.slug}`);
    const [, md] = t.senders.discord.mock.calls[0]!;
    expect(md).toContain("**");
    const [mail] = t.senders.email.mock.calls[0]!;
    expect(mail.html).toContain("https://api.whatsapp.com/send?text=");
    expect(await deliverToLeagueChannels(t.deps, t.stored)).toEqual({ sent: 0, skipped: 3, failed: 0 });
    expect(await deliverToLeagueChannels(t.deps, t.stored, { force: true })).toEqual({
      sent: 3,
      skipped: 0,
      failed: 0,
    });
  });

  it("records failures, retries them, and deactivates gone Telegram chats", async () => {
    const t = setup();
    t.senders.discord.mockRejectedValueOnce(new Error("500"));
    t.senders.telegram.mockRejectedValueOnce(new TelegramError("kicked", 403, true));
    expect(await deliverToLeagueChannels(t.deps, t.stored)).toEqual({ sent: 1, skipped: 0, failed: 2 });
    expect(t.repo.getDelivery(t.stored.id, t.dc.id)?.status).toBe("failed");
    expect(t.repo.getChannel(t.repo.getUser(1)!.id, t.tg.id)?.active).toBe(false);
    // failed discord is retried; inactive telegram is skipped (not linked as active)
    expect(await deliver(t.deps, t.stored, t.repo.getChannel(1, t.dc.id)!)).toBe("sent");
    expect(await deliver(t.deps, t.stored, t.repo.getChannel(1, t.tg.id)!)).toBe("skipped");
  });
});
