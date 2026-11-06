# Pundit 🎙️

The weekly bulletin for your Fantasy Premier League mini-league: gameweek winner, wooden spoon,
captain hauls and flops, bench of shame, transfer hits, chips, movers, and Manager of the Month.

Sign up, add your league, and every gameweek a fresh bulletin is ready to drop into your group chat:

- **WhatsApp**: one tap opens WhatsApp with the bulletin pre-written. Pick your group and send.
- **Telegram**: add the bot to your group and bulletins post automatically.
- **Discord**: paste a channel webhook and bulletins post automatically.
- **Email**: get a "your bulletin is ready" email with the WhatsApp share button.

> Delivery only uses official, terms-compliant routes. WhatsApp has no official API for posting into
> ordinary group chats, so the WhatsApp step is a pre-filled share link rather than automation.

_Not affiliated with the Premier League or Fantasy Premier League._

## Quick start

Requires Node 22.13+ (uses the built-in `node:sqlite`).

```sh
npm install
cp .env.example .env      # set SESSION_SECRET at minimum
npm run dev               # open http://localhost:5173
```

`npm run dev` starts two processes: the Hono API server (port 3000) and the Vite dev server for the
React app (port 5173, with hot reload). Open the Vite one. It forwards API calls to Hono.

## CLI

There's also a `pundit` command that works without the web app:

```sh
npx pundit-cli gameweek <league>          # no install
npm i -g pundit-cli                       # or install it
brew install gwionrob/tap/pundit          # or with Homebrew
```

```sh
pundit gameweek <leagueId or league URL>        # this gameweek's bulletin
pundit gameweek 123456 --gw 8                   # a specific gameweek
pundit monthly 123456 --month 10 --year 2026    # Manager of the Month
pundit standings 123456 --top 5
pundit gameweek 123456 --whatsapp               # opens WhatsApp with it pre-written
pundit gameweek 123456 --copy                   # copy to clipboard
pundit standings 123456 --format telegram       # terminal | whatsapp | telegram | discord | plain
```

On screen you get a readable bulletin with colour. When piped, copied or sent with `--whatsapp`
it uses WhatsApp formatting (`*bold*`), since that's where it's usually going. Set `NO_COLOR=1` to
turn colour off. `pundit --help` lists everything.

### Optional integrations

| Feature | Env vars | Setup |
| --- | --- | --- |
| Telegram auto-posting | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Create a bot with [@BotFather](https://t.me/BotFather). The app long-polls, so no webhook or public URL is needed. |
| Email notifications | `RESEND_API_KEY`, `EMAIL_FROM` | [Resend](https://resend.com) account with a verified domain. Without a key, emails are logged to the console. |

## How it works

```
client/       React app (Vite, React Router, TanStack Query): login, dashboard, league settings,
              channels, in-app bulletins
src/
  core/       FPL API client, stats engine, report renderers (WhatsApp/Telegram/Discord/HTML)
  db/         SQLite schema, migrations, repositories
  web/        Hono server: JSON API (/api), plus server-rendered landing page and public
              bulletin pages (/r/:slug), so WhatsApp/Telegram link previews work
  shared/     API types and React components used by both the server and the client
  delivery/   Telegram bot, Discord webhooks, email, WhatsApp share links
  jobs/       Scheduler: polls FPL every 15 min; when a gameweek's points are final,
              generates bulletins (and Manager of the Month at month end) and delivers them
  cli/        The `pundit` command (entry: bin/pundit.js)
```

## Development

```sh
npm test            # vitest (no network: tests use recorded FPL fixtures)
npm run typecheck   # server + client
npm run lint        # ESLint (typescript-eslint, react-hooks)
npm run build       # production build of the React app into client/dist
```

CI runs all four on every pull request (`.github/workflows/ci.yml`).

Debugging: install the React DevTools browser extension for the app, and the TanStack Query
devtools show every API call's cached data. For the server, `console.log` or run it with
`node --inspect` via `npx tsx --inspect src/index.ts`.

## Deploying

It's a single Node process with a SQLite file, and in production the Hono server also serves the
built React app. The `Dockerfile` works on any host with a persistent disk.

**Fly.io** (config in `fly.toml`: one always-on machine in London with a 1 GB volume at `/data`):

```sh
fly apps create pundit-bulletin
fly volumes create pundit_data --region lhr --size 1
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)
# optional: fly secrets set TELEGRAM_BOT_TOKEN=… TELEGRAM_BOT_USERNAME=… RESEND_API_KEY=…
fly deploy
```

Elsewhere: run `npm run build`, then `npm start`. Set a real `SESSION_SECRET` and `APP_URL`, point
`DATABASE_PATH` at the persistent volume, and set `TRUST_PROXY=true` behind the host's proxy.

## Releasing the CLI

```sh
npm version patch                 # bump the version
npm run build:cli                 # bundles to dist-cli/ (single file, no dependencies)
npm publish ./dist-cli
```

Then update `url` and `sha256` in the Homebrew formula (`gwionrob/homebrew-tap`, `Formula/pundit.rb`).

## Licence

The `pundit` CLI (the `pundit-cli` npm package) is [MIT licensed](LICENSE-CLI).
Everything else in this repository, including the web app, is © Gwion Robertson, all rights reserved.
