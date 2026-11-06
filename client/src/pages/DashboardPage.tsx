import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { LeagueSummary, ReportKind } from "../../../src/shared/api.ts";
import { errorMessage, useAddLeague, useChannels, useGenerateReport, useLeagues, useMe } from "../api.ts";
import { Notice, type Flash } from "../components/Notice.tsx";
import { formatDate } from "../format.ts";

export function DashboardPage() {
  const me = useMe();
  const leagues = useLeagues();
  const channels = useChannels();

  if (leagues.isPending) return <p className="muted">Loading your leagues…</p>;
  if (leagues.isError) return <Notice kind="err">{errorMessage(leagues.error)}</Notice>;

  const { limits } = leagues.data;
  const plan = me.data?.user?.plan ?? "free";
  const hasLeagues = leagues.data.leagues.length > 0;
  const hasChannels = (channels.data?.channels.length ?? 0) > 0;

  return (
    <>
      <title>Your leagues · Pundit</title>
      <div className="spread" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Your leagues</h1>
        <span className="pill">
          {limits.used} of {limits.maxLeagues} leagues · {plan === "free" ? "Free beta" : plan}
        </span>
      </div>

      {limits.used < limits.maxLeagues ? (
        <AddLeagueForm />
      ) : (
        <div className="card muted">You've reached your plan's limit of {limits.maxLeagues} leagues.</div>
      )}

      {hasLeagues && channels.isSuccess && !hasChannels && (
        <div className="card small">
          💡 You can always share bulletins to WhatsApp with one tap. To post automatically,{" "}
          <Link to="/channels">link a Telegram group, Discord channel or email</Link>.
        </div>
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
    <div className="card">
      {added && (
        <Notice kind="ok">
          Added {added}. Your first bulletin arrives after the next gameweek, or generate one now.
        </Notice>
      )}
      {addLeague.isError && <Notice kind="err">{errorMessage(addLeague.error)}</Notice>}
      <form className="stack" onSubmit={onSubmit}>
        <div>
          <label htmlFor="league">Add a league</label>
          <input
            id="league"
            type="text"
            inputMode="url"
            required
            placeholder="League ID or link, e.g. https://fantasy.premierleague.com/leagues/123456/standings/c"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <p className="small muted" style={{ marginTop: 6 }}>
            On the FPL website, open your league and copy the address from your browser. The number in it is the league
            ID.
          </p>
        </div>
        <div>
          <button className="btn primary" type="submit" disabled={addLeague.isPending}>
            {addLeague.isPending ? "Checking league…" : "Add league"}
          </button>
        </div>
      </form>
    </div>
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
    <div className="card">
      <div className="spread">
        <div>
          <h2 style={{ margin: 0 }}>{league.name}</h2>
          <p className="small muted" style={{ margin: "2px 0 0" }}>
            League {league.fplLeagueId} ·{" "}
            <span className={`pill ${league.gameweekEnabled ? "on" : ""}`}>
              {league.gameweekEnabled ? "Auto weekly" : "Weekly off"}
            </span>{" "}
            <span className={`pill ${league.monthlyEnabled ? "on" : ""}`}>
              {league.monthlyEnabled ? "Auto monthly" : "Monthly off"}
            </span>
          </p>
        </div>
        <Link className="btn sm" to={`/leagues/${league.id}`}>
          Settings
        </Link>
      </div>

      {error && (
        <div style={{ marginTop: 14 }}>
          <Notice kind="err">{error.text}</Notice>
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        {GENERATE_BUTTONS.map(({ kind, label }) => {
          const busy = generate.isPending && generate.variables?.kind === kind;
          return (
            <button
              key={kind}
              className="btn sm"
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
        <ul className="plain" style={{ marginTop: 12 }}>
          {league.latestReports.map((r) => (
            <li key={r.slug} className="spread">
              <Link to={`/reports/${r.slug}`}>{r.title}</Link>
              <span className="small muted">{formatDate(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted" style={{ margin: "12px 0 0" }}>
          No bulletins yet. Generate one above, or wait for the next gameweek to finish.
        </p>
      )}
    </div>
  );
}
