import { useState, type FormEvent } from "react";
import type { ChannelDto } from "../../../src/shared/api.ts";
import {
  errorMessage,
  useAddDiscord,
  useChannels,
  useDeleteChannel,
  useMe,
  useTelegramLink,
  useTestChannel,
  useToggleEmail,
} from "../api.ts";
import { button, Card, Input, Label, List, Pill } from "../../../src/shared/components/ui.tsx";
import { FlashNotice, Notice, type Flash } from "../components/Notice.tsx";

export function ChannelsPage() {
  const channels = useChannels();
  // One status line for the page, set by whichever card did something last.
  const [status, setStatus] = useState<Flash | null>(null);

  return (
    <>
      <title>Channels · Pundit</title>
      <h1>Channels</h1>
      <p className="text-muted">
        Every bulletin has a <b>Send to WhatsApp</b> button: tap it, pick your group and send. Channels below receive
        bulletins automatically.
      </p>
      <FlashNotice flash={status} />

      <Card>
        <h2>Your channels</h2>
        {channels.isPending && <p className="text-sm text-muted">Loading…</p>}
        {channels.isError && <Notice kind="err">{errorMessage(channels.error)}</Notice>}
        {channels.isSuccess &&
          (channels.data.channels.length ? (
            <List>
              {channels.data.channels.map((ch) => (
                <ChannelRow key={ch.id} channel={ch} onStatus={setStatus} />
              ))}
            </List>
          ) : (
            <p className="text-sm text-muted">No channels linked yet.</p>
          ))}
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <TelegramCard />
        <DiscordCard onStatus={setStatus} />
        <EmailCard channels={channels.data?.channels ?? []} onStatus={setStatus} />
      </div>
    </>
  );
}

type OnStatus = (flash: Flash) => void;

function ChannelRow({ channel, onStatus }: { channel: ChannelDto; onStatus: OnStatus }) {
  const test = useTestChannel();
  const remove = useDeleteChannel();

  const onTest = () =>
    test.mutate(channel.id, {
      onSuccess: () => onStatus({ kind: "ok", text: `Test message sent to ${channel.label}.` }),
      onError: (err) => onStatus({ kind: "err", text: errorMessage(err) }),
    });

  const onRemove = () =>
    remove.mutate(channel.id, {
      onSuccess: () => onStatus({ kind: "ok", text: `Removed ${channel.label}.` }),
      onError: (err) => onStatus({ kind: "err", text: errorMessage(err) }),
    });

  return (
    <li className="flex flex-wrap items-center justify-between gap-2.5">
      <span>
        {channel.label} <Pill>{channel.kind}</Pill>{" "}
        {!channel.active && <Pill tone="bad">inactive, re-link to resume</Pill>}
      </span>
      <span className="flex flex-wrap items-center gap-2.5">
        <button className={button({ size: "sm" })} type="button" onClick={onTest} disabled={test.isPending}>
          {test.isPending ? "Sending…" : "Send test"}
        </button>
        <button
          className={button({ variant: "danger", size: "sm" })}
          type="button"
          onClick={onRemove}
          disabled={remove.isPending}
        >
          Remove
        </button>
      </span>
    </li>
  );
}

function TelegramCard() {
  const me = useMe();
  const link = useTelegramLink();
  const features = me.data?.features;

  return (
    <Card>
      <h2>Telegram group</h2>
      {!features?.telegram ? (
        <p className="text-sm text-muted">Telegram isn't set up on this server yet.</p>
      ) : link.data ? (
        <div className="space-y-3">
          <p className="text-sm">Tap the button, choose your group, and the bot links it automatically.</p>
          <a className={button({ variant: "primary" })} href={link.data.url} target="_blank" rel="noopener noreferrer">
            Add @{features.telegramBotUsername} to a group
          </a>
          <p className="text-sm text-muted">
            This link works once and expires in 30 minutes. Come back here afterwards.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">Add our bot to a Telegram group and bulletins will post there automatically.</p>
          {link.isError && <Notice kind="err">{errorMessage(link.error)}</Notice>}
          <div>
            <button
              className={button({ variant: "primary" })}
              type="button"
              onClick={() => link.mutate()}
              disabled={link.isPending}
            >
              {link.isPending ? "Getting link…" : "Link a Telegram group"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DiscordCard({ onStatus }: { onStatus: OnStatus }) {
  const addDiscord = useAddDiscord();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [label, setLabel] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    addDiscord.mutate(
      { webhookUrl: webhookUrl.trim(), ...(label.trim() ? { label: label.trim() } : {}) },
      {
        onSuccess: (ch) => {
          setWebhookUrl("");
          setLabel("");
          onStatus({ kind: "ok", text: `Linked ${ch.label}. We sent a test message there.` });
        },
      },
    );
  };

  return (
    <Card>
      <h2>Discord channel</h2>
      <form className="space-y-3" onSubmit={onSubmit}>
        <p className="text-sm">
          In Discord, open <b>Channel settings → Integrations → Webhooks → New webhook</b>, copy its URL and paste it
          here.
        </p>
        {addDiscord.isError && <Notice kind="err">{errorMessage(addDiscord.error)}</Notice>}
        <div>
          <Label htmlFor="webhook">Webhook URL</Label>
          <Input
            id="webhook"
            type="url"
            required
            placeholder="https://discord.com/api/webhooks/…"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="label">Name (optional)</Label>
          <Input
            id="label"
            type="text"
            placeholder="#fpl-banter"
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div>
          <button className={button({ variant: "primary" })} type="submit" disabled={addDiscord.isPending}>
            {addDiscord.isPending ? "Checking webhook…" : "Add Discord channel"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function EmailCard({ channels, onStatus }: { channels: ChannelDto[]; onStatus: OnStatus }) {
  const me = useMe();
  const toggle = useToggleEmail();
  const emailOn = channels.some((ch) => ch.kind === "email");
  const email = me.data?.user?.email ?? "your email";

  const onToggle = () =>
    toggle.mutate(
      { enabled: !emailOn },
      {
        onSuccess: () =>
          onStatus({
            kind: "ok",
            text: emailOn ? "Email notifications turned off." : `We'll email ${email} for new bulletins.`,
          }),
        onError: (err) => onStatus({ kind: "err", text: errorMessage(err) }),
      },
    );

  return (
    <Card>
      <h2>Email</h2>
      <p className="text-sm">Get an email with the share button whenever a new bulletin is ready.</p>
      <button
        className={button({ variant: emailOn ? "default" : "primary" })}
        type="button"
        onClick={onToggle}
        disabled={toggle.isPending}
      >
        {emailOn ? "Turn off email" : `Email me at ${email}`}
      </button>
    </Card>
  );
}
