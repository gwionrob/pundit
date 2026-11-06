import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { LeagueSummary, ReportKind } from "../../../src/shared/api.ts";
import { errorMessage, useAddLeague, useChannels, useGenerateReport, useLeagues, useMe } from "../api.ts";
import { button, Card, Input, Label, List, Pill } from "../../../src/shared/components/ui.tsx";
import { Notice, type Flash } from "../components/Notice.tsx";
import { formatDate } from "../format.ts";

export function DashboardPage() {
  const me = useMe();
  const leagues = useLeagues();
  const channels = useChannels();

  if (leagues.isPending) return <p className="text-muted">Loading your leagues…</p>;
  if (leagues.isError) return <Notice kind="err">{errorMessage(leagues.error)}</Notice>;

  const { limits } = leagues.data;
  const plan = me.data?.user?.plan ?? "free";
  const hasLeagues = leagues.data.leagues.length > 0;
  const hasChannels = (channels.data?.channels.length ?? 0) > 0;

  return (
    <>
      <title>Your leagues · Pundit</title>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <h1 className="m-0">Your leagues</h1>
        <Pill>
          {limits.used} of {limits.maxLeagues} leagues · {plan === "free" ? "Free beta" : plan}
        </Pill>
      </div>

      {limits.used < limits.maxLeagues ? (
        <AddLeagueForm />
      ) : (
        <Card className="text-muted">You've reached your plan's limit of {limits.maxLeagues} leagues.</Card>
      )}

      {hasLeagues && channels.isSuccess && !hasChannels && (
        <Card className="text-sm">
          💡 You can always share bulletins to WhatsApp with one tap. To post automatically,{" "}
          <Link to="/channels">link a Telegram group, Discord channel or email</Link>.
        </Card>
      )}

      {leagues.data.leagues.map((league) => (
        <LeagueCard key={league.id} league={league} />
      ))}
    </>
  );
}

function AddLeagueForm() {
  const addLeague = useAddLeague();
  const [input, setInput] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAdded(null);
    addLeague.mutate(
      { league: input.trim() },
      {
        onSuccess: (league) => {
          setInput("");
          setAdded(league.name);
        },
      },
    );
  };

  return (
    <Card>
      {added && (
        <Notice kind="ok">
          Added {added}. Your first bulletin arrives after the next gameweek, or generate one now.
        </Notice>
      )}
      {addLeague.isError && <Notice kind="err">{errorMessage(addLeague.error)}</Notice>}
      <form className="space-y-3" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="league">Add a league</Label>
          <Input
            id="league"
            type="text"
            inputMode="url"
            required
            placeholder="League ID or link, e.g. https://fantasy.premierleague.com/leagues/123456/standings/c"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <p className="mt-1.5 text-sm text-muted">
            On the FPL website, open your league and copy the address from your browser. The number in it is the league
            ID.
          </p>
        </div>
        <div>
          <button className={button({ variant: "primary" })} type="submit" disabled={addLeague.isPending}>
            {addLeague.isPending ? "Checking league…" : "Add league"}
          </button>
        </div>
      </form>
    </Card>
  );
}

const GENERATE_BUTTONS: Array<{ kind: ReportKind; label: string }> = [
  { kind: "gameweek", label: "Latest gameweek" },
  { kind: "monthly", label: "Manager of the month" },
  { kind: "standings", label: "Standings" },
];

function LeagueCard({ league }: { league: LeagueSummary }) {
  const generate = useGenerateReport();
  const navigate = useNavigate();
  const [error, setError] = useState<Flash | null>(null);

  const onGenerate = (kind: ReportKind) => {
    setError(null);
    generate.mutate(
      { leagueId: league.id, kind },
      {
        onSuccess: (report) => navigate(`/reports/${report.slug}`),
        onError: (err) => setError({ kind: "err", text: errorMessage(err) }),
      },
    );
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="m-0">{league.name}</h2>
          <p className="mt-0.5 mb-0 text-sm text-muted">
            League {league.fplLeagueId} ·{" "}
            <Pill tone={league.gameweekEnabled ? "on" : "default"}>
              {league.gameweekEnabled ? "Auto weekly" : "Weekly off"}
            </Pill>{" "}
            <Pill tone={league.monthlyEnabled ? "on" : "default"}>
              {league.monthlyEnabled ? "Auto monthly" : "Monthly off"}
            </Pill>
          </p>
        </div>
        <Link className={button({ size: "sm" })} to={`/leagues/${league.id}`}>
          Settings
        </Link>
      </div>

      {error && (
        <div className="mt-3.5">
          <Notice kind="err">{error.text}</Notice>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        {GENERATE_BUTTONS.map(({ kind, label }) => {
          const busy = generate.isPending && generate.variables?.kind === kind;
          return (
            <button
              key={kind}
              className={button({ size: "sm" })}
              type="button"
              disabled={generate.isPending}
              aria-busy={busy}
              onClick={() => onGenerate(kind)}
            >
              {busy ? "Writing bulletin…" : label}
            </button>
          );
        })}
      </div>

      {league.latestReports.length ? (
        <List className="mt-3">
          {league.latestReports.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-center justify-between gap-2.5">
              <Link to={`/reports/${r.slug}`}>{r.title}</Link>
              <span className="text-sm text-muted">{formatDate(r.createdAt)}</span>
            </li>
          ))}
        </List>
      ) : (
        <p className="mt-3 mb-0 text-sm text-muted">
          No bulletins yet. Generate one above, or wait for the next gameweek to finish.
        </p>
      )}
    </Card>
  );
}
