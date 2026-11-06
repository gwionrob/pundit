/**
 * /admin: read-only operator dashboard. Shown only to ADMIN_EMAILS accounts (see RequireAdmin);
 * the data comes from GET /api/admin, which enforces the same rule on the server.
 */
import type { ComponentProps, ReactNode } from "react";
import type { AdminResponse } from "../../../src/shared/api.ts";
import { errorMessage, useAdminDashboard } from "../api.ts";
import { button, Card, cx, Pill } from "../../../src/shared/components/ui.tsx";
import { Notice } from "../components/Notice.tsx";
import { formatDate, KIND_LABEL } from "../format.ts";

/** The scheduler runs every 15 minutes; flag it if it's been quiet for much longer. */
const SCHEDULER_STALE_MS = 45 * 60_000;

export function AdminPage() {
  const dash = useAdminDashboard();

  if (dash.isPending) return <p className="text-muted">Loading dashboard…</p>;
  if (dash.isError) return <Notice kind="err">{errorMessage(dash.error)}</Notice>;
  const d = dash.data;
  const failed = d.deliveries.filter((x) => x.status === "failed");

  return (
    <>
      <title>Admin · Pundit</title>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <h1 className="m-0">Admin</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm text-muted">Updated {formatDate(d.generatedAt)}</span>
          <button
            className={button({ size: "sm" })}
            type="button"
            onClick={() => void dash.refetch()}
            disabled={dash.isFetching}
          >
            {dash.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
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
              <Td>{u.email}</Td>
              <Td>{u.plan}</Td>
              <Td num>{u.leagues}</Td>
              <Td num>{u.channels}</Td>
              <Td nowrap>{formatDate(u.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent leagues">
        <Table head={["League", "FPL ID", "Owner", "Auto", "Added"]} empty="No leagues yet." rows={d.leagues.length}>
          {d.leagues.map((l) => (
            <tr key={l.id}>
              <Td>{l.name}</Td>
              <Td num>
                <a
                  href={`https://fantasy.premierleague.com/leagues/${l.fplLeagueId}/standings/c`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {l.fplLeagueId}
                </a>
              </Td>
              <Td>{l.owner}</Td>
              <Td nowrap>
                {[l.gameweekEnabled && "weekly", l.monthlyEnabled && "monthly"].filter(Boolean).join(", ") || "off"}
              </Td>
              <Td nowrap>{formatDate(l.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent bulletins">
        <Table head={["Bulletin", "League", "Type", "Written"]} empty="No bulletins yet." rows={d.reports.length}>
          {d.reports.map((r) => (
            <tr key={r.slug}>
              <Td>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title || r.slug}
                </a>
              </Td>
              <Td>{r.league}</Td>
              <Td>{KIND_LABEL[r.kind]}</Td>
              <Td nowrap>{formatDate(r.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent deliveries">
        <Deliveries rows={d.deliveries} />
      </Section>

      <p className="text-sm text-muted">Read-only. Shows the latest 25 rows of each list. Times are UK time.</p>
    </>
  );
}

function Stat({ n, label, sub, bad }: { n: number; label: string; sub?: string; bad?: boolean }) {
  return (
    <Card className="mb-0 px-4 py-3.5">
      <div className="text-[1.6rem] leading-tight font-extrabold tracking-tight tabular-nums">{n}</div>
      <div className="text-[13px] text-muted">{label}</div>
      {sub && <div className={cx("text-sm", bad ? "text-danger" : "text-muted")}>{sub}</div>}
    </Card>
  );
}

/** `now` is the server's time when it built the response, so a wrong browser clock can't mislead. */
function Scheduler({ s, now }: { s: AdminResponse["scheduler"]; now: string }) {
  const stale = !s.lastTickAt || Date.parse(now) - Date.parse(s.lastTickAt) > SCHEDULER_STALE_MS;
  const bad = stale || s.lastTickStatus === "error";
  return (
    <Card className="flex flex-wrap items-center justify-between gap-2.5 text-sm">
      <div>
        <b>Scheduler</b>{" "}
        <Pill tone={bad ? "bad" : "on"}>{bad ? (stale ? "not seen recently" : "last run failed") : "running"}</Pill>
      </div>
      <div className="text-muted">
        {s.lastTickAt
          ? `Last checked FPL ${formatDate(s.lastTickAt)} (${s.lastTickStatus ?? "unknown"})`
          : "No runs recorded yet"}
        {" · "}
        {s.lastGameweekProcessed != null ? `GW${s.lastGameweekProcessed} processed` : "no gameweek processed yet"}
      </div>
    </Card>
  );
}

function Deliveries({ rows }: { rows: AdminResponse["deliveries"] }) {
  return (
    <Table head={["Bulletin", "Channel", "Status", "When"]} empty="No deliveries yet." rows={rows.length}>
      {rows.map((x) => (
        <tr key={`${x.slug}-${x.kind}-${x.label}-${x.at}`}>
          <Td>
            <a href={`/r/${x.slug}`} target="_blank" rel="noreferrer">
              {x.league}
            </a>
          </Td>
          <Td>
            {x.kind}: {x.label}
          </Td>
          <Td>
            <Pill tone={x.status === "sent" ? "on" : "bad"}>{x.status}</Pill>
            {x.error && <div className="mt-1.5 text-danger">{x.error}</div>}
          </Td>
          <Td nowrap>{formatDate(x.at)}</Td>
        </tr>
      ))}
    </Table>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2>{title}</h2>
      {children}
    </Card>
  );
}

function Table({ head, rows, empty, children }: { head: string[]; rows: number; empty: string; children: ReactNode }) {
  if (!rows) return <p className="m-0 text-sm text-muted">{empty}</p>;
  return (
    // Scrolls sideways on narrow screens instead of squashing the columns.
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="pr-2.5 pb-2 text-left text-xs font-semibold whitespace-nowrap text-muted"
              >
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

function Td({ num, nowrap, className, ...props }: ComponentProps<"td"> & { num?: boolean; nowrap?: boolean }) {
  return (
    <td
      className={cx(
        "border-t border-line py-2 pr-2.5 align-top",
        num && "tabular-nums",
        nowrap && "whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}
