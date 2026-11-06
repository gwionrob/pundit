import { Link, useParams } from "react-router";
import type { ReportResponse } from "../../../src/shared/api.ts";
import { ReportView } from "../../../src/shared/components/ReportView.tsx";
import { errorMessage, useDeliverReport, useReport } from "../api.ts";
import { Notice } from "../components/Notice.tsx";
import { useCopyToClipboard } from "../useCopyToClipboard.ts";

export function ReportPage() {
  const slug = useParams().slug ?? "";
  const report = useReport(slug);
  const { copy, copied } = useCopyToClipboard();

  if (report.isPending) return <p className="muted">Loading bulletin…</p>;
  if (report.isError) return <Notice kind="err">{errorMessage(report.error)}</Notice>;

  const data = report.data;
  return (
    <>
      <title>{`${data.report.title} — ${data.report.leagueName}`}</title>
      {data.owner && (
        <p className="small">
          <Link to={`/leagues/${data.owner.leagueId}`}>← {data.report.leagueName}</Link>
        </p>
      )}
      <ReportView
        data={data}
        copied={copied}
        onCopy={() => void copy(data.text.whatsapp)}
        actions={data.owner ? <DeliveryPanel data={data} /> : null}
      />
      <p className="small muted center">
        Public link to share: <a href={data.url}>{data.url}</a>
      </p>
    </>
  );
}

/** Owner-only: where this bulletin was auto-posted, and a button to (re)post it. */
function DeliveryPanel({ data }: { data: ReportResponse }) {
  const deliver = useDeliverReport(data.slug);
  const deliveries = data.owner?.deliveries ?? [];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Auto-post channels</h3>
      {deliver.isError && <Notice kind="err">{errorMessage(deliver.error)}</Notice>}
      {deliver.isSuccess && <Notice kind="ok">Sent to your linked channels.</Notice>}
      {deliveries.length ? (
        <ul className="plain small">
          {deliveries.map((d) => (
            <li key={d.channelId} className="spread">
              <span>
                {d.label} <span className="pill">{d.kind}</span>
              </span>
              <span className={`pill ${d.status === "sent" ? "on" : "bad"}`} title={d.error ?? ""}>
                {d.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">
          Not posted to your channels yet. <Link to="/channels">Link Telegram, Discord or email</Link> to post
          automatically.
        </p>
      )}
      <button
        className="btn sm"
        type="button"
        style={{ marginTop: 10 }}
        onClick={() => deliver.mutate()}
        disabled={deliver.isPending}
      >
        {deliver.isPending ? "Sending…" : deliveries.length ? "Post again to linked channels" : "Send to linked channels"}
      </button>
    </div>
  );
}
