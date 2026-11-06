import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ChannelDto, LeagueDetail } from "../../../src/shared/api.ts";
import { errorMessage, useChannels, useDeleteLeague, useLeague, useUpdateLeague } from "../api.ts";
import { button, Card, Checkbox, List, Pill } from "../../../src/shared/components/ui.tsx";
import { Notice } from "../components/Notice.tsx";
import { flashState } from "../components/flash.ts";
import { KIND_LABEL, formatDate } from "../format.ts";

export function LeagueSettingsPage() {
  const id = Number(useParams().id);
  const league = useLeague(id);
  const channels = useChannels();

  if (league.isPending) return <p className="text-muted">Loading league…</p>;
  if (league.isError) return <Notice kind="err">{errorMessage(league.error)}</Notice>;

  return (
    <>
      <title>{`${league.data.name} · Pundit`}</title>
      <p className="text-sm">
        <Link to="/dashboard">← Your leagues</Link>
      </p>
      <h1>{league.data.name}</h1>
      <p className="text-muted">League ID {league.data.fplLeagueId}</p>

      {/* key: reset the form's local state if the saved settings change underneath it */}
      <SettingsForm
        key={`${league.data.id}:${league.data.gameweekEnabled}:${league.data.monthlyEnabled}:${league.data.channelIds.join(",")}`}
        league={league.data}
        channels={channels.data?.channels ?? []}
      />
      <PastBulletins league={league.data} />
      <RemoveLeague league={league.data} />
    </>
  );
}

function SettingsForm({ league, channels }: { league: LeagueDetail; channels: ChannelDto[] }) {
  const update = useUpdateLeague(league.id);
  const [gameweek, setGameweek] = useState(league.gameweekEnabled);
  const [monthly, setMonthly] = useState(league.monthlyEnabled);
  const [channelIds, setChannelIds] = useState(() => new Set(league.channelIds));
  const [saved, setSaved] = useState(false);

  const toggleChannel = (id: number, on: boolean) => {
    setChannelIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    update.mutate(
      { gameweekEnabled: gameweek, monthlyEnabled: monthly, channelIds: [...channelIds] },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <Card>
      <h2>Automatic bulletins</h2>
      {saved && <Notice kind="ok">Settings saved.</Notice>}
      {update.isError && <Notice kind="err">{errorMessage(update.error)}</Notice>}

      <form onSubmit={onSubmit}>
        <Checkbox checked={gameweek} onChange={(e) => setGameweek(e.target.checked)}>
          After every gameweek
        </Checkbox>
        <Checkbox checked={monthly} onChange={(e) => setMonthly(e.target.checked)}>
          Manager of the month, after the last gameweek of each month
        </Checkbox>

        <h3 className="mt-[18px]">Post to</h3>
        {channels.length ? (
          channels.map((ch) => (
            <Checkbox
              key={ch.id}
              checked={channelIds.has(ch.id)}
              onChange={(e) => toggleChannel(ch.id, e.target.checked)}
            >
              {ch.label} <Pill>{ch.kind}</Pill> {!ch.active && <Pill tone="bad">inactive</Pill>}
            </Checkbox>
          ))
        ) : (
          <p className="text-sm text-muted">
            No channels yet. Every bulletin has a one-tap WhatsApp share button, and you can{" "}
            <Link to="/channels">link Telegram, Discord or email</Link> too.
          </p>
        )}

        <button className={button({ variant: "primary", className: "mt-3" })} type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save settings"}
        </button>
      </form>
    </Card>
  );
}

function PastBulletins({ league }: { league: LeagueDetail }) {
  return (
    <Card>
      <h2>Past bulletins</h2>
      {league.reports.length ? (
        <List>
          {league.reports.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-center justify-between gap-2.5">
              <span>
                <Link to={`/reports/${r.slug}`}>{r.title}</Link> <Pill>{KIND_LABEL[r.kind]}</Pill>
              </span>
              <span className="text-sm text-muted">{formatDate(r.createdAt)}</span>
            </li>
          ))}
        </List>
      ) : (
        <p className="text-sm text-muted">None yet.</p>
      )}
    </Card>
  );
}

function RemoveLeague({ league }: { league: LeagueDetail }) {
  const remove = useDeleteLeague();
  const navigate = useNavigate();

  const onRemove = () => {
    if (!window.confirm(`Remove ${league.name}? Its past bulletins will be deleted too.`)) return;
    remove.mutate(league.id, {
      onSuccess: () => navigate("/dashboard", { replace: true, state: flashState("ok", `Removed ${league.name}.`) }),
    });
  };

  return (
    <Card>
      <h2>Remove league</h2>
      <p className="text-sm text-muted">This deletes the league and its past bulletins from your account.</p>
      {remove.isError && <Notice kind="err">{errorMessage(remove.error)}</Notice>}
      <button className={button({ variant: "danger" })} type="button" onClick={onRemove} disabled={remove.isPending}>
        {remove.isPending ? "Removing…" : "Remove league"}
      </button>
    </Card>
  );
}
