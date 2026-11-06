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
 *   next to a screen-reader-only (sr-only) <pre id="pundit-report-text"> holding the WhatsApp text.
 *   The server adds a tiny inline script that, on click of any [data-copy-target], copies
 *   the textContent of the element with that id to the clipboard.
 */
import type { ReactNode } from "react";
import type { ReportResponse } from "../api.ts";
import { button } from "./ui.tsx";

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
    <div className="mx-auto max-w-[420px]">
      {/* data.html comes from renderReport(report, "html"), which escapes all text */}
      <div className="bulletin" dangerouslySetInnerHTML={{ __html: data.html }} />

      {/* Share buttons stick to the bottom of the screen while scrolling a long bulletin. */}
      <div className="sticky bottom-0 mt-2 bg-linear-to-b from-transparent to-bg to-30% pt-4 pb-2">
        <div className="flex flex-col gap-3">
          <a
            className={button({ variant: "whatsapp", size: "lg", full: true })}
            href={data.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Send to WhatsApp
          </a>
          {serverRendered ? (
            <>
              <button className={button({ full: true })} type="button" data-copy-target={COPY_TEXT_ID}>
                Copy text
              </button>
              <pre id={COPY_TEXT_ID} className="sr-only">
                {data.text.whatsapp}
              </pre>
            </>
          ) : (
            <button className={button({ full: true })} type="button" onClick={onCopy}>
              {copied ? "Copied ✓" : "Copy text"}
            </button>
          )}
        </div>
      </div>

      {actions}

      <p className="mt-5 text-center text-sm text-muted">
        Made with <a href="/">Pundit</a>: free weekly bulletins for your mini-league.
      </p>
    </div>
  );
}
