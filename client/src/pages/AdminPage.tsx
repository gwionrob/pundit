/**
 * /admin: read-only operator dashboard. Shown only to ADMIN_EMAILS accounts (see RequireAdmin);
 * the data comes from GET /api/admin, which enforces the same rule on the server.
 */
import type { ReactNode } from "react";
import type { AdminResponse } from "../../../src/shared/api.ts";
import { errorMessage, useAdminDashboard } from "../api.ts";
import { Notice } from "../components/Notice.tsx";
import { formatDate, KIND_LABEL } from "../format.ts";

/** The scheduler runs every 15 minutes; flag it if it's been quiet for much longer. */
const SCHEDULER_STALE_MS = 45 * 60_000;

export function AdminPage() {
  const dash = useAdminDashboard();

  if (dash.isPending) return <p className="muted">Loading dashboard…</p>;
  if (dash.isError) return <Notice kind="err">{errorMessage(dash.error)}</Notice>;
  const d = dash.data;
  const failed = d.deliveries.filter((x) => x.status === "failed");

  return (
    <>
      <title>Admin · Pundit</title>
      <div className="spread" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <div className="row">
          <span className="small muted">Updated {formatDate(d.generatedAt)}</span>
          <button className="btn sm" type="button" onClick={() => void dash.refetch()} disabled={dash.isFetching}>
            {dash.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat n={d.counts.users} label="users" sub={`+${d.counts.usersSince} this week`} />
        <Stat n={d.counts.leagues} label="leagues added" sub={`${d.counts.fplLeagues} different FPL leagues`} />
        <Stat n={d.counts.reports} label="bulletins" sub={`+${d.counts.reportsSince} this week`} />
        <Stat n={d.counts.channels} label="linked channels" />
        <Stat
          n={d.counts.deliveriesSent}
          label="deliveries this week"
          sub={d.counts.deliveriesFailed ? `${d.counts.deliveriesFailed} failed` : "none failed"}
          bad={d.counts.deliveriesFailed > 0}
        />
      </div>

      <Scheduler s={d.scheduler} now={d.generatedAt} />

      {failed.length > 0 && (
        <Section title="Failed deliveries">
          <Deliveries rows={failed} />
        </Section>
      )}

      <Section title="Recent users">
        <Table head={["Email", "Plan", "Leagues", "Channels", "Signed up"]} empty="No users yet." rows={d.users.length}>
          {d.users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.plan}</td>
              <td className="num">{u.leagues}</td>
              <td className="num">{u.channels}</td>
              <td className="nowrap">{formatDate(u.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent leagues">
        <Table head={["League", "FPL ID", "Owner", "Auto", "Added"]} empty="No leagues yet." rows={d.leagues.length}>
          {d.leagues.map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td className="num">
                <a
                  href={`https://fantasy.premierleague.com/leagues/${l.fplLeagueId}/standings/c`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {l.fplLeagueId}
                </a>
              </td>
              <td>{l.owner}</td>
              <td className="nowrap">
                {[l.gameweekEnabled && "weekly", l.monthlyEnabled && "monthly"].filter(Boolean).join(", ") || "off"}
              </td>
              <td className="nowrap">{formatDate(l.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent bulletins">
        <Table head={["Bulletin", "League", "Type", "Written"]} empty="No bulletins yet." rows={d.reports.length}>
          {d.reports.map((r) => (
            <tr key={r.slug}>
              <td>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title || r.slug}
                </a>
              </td>
              <td>{r.league}</td>
              <td>{KIND_LABEL[r.kind]}</td>
              <td className="nowrap">{formatDate(r.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent deliveries">
        <Deliveries rows={d.deliveries} />
      </Section>

      <p className="small muted">Read-only. Shows the latest 25 rows of each list. Times are UK time.</p>
    </>
  );
}

function Stat({ n, label, sub, bad }: { n: number; label: string; sub?: string; bad?: boolean }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="l">{label}</div>
      {sub && (
        <div className={`small ${bad ? "err-text" : "muted"}`} style={{ margin: 0 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** `now` is the server's time when it built the response, so a wrong browser clock can't mislead. */
function Scheduler({ s, now }: { s: AdminResponse["scheduler"]; now: string }) {
  const stale = !s.lastTickAt || Date.parse(now) - Date.parse(s.lastTickAt) > SCHEDULER_STALE_MS;
  const bad = stale || s.lastTickStatus === "error";
  return (
    <div className="card small spread">
      <div>
        <b>Scheduler</b>{" "}
        <span className={`pill ${bad ? "bad" : "on"}`}>
          {bad ? (stale ? "not seen recently" : "last run failed") : "running"}
        </span>
      </div>
      <div className="muted">
        {s.lastTickAt
          ? `Last checked FPL ${formatDate(s.lastTickAt)} (${s.lastTickStatus ?? "unknown"})`
          : "No runs recorded yet"}
        {" · "}
        {s.lastGameweekProcessed != null ? `GW${s.lastGameweekProcessed} processed` : "no gameweek processed yet"}
      </div>
    </div>
  );
}

function Deliveries({ rows }: { rows: AdminResponse["deliveries"] }) {
  return (
    <Table head={["Bulletin", "Channel", "Status", "When"]} empty="No deliveries yet." rows={rows.length}>
      {rows.map((x) => (
        <tr key={`${x.slug}-${x.kind}-${x.label}-${x.at}`}>
          <td>
            <a href={`/r/${x.slug}`} target="_blank" rel="noreferrer">
              {x.league}
            </a>
          </td>
          <td>
            {x.kind}: {x.label}
          </td>
          <td>
            <span className={`pill ${x.status === "sent" ? "on" : "bad"}`}>{x.status}</span>
            {x.error && <div className="err-text">{x.error}</div>}
          </td>
          <td className="nowrap">{formatDate(x.at)}</td>
        </tr>
      ))}
    </Table>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Table({ head, rows, empty, children }: { head: string[]; rows: number; empty: string; children: ReactNode }) {
  if (!rows)
    return (
      <p className="small muted" style={{ margin: 0 }}>
        {empty}
      </p>
    );
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
