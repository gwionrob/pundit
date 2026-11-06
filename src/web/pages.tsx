import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { renderReport } from "../core/index.ts";
import type { Channel, League, PlanLimits, StoredReport, User } from "../db/repo.ts";
import { Layout, type Flash } from "./layout.tsx";
import { SAMPLE_REPORT } from "./sample.ts";

const KIND_LABEL = { gameweek: "Gameweek", monthly: "Monthly", standings: "Standings" } as const;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// ---------- landing ----------

export const LandingPage: FC<{ user?: User | undefined }> = ({ user }) => (
  <Layout title="Pundit — the weekly bulletin for your Fantasy Premier League mini-league" user={user}>
    <section class="hero">
      <span class="pill on">Free during beta</span>
      <h1 style="margin-top:12px">Pundit: the weekly bulletin for your mini-league.</h1>
      <p class="lead">
        After every gameweek you get a ready-made round-up for your Fantasy Premier League mini-league: the winner, the
        wooden spoon, captain flops, the bench of shame and manager of the month. One tap and it's in the group chat.
      </p>
      <div class="row" style="margin-top:20px">
        <a class="btn primary big" href={user ? "/dashboard" : "/signup"}>
          {user ? "Go to your leagues" : "Get your first bulletin"}
        </a>
        <a class="btn big" href="#sample">
          See an example
        </a>
      </div>
    </section>

    <div class="grid" style="margin-top:36px;align-items:start">
      <div class="card">
        <h2>How it works</h2>
        <ol class="steps">
          <li>
            <b>Add your league.</b> Paste the league ID or the link from the FPL website.
          </li>
          <li>
            <b>We write the bulletin.</b> Once a gameweek's points are final, your bulletin is ready, plus a manager of
            the month round-up at the end of each month.
          </li>
          <li>
            <b>Share it.</b> One tap sends it to your WhatsApp group, or link a Telegram group or Discord channel and
            it posts automatically.
          </li>
        </ol>
      </div>
      <div id="sample" class="phone">
        <div class="bulletin">{raw(renderReport(SAMPLE_REPORT, "html"))}</div>
        <p class="small muted" style="margin-top:8px">
          Example bulletin. Yours uses your league's real names and scores.
        </p>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <h2>What's in a bulletin</h2>
      <div class="grid small">
        <p>🏆 <b>Gameweek winner</b> and 🥄 <b>wooden spoon</b></p>
        <p>📈 <b>Biggest climbers and fallers</b> in the table</p>
        <p>©️ <b>Best and worst captains</b></p>
        <p>🪑 <b>Bench of shame</b>: points left on the bench</p>
        <p>🃏 <b>Chips played</b> and 💸 <b>transfer hits</b></p>
        <p>🗓️ <b>Manager of the month</b></p>
      </div>
    </div>

    <div class="card small">
      <h2>Prefer the terminal?</h2>
      <p class="muted">
        Pundit also comes as a command-line tool (coming soon):
      </p>
      <p>
        <code>npx -p pundit-cli pundit gameweek &lt;league&gt;</code>
      </p>
      <p>
        <code>brew install gwionrob/tap/pundit</code>
      </p>
      <p class="muted">
        Open source on <a href="https://github.com/gwionrob/pundit">GitHub</a>.
      </p>
    </div>
  </Layout>
);

// ---------- auth ----------

export const AuthPage: FC<{ mode: "login" | "signup"; flash?: Flash | undefined; email?: string }> = ({
  mode,
  flash,
  email,
}) => (
  <Layout title={mode === "login" ? "Log in · Pundit" : "Sign up · Pundit"} flash={flash}>
    <div class="card" style="max-width:420px;margin:24px auto">
      <h1 style="font-size:1.6rem">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      {mode === "signup" ? (
        <p class="muted">Free during beta, with up to 3 leagues.</p>
      ) : null}
      <form method="post" action={`/${mode}`} class="stack">
        <div>
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="email" value={email ?? ""} />
        </div>
        <div>
          <label for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minlength={8}
            autocomplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "signup" ? <p class="small muted" style="margin-top:6px">At least 8 characters.</p> : null}
        </div>
        <button class="btn primary" type="submit" style="width:100%">
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      <p class="small muted" style="margin-top:16px;text-align:center">
        {mode === "login" ? (
          <>
            New here? <a href="/signup">Create an account</a>
          </>
        ) : (
          <>
            Already have an account? <a href="/login">Log in</a>
          </>
        )}
      </p>
    </div>
  </Layout>
);

// ---------- dashboard ----------

export interface DashboardLeague {
  league: League;
  reports: StoredReport[];
  channelCount: number;
}

export const DashboardPage: FC<{
  user: User;
  flash?: Flash | undefined;
  leagues: DashboardLeague[];
  limits: PlanLimits;
  channelCount: number;
}> = ({ user, flash, leagues, limits, channelCount }) => (
  <Layout title="Your leagues · Pundit" user={user} flash={flash}>
    <div class="spread" style="margin-bottom:16px">
      <h1 style="margin:0">Your leagues</h1>
      <span class="pill">
        {leagues.length}/{limits.maxLeagues} leagues · {user.plan === "free" ? "Free beta" : user.plan}
      </span>
    </div>

    {leagues.length < limits.maxLeagues ? (
      <div class="card">
        <form method="post" action="/leagues" class="stack">
          <div>
            <label for="league">Add a league</label>
            <input
              id="league"
              name="league"
              type="text"
              required
              placeholder="League ID or link, e.g. https://fantasy.premierleague.com/leagues/123456/standings/c"
              inputmode="url"
            />
            <p class="small muted" style="margin-top:6px">
              On the FPL website, open your league and copy the address from your browser. The number in it is the
              league ID.
            </p>
          </div>
          <div>
            <button class="btn primary" type="submit">
              Add league
            </button>
          </div>
        </form>
      </div>
    ) : (
      <div class="card muted">You've reached your plan's limit of {limits.maxLeagues} leagues.</div>
    )}

    {channelCount === 0 && leagues.length > 0 ? (
      <div class="card small">
        💡 You can always share bulletins to WhatsApp with one tap. To post automatically,{" "}
        <a href="/channels">link a Telegram group or Discord channel</a>.
      </div>
    ) : null}

    {leagues.map(({ league, reports, channelCount: chs }) => (
      <div class="card">
        <div class="spread">
          <div>
            <h2 style="margin:0">{league.name}</h2>
            <p class="small muted" style="margin:2px 0 0">
              League {league.fpl_league_id} ·{" "}
              {league.gameweek_enabled ? <span class="pill on">Auto weekly</span> : <span class="pill">Weekly off</span>}{" "}
              {league.monthly_enabled ? <span class="pill on">Auto monthly</span> : <span class="pill">Monthly off</span>}{" "}
              · {chs} channel{chs === 1 ? "" : "s"}
            </p>
          </div>
          <a class="btn sm" href={`/leagues/${league.id}`}>
            Settings
          </a>
        </div>

        <div class="row" style="margin-top:14px">
          {(["gameweek", "monthly", "standings"] as const).map((kind) => (
            <form class="inline" method="post" action={`/leagues/${league.id}/generate`}>
              <input type="hidden" name="kind" value={kind} />
              <button class="btn sm" type="submit">
                {kind === "gameweek" ? "Latest gameweek" : kind === "monthly" ? "This month" : "Standings"}
              </button>
            </form>
          ))}
        </div>

        {reports.length ? (
          <ul class="plain" style="margin-top:12px">
            {reports.map((r) => (
              <li class="spread">
                <a href={`/r/${r.slug}`}>{r.report.title}</a>
                <span class="small muted">{fmtDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="small muted" style="margin:12px 0 0">
            No bulletins yet. Generate one above, or wait for the next gameweek to finish.
          </p>
        )}
      </div>
    ))}
  </Layout>
);

// ---------- league settings ----------

export const LeaguePage: FC<{
  user: User;
  flash?: Flash | undefined;
  league: League;
  channels: Channel[];
  linked: Set<number>;
  reports: StoredReport[];
}> = ({ user, flash, league, channels, linked, reports }) => (
  <Layout title={`${league.name} · Pundit`} user={user} flash={flash}>
    <p class="small">
      <a href="/dashboard">← Your leagues</a>
    </p>
    <h1>{league.name}</h1>
    <p class="muted">League ID {league.fpl_league_id}</p>

    <div class="card">
      <h2>Automatic bulletins</h2>
      <form method="post" action={`/leagues/${league.id}/settings`}>
        <label class="check">
          <input type="checkbox" name="gameweek_enabled" value="1" checked={league.gameweek_enabled} />
          After every gameweek
        </label>
        <label class="check">
          <input type="checkbox" name="monthly_enabled" value="1" checked={league.monthly_enabled} />
          Manager of the month, after the last gameweek of each month
        </label>

        <h3 style="margin-top:18px">Post to</h3>
        {channels.length ? (
          channels.map((ch) => (
            <label class="check">
              <input type="checkbox" name="channel" value={String(ch.id)} checked={linked.has(ch.id)} />
              {ch.label} <span class="pill">{ch.kind}</span>
              {!ch.active ? <span class="pill bad">inactive</span> : null}
            </label>
          ))
        ) : (
          <p class="small muted">
            No channels yet. Every bulletin has a one-tap WhatsApp share button, and you can{" "}
            <a href="/channels">link Telegram, Discord or email</a> too.
          </p>
        )}
        <button class="btn primary" type="submit" style="margin-top:12px">
          Save settings
        </button>
      </form>
    </div>

    <div class="card">
      <h2>Past bulletins</h2>
      {reports.length ? (
        <ul class="plain">
          {reports.map((r) => (
            <li class="spread">
              <span>
                <a href={`/r/${r.slug}`}>{r.report.title}</a> <span class="pill">{KIND_LABEL[r.kind]}</span>
              </span>
              <span class="small muted">{fmtDate(r.created_at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted small">None yet.</p>
      )}
    </div>

    <div class="card">
      <h2>Remove league</h2>
      <p class="small muted">This deletes the league and its past bulletins from your account.</p>
      <form method="post" action={`/leagues/${league.id}/delete`} onsubmit="return confirm('Remove this league?')">
        <button class="btn danger" type="submit">
          Remove league
        </button>
      </form>
    </div>
  </Layout>
);

// ---------- public report ----------

const COPY_JS = `
document.querySelectorAll('[data-copy]').forEach(function(btn){
  btn.addEventListener('click', function(){
    var src = document.getElementById(btn.getAttribute('data-copy'));
    var text = src.value;
    var done = function(){ var o = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function(){ btn.textContent = o; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
    function fallback(){
      src.style.display = 'block'; src.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      src.style.display = 'none';
    }
  });
});`;

export const ReportPage: FC<{
  stored: StoredReport;
  user?: User | undefined;
  isOwner: boolean;
  flash?: Flash | undefined;
  waUrl: string;
  waText: string;
  pageUrl: string;
  appUrl: string;
  deliveries: { label: string; kind: string; status: string; error: string | null }[];
  channelCount: number;
}> = ({ stored, user, isOwner, flash, waUrl, waText, pageUrl, appUrl, deliveries, channelCount }) => {
  const r = stored.report;
  const ogTitle = `${r.title} — ${r.leagueName}`;
  const ogDesc = (renderReport(r, "plain").split("\n").slice(2, 8).join(" · ") || "Mini-league bulletin").slice(0, 200);
  return (
    <Layout
      title={ogTitle}
      user={user}
      flash={flash}
      head={
        <>
          <meta name="description" content={ogDesc} />
          <meta property="og:type" content="article" />
          <meta property="og:site_name" content="Pundit" />
          <meta property="og:title" content={ogTitle} />
          <meta property="og:description" content={ogDesc} />
          <meta property="og:url" content={pageUrl} />
          <meta name="twitter:card" content="summary" />
          <meta name="robots" content="noindex" />
        </>
      }
    >
      {isOwner ? (
        <p class="small">
          <a href={`/leagues/${stored.league_id}`}>← {r.leagueName}</a>
        </p>
      ) : null}
      <div class="phone" style="margin:0 auto">
        <div class="bulletin">{raw(renderReport(r, "html"))}</div>
        <div class="actions">
          <div class="stack">
            <a class="btn wa" href={waUrl} target="_blank" rel="noopener" style="width:100%">
              Send to WhatsApp
            </a>
            <button class="btn" type="button" data-copy="wa-text" style="width:100%">
              Copy text
            </button>
            <textarea id="wa-text" readonly style="display:none;width:100%;height:120px">
              {waText}
            </textarea>
          </div>
        </div>

        {isOwner ? (
          <div class="card" style="margin-top:16px">
            <h3>Auto-post channels</h3>
            {channelCount ? (
              <>
                {deliveries.length ? (
                  <ul class="plain small">
                    {deliveries.map((d) => (
                      <li class="spread">
                        <span>
                          {d.label} <span class="pill">{d.kind}</span>
                        </span>
                        <span class={`pill ${d.status === "sent" ? "on" : "bad"}`} title={d.error ?? ""}>
                          {d.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p class="small muted">Not posted to your channels yet.</p>
                )}
                <form method="post" action={`/r/${stored.slug}/deliver`} style="margin-top:10px">
                  <button class="btn sm" type="submit">
                    {deliveries.length ? "Post again to all channels" : "Post to my channels"}
                  </button>
                </form>
              </>
            ) : (
              <p class="small muted">
                <a href="/channels">Link Telegram, Discord or email</a> to post bulletins automatically.
              </p>
            )}
          </div>
        ) : null}

        <p class="small muted" style="text-align:center;margin-top:20px">
          Made with <a href={appUrl}>Pundit</a>: free weekly bulletins for your mini-league.
        </p>
      </div>
      <script>{raw(COPY_JS)}</script>
    </Layout>
  );
};

// ---------- channels ----------

export const ChannelsPage: FC<{
  user: User;
  flash?: Flash | undefined;
  channels: Channel[];
  telegram: { enabled: boolean; link?: string | undefined; username?: string | undefined };
  emailChannel?: Channel | undefined;
}> = ({ user, flash, channels, telegram, emailChannel }) => (
  <Layout title="Channels · Pundit" user={user} flash={flash}>
    <h1>Channels</h1>
    <p class="muted">
      Every bulletin has a <b>Send to WhatsApp</b> button: tap it, pick your group and send. Channels below receive
      bulletins automatically.
    </p>

    <div class="card">
      <h2>Your channels</h2>
      {channels.length ? (
        <ul class="plain">
          {channels.map((ch) => (
            <li class="spread">
              <span>
                {ch.label} <span class="pill">{ch.kind}</span>{" "}
                {!ch.active ? <span class="pill bad">inactive, re-link to resume</span> : null}
              </span>
              <span class="row">
                <form class="inline" method="post" action={`/channels/${ch.id}/test`}>
                  <button class="btn sm" type="submit">
                    Send test
                  </button>
                </form>
                <form class="inline" method="post" action={`/channels/${ch.id}/delete`}>
                  <button class="btn sm danger" type="submit">
                    Remove
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="small muted">No channels linked yet.</p>
      )}
    </div>

    <div class="grid">
      <div class="card">
        <h2>Telegram group</h2>
        {telegram.enabled ? (
          telegram.link ? (
            <div class="stack">
              <p class="small">Tap the button, choose your group, and the bot links it automatically.</p>
              <a class="btn primary" href={telegram.link} target="_blank" rel="noopener">
                Add @{telegram.username} to a group
              </a>
              <p class="small muted">This link works once and expires in 30 minutes.</p>
            </div>
          ) : (
            <form method="post" action="/channels/telegram">
              <p class="small">Add our bot to a Telegram group and bulletins will post there automatically.</p>
              <button class="btn primary" type="submit">
                Link a Telegram group
              </button>
            </form>
          )
        ) : (
          <p class="small muted">Telegram isn't set up on this server yet.</p>
        )}
      </div>

      <div class="card">
        <h2>Discord channel</h2>
        <form method="post" action="/channels/discord" class="stack">
          <p class="small">
            In Discord, open <b>Channel settings → Integrations → Webhooks → New webhook</b>, copy its URL and paste it
            here.
          </p>
          <div>
            <label for="webhook">Webhook URL</label>
            <input id="webhook" name="webhook" type="url" required placeholder="https://discord.com/api/webhooks/…" />
          </div>
          <div>
            <label for="label">Name (optional)</label>
            <input id="label" name="label" type="text" placeholder="#fpl-banter" maxlength={60} />
          </div>
          <button class="btn primary" type="submit">
            Add Discord channel
          </button>
        </form>
      </div>

      <div class="card">
        <h2>Email</h2>
        <p class="small">Get an email with the share button whenever a new bulletin is ready.</p>
        <form method="post" action="/channels/email">
          <input type="hidden" name="enabled" value={emailChannel ? "0" : "1"} />
          <button class={`btn ${emailChannel ? "" : "primary"}`} type="submit">
            {emailChannel ? "Turn off email" : `Email me at ${user.email}`}
          </button>
        </form>
      </div>
    </div>
  </Layout>
);

export const NotFoundPage: FC<{ user?: User | undefined }> = ({ user }) => (
  <Layout title="Not found · Pundit" user={user}>
    <div class="card" style="text-align:center;max-width:480px;margin:40px auto">
      <h1 style="font-size:1.6rem">Page not found</h1>
      <p class="muted">That page doesn't exist, or the link is wrong.</p>
      <a class="btn primary" href="/">
        Go home
      </a>
    </div>
  </Layout>
);
