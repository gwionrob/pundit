import type { Child, FC } from "hono/jsx";
import { raw } from "hono/html";
import type { User } from "../db/repo.ts";

export interface Flash {
  kind: "ok" | "err";
  text: string;
}

const CSS = `
:root{
  --bg:#f7f7f4;--surface:#ffffff;--surface-2:#f0f0ec;--text:#16181d;--muted:#5d6370;--border:#e2e2dc;
  --accent:#0f766e;--accent-ink:#ffffff;--accent-soft:#e3f3f1;--danger:#b42318;--danger-soft:#fdecea;
  --ok:#067647;--ok-soft:#e7f6ec;--wa:#1fa855;--radius:12px;--shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08);
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0f1115;--surface:#171a20;--surface-2:#1f232b;--text:#eceef2;--muted:#9aa1ad;--border:#2a2f38;
  --accent:#2dd4bf;--accent-ink:#04201d;--accent-soft:#12302d;--danger:#f97066;--danger-soft:#3a1714;
  --ok:#47cd89;--ok-soft:#0f2e1f;--wa:#25d366;--shadow:none;color-scheme:dark;
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.wrap{max-width:880px;margin:0 auto;padding:0 16px}
header.top{border-bottom:1px solid var(--border);background:var(--surface)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px;flex-wrap:wrap}
.brand{font-weight:800;letter-spacing:-.01em;color:var(--text);text-decoration:none;display:flex;align-items:center;gap:8px}
.brand .mark{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--accent);color:var(--accent-ink);font-size:15px}
nav.links{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
nav.links a,nav.links button{color:var(--muted);text-decoration:none;padding:6px 10px;border-radius:8px;font:inherit;font-size:15px;background:none;border:0;cursor:pointer}
nav.links a:hover,nav.links button:hover{background:var(--surface-2);color:var(--text)}
main{padding:28px 0 64px}
h1{font-size:clamp(1.7rem,4vw,2.4rem);line-height:1.15;letter-spacing:-.02em;margin:0 0 12px}
h2{font-size:1.25rem;margin:0 0 12px;letter-spacing:-.01em}
h3{font-size:1.05rem;margin:0 0 8px}
p{margin:0 0 12px}
.muted{color:var(--muted)}
.small{font-size:14px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-bottom:16px}
.stack>*+*{margin-top:12px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.spread{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-weight:600;font-size:15px;text-decoration:none;cursor:pointer;min-height:42px}
.btn:hover{background:var(--surface-2)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{filter:brightness(1.07)}
.btn.wa{background:var(--wa);border-color:var(--wa);color:#fff;font-size:17px;padding:14px 22px}
.btn.danger{color:var(--danger);border-color:var(--danger)}
.btn.big{font-size:17px;padding:14px 22px}
.btn.sm{padding:6px 12px;min-height:34px;font-size:14px}
form.inline{display:inline}
label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}
input[type=text],input[type=email],input[type=password],input[type=url]{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit}
input:focus-visible,.btn:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.check{display:flex;gap:10px;align-items:center;font-weight:500;font-size:15px;margin:8px 0}
.check input{width:18px;height:18px;accent-color:var(--accent)}
.flash{padding:12px 14px;border-radius:10px;margin-bottom:16px;font-size:15px}
.flash.ok{background:var(--ok-soft);color:var(--ok)}
.flash.err{background:var(--danger-soft);color:var(--danger)}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:var(--surface-2);color:var(--muted)}
.pill.on{background:var(--accent-soft);color:var(--accent)}
.pill.bad{background:var(--danger-soft);color:var(--danger)}
ul.plain{list-style:none;margin:0;padding:0}
ul.plain li{padding:10px 0;border-top:1px solid var(--border)}
ul.plain li:first-child{border-top:0}
.hero{padding:24px 0 8px}
.hero p.lead{font-size:1.15rem;color:var(--muted);max-width:40rem}
.steps{counter-reset:s;list-style:none;padding:0;margin:0}
.steps li{counter-increment:s;padding-left:44px;position:relative;margin-bottom:16px}
.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:30px;height:30px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-weight:700}
.bulletin{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 22px;box-shadow:var(--shadow)}
.bulletin h2{font-size:1.35rem;margin-bottom:2px}
.bulletin section{padding:12px 0;border-top:1px dashed var(--border)}
.bulletin section:first-of-type{border-top:0}
.bulletin section h3{font-size:1rem;margin-bottom:6px}
.bulletin section p{margin:0 0 4px}
.phone{max-width:420px}
footer.site{border-top:1px solid var(--border);padding:24px 0;color:var(--muted);font-size:14px}
.actions{position:sticky;bottom:0;background:linear-gradient(transparent,var(--bg) 30%);padding:16px 0 8px;margin-top:8px}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}
`;

export const Layout: FC<{
  title: string;
  user?: User | undefined;
  flash?: Flash | undefined;
  head?: Child;
  children?: Child;
}> = ({ title, user, flash, head, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <meta name="theme-color" content="#0f766e" />
      <link
        rel="icon"
        href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230f766e'/%3E%3Ctext x='16' y='22' font-size='17' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='700'%3EP%3C/text%3E%3C/svg%3E"
      />
      {head}
      <style>{raw(CSS)}</style>
    </head>
    <body>
      <header class="top">
        <div class="wrap">
          <a class="brand" href={user ? "/dashboard" : "/"}>
            <span class="mark">P</span> Pundit
          </a>
          <nav class="links">
            {user ? (
              <>
                <a href="/dashboard">Leagues</a>
                <a href="/channels">Channels</a>
                <form class="inline" method="post" action="/logout">
                  <button type="submit">Log out</button>
                </form>
              </>
            ) : (
              <>
                <a href="/login">Log in</a>
                <a class="btn primary sm" href="/signup">
                  Sign up free
                </a>
              </>
            )}
          </nav>
        </div>
      </header>
      <main>
        <div class="wrap">
          {flash ? <div class={`flash ${flash.kind}`}>{flash.text}</div> : null}
          {children}
        </div>
      </main>
      <footer class="site">
        <div class="wrap">
          Pundit — the weekly bulletin for your Fantasy Premier League mini-league. Not affiliated with the
          Premier League.
        </div>
      </footer>
    </body>
  </html>
);
