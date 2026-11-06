/**
 * A bulletin with its share actions. Used by the React app (/reports/:slug) and the
 * server-rendered public page (/r/:slug).
 *
 * SSR-safe: plain props in, markup out. No router, no browser APIs during render.
 *
 * Copy button convention (two modes):
 * - React app: pass `onCopy` (and `copied` to show "Copied ✓"). The button calls it on click.
 * - Server-rendered: omit `onCopy`. The button renders as
 *     <button type="button" data-copy-target="pundit-report-text">Copy text</button>
 *   next to a visually-hidden <pre id="pundit-report-text"> holding the WhatsApp text.
 *   The server adds a tiny inline script that, on click of any [data-copy-target], copies
 *   the textContent of the element with that id to the clipboard.
 */
import type { ReactNode } from "react";
import type { ReportResponse } from "../api.ts";

export const COPY_TEXT_ID = "pundit-report-text";

export function ReportView({
  data,
  onCopy,
  copied = false,
  actions,
}: {
  data: ReportResponse;
  onCopy?: () => void;
  copied?: boolean;
  /** extra content below the share buttons (e.g. the owner's delivery panel) */
  actions?: ReactNode;
}) {
  const serverRendered = onCopy === undefined;

  return (
    <div className="phone" style={{ margin: "0 auto" }}>
      {/* data.html comes from renderReport(report, "html"), which escapes all text */}
      <div className="bulletin" dangerouslySetInnerHTML={{ __html: data.html }} />

      <div className="actions">
        <div className="stack">
          <a
            className="btn wa"
            href={data.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ width: "100%" }}
          >
            Send to WhatsApp
          </a>
          {serverRendered ? (
            <>
              <button className="btn" type="button" data-copy-target={COPY_TEXT_ID} style={{ width: "100%" }}>
                Copy text
              </button>
              <pre id={COPY_TEXT_ID} className="visually-hidden">
                {data.text.whatsapp}
              </pre>
            </>
          ) : (
            <button className="btn" type="button" onClick={onCopy} style={{ width: "100%" }}>
              {copied ? "Copied ✓" : "Copy text"}
            </button>
          )}
        </div>
      </div>

      {actions}

      <p className="small muted center" style={{ marginTop: 20 }}>
        Made with <a href="/">Pundit</a>: free weekly bulletins for your mini-league.
      </p>
    </div>
  );
}
