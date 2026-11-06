import { serve } from "@hono/node-server";
import { loadConfig } from "./config.ts";
import { buildGameweekReport, buildMonthlyReport, FplError, getGameState } from "./core/index.ts";
import { openDb } from "./db/db.ts";
import { Repo } from "./db/repo.ts";
import { createSenders, deliverToLeagueChannels } from "./delivery/index.ts";
import { runTelegramPoller } from "./delivery/telegram.ts";
import { startScheduler } from "./jobs/scheduler.ts";
import { createApp } from "./web/app.tsx";

const config = loadConfig();
const db = openDb(config.DATABASE_PATH);
const repo = new Repo(db);
const senders = createSenders(config);
const deliveryDeps = { repo, senders, appUrl: config.appUrl };

const app = createApp({ config, repo, senders });

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`Pundit listening on http://localhost:${info.port} (APP_URL=${config.appUrl})`);
});

const scheduler = startScheduler({
  repo,
  core: {
    getGameState: () => getGameState(),
    buildGameweekReport: (id, opts) => buildGameweekReport(id, opts),
    buildMonthlyReport: (id, opts) => buildMonthlyReport(id, opts),
    isUpdating: (e) => e instanceof FplError && e.code === "updating",
  },
  deliver: (stored) => deliverToLeagueChannels(deliveryDeps, stored),
});

const abort = new AbortController();
if (config.telegramEnabled) {
  void runTelegramPoller(
    { token: config.TELEGRAM_BOT_TOKEN!, username: config.TELEGRAM_BOT_USERNAME!, repo, appUrl: config.appUrl },
    abort.signal,
  );
} else {
  console.log("[telegram] not configured (set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME to enable)");
}

const sessionSweep = setInterval(() => repo.purgeExpiredSessions(), 6 * 3600_000);

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down…`);
  scheduler.stop();
  abort.abort();
  clearInterval(sessionSweep);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
