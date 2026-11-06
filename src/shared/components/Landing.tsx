/**
 * The marketing landing page (GET /). Server-rendered by Hono; not part of the SPA.
 *
 * SSR-safe: plain props in, markup out. Uses plain <a href> links because it renders
 * outside the React router. Wrap it in your own <html>/<head> with the stylesheet inlined.
 */
import type { ReactNode } from "react";
import { GuestNav, MemberNav, PageShell } from "./PageShell.tsx";
import { button, Card, Pill } from "./ui.tsx";

const STEPS: Array<[title: string, body: string]> = [
  ["Add your league.", "Paste the league ID or the link from the FPL website."],
  [
    "We write the bulletin.",
    "Once a gameweek's points are final, your bulletin is ready, plus a manager of the month round-up at the end of each month.",
  ],
  [
    "Share it.",
    "One tap sends it to your WhatsApp group, or link a Telegram group, Discord channel or email and it's delivered automatically.",
  ],
];

const FEATURES: ReactNode[] = [
  <>
    🏆 <b>Gameweek winner</b> and 🥄 <b>wooden spoon</b>
  </>,
  <>
    📈 <b>Biggest climbers and fallers</b> in the table
  </>,
  <>
    ©️ <b>Best and worst captains</b>
  </>,
  <>
    🪑 <b>Bench of shame</b>: points left on the bench
  </>,
  <>
    🃏 <b>Chips played</b> and 💸 <b>transfer hits</b>
  </>,
  <>
    🗓️ <b>Manager of the month</b>
  </>,
];

export function Landing({ loggedIn, sampleHtml }: { loggedIn: boolean; sampleHtml: string }) {
  return (
    <PageShell brandHref={loggedIn ? "/dashboard" : "/"} nav={loggedIn ? <MemberNav /> : <GuestNav />}>
      <section className="pt-6 pb-2">
        <Pill tone="on">Free during beta</Pill>
        <h1 className="mt-3">Pundit: the weekly bulletin for your mini-league.</h1>
        <p className="max-w-[40rem] text-lg text-muted">
          After every gameweek you get a ready-made round-up for your Fantasy Premier League mini-league: the winner,
          the wooden spoon, captain flops, the bench of shame and manager of the month. One tap and it's in the group
          chat.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <a className={button({ variant: "primary", size: "lg" })} href={loggedIn ? "/dashboard" : "/signup"}>
            {loggedIn ? "Go to your leagues" : "Get your first bulletin"}
          </a>
          <a className={button({ size: "lg" })} href="#sample">
            See an example
          </a>
        </div>
      </section>

      <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-4">
        <Card>
          <h2>How it works</h2>
          <ol>
            {STEPS.map(([title, body], i) => (
              <li key={title} className="mb-4 flex gap-3.5">
                <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent">
                  {i + 1}
                </span>
                <span>
                  <b>{title}</b> {body}
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <div id="sample" className="max-w-[420px]">
          {/* sampleHtml is renderReport(SAMPLE_REPORT, "html"): already escaped by the server */}
          <div className="bulletin" dangerouslySetInnerHTML={{ __html: sampleHtml }} />
          <p className="mt-2 text-sm text-muted">Example bulletin. Yours uses your league's real names and scores.</p>
        </div>
      </div>

      <Card className="mt-5">
        <h2>What's in a bulletin</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 text-sm">
          {FEATURES.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </div>
      </Card>

      <Card className="text-sm">
        <h2>Prefer the terminal?</h2>
        <p className="text-muted">Pundit also comes as a command-line tool. Try it without installing anything:</p>
        <p>
          <code>npx pundit-cli gameweek &lt;league&gt;</code>
        </p>
        <p className="text-muted">Or install it:</p>
        <p>
          <code>brew install gwionrob/tap/pundit</code>
        </p>
        <p className="text-muted">
          The CLI is open source (MIT) on <a href="https://github.com/gwionrob/pundit#cli">GitHub</a>.
        </p>
      </Card>
    </PageShell>
  );
}
