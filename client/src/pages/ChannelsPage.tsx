import { useState, type FormEvent, type ReactNode } from "react";
import type { ChannelDto, ChannelKind } from "../../../src/shared/api.ts";
import { button, Card, Input, Label, List, Pill } from "../../../src/shared/components/ui.tsx";
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
import { FlashNotice, Notice, type Flash } from "../components/Notice.tsx";

const KIND_ICON: Record<ChannelKind, string> = { telegram: "✈️", discord: "🎮", email: "✉️" };
const KIND_NAME: Record<ChannelKind, string> = { telegram: "Telegram", discord: "Discord", email: "Email" };

export function ChannelsPage() {
  const channels = useChannels();
  // One status line for the page, set by whichever section did something last.
  const [status, setStatus] = useState<Flash | null>(null);
  const linked = channels.data?.channels ?? [];

  return (
    <>
      <title>Channels · Pundit</title>
      <h1>Channels</h1>
      <p className="text-muted">
        Every bulletin has a <b>Send to WhatsApp</b> button: tap it, pick your group and send. Link a channel below and
        bulletins are posted there automatically too.
      </p>
      <FlashNotice flash={status} />

      <Card>
        <h2>Your channels</h2>
        {channels.isPending && <p className="m-0 text-sm text-muted">Loading…</p>}
        {channels.isError && <Notice kind="err">{errorMessage(channels.error)}</Notice>}
        {channels.isSuccess &&
          (linked.length ? (
            <List>
              {linked.map((ch) => (
                <ChannelRow key={ch.id} channel={ch} onStatus={setStatus} />
              ))}
            </List>
          ) : (
            <p className="m-0 text-sm text-muted">None yet. Add one below.</p>
          ))}
      </Card>

      <Card>
        <h2>Add a channel</h2>
        <div className="divide-y divide-line">
          <TelegramOption />
          <DiscordOption onStatus={setStatus} />
          <EmailOption channels={linked} onStatus={setStatus} />
        </div>
      </Card>
    </>
  );
}

type OnStatus = (flash: Flash) => void;

/** Icon tile used in both lists. */
function KindIcon({ kind }: { kind: ChannelKind }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-lg">
      {KIND_ICON[kind]}
    </span>
  );
}

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
    <li className="flex flex-wrap items-center gap-3">
      <KindIcon kind={channel.kind} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold wrap-anywhere">{channel.label}</div>
        <div className="text-sm text-muted">
          {KIND_NAME[channel.kind]}
          {!channel.active && (
            <>
              {" "}
              <Pill tone="bad">inactive, re-link to resume</Pill>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-2 max-sm:w-full max-sm:pl-[52px]">
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
      </div>
    </li>
  );
}

/** One row of "Add a channel": icon, title and description, with the action on the right (below on phones). */
function Option({
  kind,
  title,
  children,
  action,
  below,
}: {
  kind: ChannelKind;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** full-width content under the row, e.g. a form */
  below?: ReactNode;
}) {
  return (
    <section className="py-4 first:pt-1 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <KindIcon kind={kind} />
        <div className="min-w-[200px] flex-1">
          <h3 className="mb-0.5">{title}</h3>
          <div className="text-sm text-muted [&_p]:m-0">{children}</div>
        </div>
        {action && <div className="shrink-0 max-sm:w-full max-sm:pl-[52px]">{action}</div>}
      </div>
      {below && <div className="mt-4 sm:pl-[52px]">{below}</div>}
    </section>
  );
}

function TelegramOption() {
  const me = useMe();
  const link = useTelegramLink();
  const features = me.data?.features;

  if (!features?.telegram) {
    return (
      <Option kind="telegram" title="Telegram group" action={<Pill>Coming soon</Pill>}>
        <p>Add our bot to a Telegram group and bulletins post there automatically.</p>
      </Option>
    );
  }

  if (link.data) {
    return (
      <Option
        kind="telegram"
        title="Telegram group"
        action={
          <a
            className={button({ variant: "primary", size: "sm" })}
            href={link.data.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Telegram
          </a>
        }
      >
        <p>
          Tap <b>Open Telegram</b>, choose your group, and @{features.telegramBotUsername} links it. The link works once
          and expires in 30 minutes. Come back here afterwards.
        </p>
      </Option>
    );
  }

  return (
    <Option
      kind="telegram"
      title="Telegram group"
      action={
        <button
          className={button({ variant: "primary", size: "sm" })}
          type="button"
          onClick={() => link.mutate()}
          disabled={link.isPending}
        >
          {link.isPending ? "Getting link…" : "Link a group"}
        </button>
      }
      below={link.isError ? <Notice kind="err">{errorMessage(link.error)}</Notice> : undefined}
    >
      <p>Add our bot to a Telegram group and bulletins post there automatically.</p>
    </Option>
  );
}

function DiscordOption({ onStatus }: { onStatus: OnStatus }) {
  const addDiscord = useAddDiscord();
  const [open, setOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [label, setLabel] = useState("");

  const close = () => {
    setOpen(false);
    setWebhookUrl("");
    setLabel("");
    addDiscord.reset();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    addDiscord.mutate(
      { webhookUrl: webhookUrl.trim(), ...(label.trim() ? { label: label.trim() } : {}) },
      {
        onSuccess: (ch) => {
          close();
          onStatus({ kind: "ok", text: `Linked ${ch.label}. We sent a test message there.` });
        },
      },
    );
  };

  return (
    <Option
      kind="discord"
      title="Discord channel"
      action={
        !open && (
          <button className={button({ variant: "primary", size: "sm" })} type="button" onClick={() => setOpen(true)}>
            Add a webhook
          </button>
        )
      }
      below={
        open && (
          <form className="space-y-3" onSubmit={onSubmit}>
            <p className="text-sm">
              In Discord, open <b>Channel settings → Integrations → Webhooks → New webhook</b>, then copy its URL.
            </p>
            {addDiscord.isError && <Notice kind="err">{errorMessage(addDiscord.error)}</Notice>}
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div>
                <Label htmlFor="webhook">Webhook URL</Label>
                <Input
                  id="webhook"
                  type="url"
                  required
                  autoFocus
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
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={button({ variant: "primary" })} type="submit" disabled={addDiscord.isPending}>
                {addDiscord.isPending ? "Checking webhook…" : "Add Discord channel"}
              </button>
              <button className={button()} type="button" onClick={close}>
                Cancel
              </button>
            </div>
          </form>
        )
      }
    >
      <p>Post bulletins to a channel in your Discord server using a webhook.</p>
    </Option>
  );
}

function EmailOption({ channels, onStatus }: { channels: ChannelDto[]; onStatus: OnStatus }) {
  const me = useMe();
  const toggle = useToggleEmail();
  const emailOn = channels.some((ch) => ch.kind === "email");
  const email = me.data?.user?.email;

  const onToggle = () =>
    toggle.mutate(
      { enabled: !emailOn },
      {
        onSuccess: () =>
          onStatus({
            kind: "ok",
            text: emailOn ? "Email notifications turned off." : `We'll email ${email ?? "you"} for new bulletins.`,
          }),
        onError: (err) => onStatus({ kind: "err", text: errorMessage(err) }),
      },
    );

  return (
    <Option
      kind="email"
      title="Email"
      action={
        <button
          className={button({ variant: emailOn ? "default" : "primary", size: "sm" })}
          type="button"
          onClick={onToggle}
          disabled={toggle.isPending}
        >
          {toggle.isPending ? "Saving…" : emailOn ? "Turn off" : "Turn on"}
        </button>
      }
    >
      {emailOn ? (
        <p>
          On. New bulletins are emailed to <Address email={email} />.
        </p>
      ) : (
        <p>
          Get an email with the share button whenever a new bulletin is ready, sent to <Address email={email} />.
        </p>
      )}
    </Option>
  );
}

/** The account's email. Wraps mid-address only if it can't fit on a line, so it never overflows. */
function Address({ email }: { email: string | undefined }) {
  return <span className="font-medium wrap-anywhere text-ink">{email ?? "your account's address"}</span>;
}
