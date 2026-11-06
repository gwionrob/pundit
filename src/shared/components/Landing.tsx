/**
 * The marketing landing page (GET /). Server-rendered by Hono; not part of the SPA.
 *
 * SSR-safe: plain props in, markup out. Uses plain <a href> links because it renders
 * outside the React router. Wrap it in your own <html>/<head> with the stylesheet inlined.
 */
import { GuestNav, PageShell } from "./PageShell.tsx";

export function Landing({ loggedIn, sampleHtml }: { loggedIn: boolean; sampleHtml: string }) {
  const nav = loggedIn ? (
    <>
      <a href="/dashboard">Leagues</a>
      <a href="/channels">Channels</a>
    </>
  ) : (
    <GuestNav />
  );

  return (
    <PageShell brandHref={loggedIn ? "/dashboard" : "/"} nav={nav}>
      <section className="hero">
        <span className="pill on">Free during beta</span>
        <h1 style={{ marginTop: 12 }}>Pundit: the weekly bulletin for your mini-league.</h1>
        <p className="lead">
          After every gameweek you get a ready-made round-up for your Fantasy Premier League mini-league: the winner,
          the wooden spoon, captain flops, the bench of shame and manager of the month. One tap and it's in the group
          chat.
        </p>
        <div className="row" style={{ marginTop: 20 }}>
          <a className="btn primary big" href={loggedIn ? "/dashboard" : "/signup"}>
            {loggedIn ? "Go to your leagues" : "Get your first bulletin"}
          </a>
          <a className="btn big" href="#sample">
            See an example
          </a>
        </div>
      </section>

      <div className="grid" style={{ marginTop: 36, alignItems: "start" }}>
        <div className="card">
          <h2>How it works</h2>
          <ol className="steps">
            <li>
              <b>Add your league.</b> Paste the league ID or the link from the FPL website.
            </li>
            <li>
              <b>We write the bulletin.</b> Once a gameweek's points are final, your bulletin is ready, plus a manager
              of the month round-up at the end of each month.
            </li>
            <li>
              <b>Share it.</b> One tap sends it to your WhatsApp group, or link a Telegram group, Discord channel or
              email and it's delivered automatically.
            </li>
          </ol>
        </div>
        <div id="sample" className="phone">
          {/* sampleHtml is renderReport(SAMPLE_REPORT, "html"): already escaped by the server */}
          <div className="bulletin" dangerouslySetInnerHTML={{ __html: sampleHtml }} />
          <p className="small muted" style={{ marginTop: 8 }}>
            Example bulletin. Yours uses your league's real names and scores.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>What's in a bulletin</h2>
        <div className="grid small">
          <p>
            🏆 <b>Gameweek winner</b> and 🥄 <b>wooden spoon</b>
          </p>
          <p>
            📈 <b>Biggest climbers and fallers</b> in the table
          </p>
          <p>
            ©️ <b>Best and worst captains</b>
          </p>
          <p>
            🪑 <b>Bench of shame</b>: points left on the bench
          </p>
          <p>
            🃏 <b>Chips played</b> and 💸 <b>transfer hits</b>
          </p>
          <p>
            🗓️ <b>Manager of the month</b>
          </p>
        </div>
      </div>

      <div className="card small">
        <h2>Prefer the terminal?</h2>
        <p className="muted">Pundit also comes as a command-line tool (coming soon):</p>
        <p>
          <code>npx -p pundit-cli pundit gameweek &lt;league&gt;</code>
        </p>
        <p>
          <code>brew install gwionrob/tap/pundit</code>
        </p>
        <p className="muted">
          Open source on <a href="https://github.com/gwionrob/pundit">GitHub</a>.
        </p>
      </div>
    </PageShell>
  );
}
