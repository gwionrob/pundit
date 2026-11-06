import { Link, useParams } from "react-router";
import type { ReportResponse } from "../../../src/shared/api.ts";
import { ReportView } from "../../../src/shared/components/ReportView.tsx";
import { button, Card, List, Pill } from "../../../src/shared/components/ui.tsx";
import { errorMessage, useDeliverReport, useReport } from "../api.ts";
import { Notice } from "../components/Notice.tsx";
import { useCopyToClipboard } from "../useCopyToClipboard.ts";

export function ReportPage() {
  const slug = useParams().slug ?? "";
  const report = useReport(slug);
  const { copy, copied } = useCopyToClipboard();

  if (report.isPending) return <p className="text-muted">Loading bulletin…</p>;
  if (report.isError) return <Notice kind="err">{errorMessage(report.error)}</Notice>;

  const data = report.data;
  return (
    <>
      <title>{`${data.report.title} — ${data.report.leagueName}`}</title>
      {data.owner && (
        <p className="text-sm">
          <Link to={`/leagues/${data.owner.leagueId}`}>← {data.report.leagueName}</Link>
        </p>
      )}
      <ReportView
        data={data}
        copied={copied}
        onCopy={() => void copy(data.text.whatsapp)}
        actions={data.owner ? <DeliveryPanel data={data} /> : null}
      />
      <p className="text-center text-sm break-words text-muted">
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
    <Card className="mt-4">
      <h3>Auto-post channels</h3>
      {deliver.isError && <Notice kind="err">{errorMessage(deliver.error)}</Notice>}
      {deliver.isSuccess && <Notice kind="ok">Sent to your linked channels.</Notice>}
      {deliveries.length ? (
        <List className="text-sm">
          {deliveries.map((d) => (
            <li key={d.channelId} className="flex flex-wrap items-center justify-between gap-2.5">
              <span>
                {d.label} <Pill>{d.kind}</Pill>
              </span>
              <Pill tone={d.status === "sent" ? "on" : "bad"} title={d.error ?? ""}>
                {d.status}
              </Pill>
            </li>
          ))}
        </List>
      ) : (
        <p className="text-sm text-muted">
          Not posted to your channels yet. <Link to="/channels">Link Telegram, Discord or email</Link> to post
          automatically.
        </p>
      )}
      <button
        className={button({ size: "sm", className: "mt-2.5" })}
        type="button"
        onClick={() => deliver.mutate()}
        disabled={deliver.isPending}
      >
        {deliver.isPending
          ? "Sending…"
          : deliveries.length
            ? "Post again to linked channels"
            : "Send to linked channels"}
      </button>
    </Card>
  );
}
