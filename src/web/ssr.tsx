/**
 * Server-rendered pages: the landing page (GET /) and the public bulletin page (GET /r/:slug).
 * These stay server-rendered so WhatsApp/Telegram link previews (OG tags) and search engines
 * see real HTML. They reuse the React components in src/shared/components.
 */
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { renderReport } from "../core/index.ts";
import type { ReportResponse } from "../shared/api.ts";
import { Landing } from "../shared/components/Landing.tsx";
import { GuestNav, MemberNav, PageShell } from "../shared/components/PageShell.tsx";
import { ReportView } from "../shared/components/ReportView.tsx";
import { button, Card } from "../shared/components/ui.tsx";
import { SAMPLE_REPORT } from "./sample-report.ts";
import { ICON_LINKS } from "./icons.ts";

/**
 * The compiled Tailwind CSS, inlined into every page (no extra request, and link previews get
 * styled HTML). `npm run build:css` writes it; `npm run dev` keeps it up to date.
 */
const CSS_FILE = new URL("../../dist-css/site.css", import.meta.url);
const PRODUCTION = process.env.NODE_ENV === "production";
let cachedStyles: string | undefined;
let warnedMissingCss = false;

function styles(): string {
  if (cachedStyles !== undefined) return cachedStyles;
  try {
    const css = readFileSync(CSS_FILE, "utf8");
    // In production the file never changes, so read it once; in dev re-read it for live edits.
    if (PRODUCTION) cachedStyles = css;
    return css;
  } catch (e) {
    if (PRODUCTION) throw new Error(`Missing ${CSS_FILE.pathname}: run npm run build first`, { cause: e });
    if (!warnedMissingCss) {
      warnedMissingCss = true;
      console.warn("[web] dist-css/site.css not found, so pages are unstyled. Run npm run build:css (or npm run dev).");
    }
    return "";
  }
}
const SAMPLE_HTML = renderReport(SAMPLE_REPORT, "html");
const SITE_DESCRIPTION =
  "Pundit: the weekly bulletin for your Fantasy Premier League mini-league. Winners, wooden spoon, captain flops and manager of the month, ready to share.";
const OG_DESCRIPTION_LINES = 4;
const OG_DESCRIPTION_MAX = 200;

/** Copies the textContent of the [data-copy-target] element on click (see ReportView). */
const COPY_SCRIPT = `document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-copy-target]");if(!b)return;var el=document.getElementById(b.getAttribute("data-copy-target"));if(!el)return;var t=el.textContent||"",l=b.textContent,done=function(){b.textContent="Copied \\u2713";setTimeout(function(){b.textContent=l},2000)};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(done,fallback)}else{fallback()}function fallback(){var a=document.createElement("textarea");a.value=t;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();try{document.execCommand("copy");done()}catch(_){}document.body.removeChild(a)}});`;

interface Meta {
  title: string;
  description: string;
  url?: string;
  noindex?: boolean;
}

function Document({ meta, script, children }: { meta: Meta; script?: string; children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{meta.title}</title>
        <meta name="theme-color" content="#0f766e" />
        {ICON_LINKS.map((link) => (
          <link key={link.href} {...link} />
        ))}
        <meta name="description" content={meta.description} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Pundit" />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        {meta.url && <meta property="og:url" content={meta.url} />}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={meta.title} />
        <meta name="twitter:description" content={meta.description} />
        {meta.noindex && <meta name="robots" content="noindex" />}
        <style dangerouslySetInnerHTML={{ __html: styles() }} />
      </head>
      <body>
        {children}
        {script && <script dangerouslySetInnerHTML={{ __html: script }} />}
      </body>
    </html>
  );
}

const html = (node: ReactNode) => `<!doctype html>${renderToString(node)}`;

const navFor = (loggedIn: boolean) => (loggedIn ? <MemberNav /> : <GuestNav />);

export function renderLandingPage(opts: { loggedIn: boolean; appUrl: string }): string {
  return html(
    <Document
      meta={{
        title: "Pundit: the weekly bulletin for your mini-league",
        description: SITE_DESCRIPTION,
        url: opts.appUrl,
      }}
    >
      <Landing loggedIn={opts.loggedIn} sampleHtml={SAMPLE_HTML} />
    </Document>,
  );
}

/** First few non-empty lines of the bulletin (after the title) for link previews. */
function ogDescription(plain: string): string {
  const lines = plain
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(1, 1 + OG_DESCRIPTION_LINES)
    .join(" · ");
  return lines.length > OG_DESCRIPTION_MAX ? `${lines.slice(0, OG_DESCRIPTION_MAX - 1)}…` : lines;
}

export function renderReportPage(data: ReportResponse, opts: { loggedIn: boolean }): string {
  const { report } = data;
  return html(
    <Document
      meta={{
        title: `${report.title} — ${report.leagueName}`,
        description: ogDescription(data.text.plain),
        url: data.url,
        noindex: true,
      }}
      script={COPY_SCRIPT}
    >
      <PageShell brandHref={opts.loggedIn ? "/dashboard" : "/"} nav={navFor(opts.loggedIn)}>
        <ReportView data={data} />
      </PageShell>
    </Document>,
  );
}

export function renderNotFoundPage(opts: { loggedIn: boolean }): string {
  return html(
    <Document meta={{ title: "Not found · Pundit", description: SITE_DESCRIPTION, noindex: true }}>
      <PageShell brandHref={opts.loggedIn ? "/dashboard" : "/"} nav={navFor(opts.loggedIn)}>
        <Card className="mx-auto mt-10 max-w-[480px] text-center">
          <h1 className="text-[1.6rem]">Not found</h1>
          <p className="text-muted">That bulletin doesn't exist, or the link is wrong.</p>
          <a className={button({ variant: "primary" })} href="/">
            Go to Pundit
          </a>
        </Card>
      </PageShell>
    </Document>,
  );
}
