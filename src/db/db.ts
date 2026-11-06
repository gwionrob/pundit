import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Ordered list of migrations. Each entry runs once; PRAGMA user_version
 * records how many have been applied. Never edit an applied migration —
 * append a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    plan          TEXT NOT NULL DEFAULT 'free',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE leagues (
    id                INTEGER PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fpl_league_id     INTEGER NOT NULL,
    name              TEXT NOT NULL,
    gameweek_enabled  INTEGER NOT NULL DEFAULT 1,
    monthly_enabled   INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (user_id, fpl_league_id)
  );

  CREATE TABLE channels (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('telegram','discord','email')),
    label       TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX channels_user ON channels(user_id);

  CREATE TABLE league_channels (
    league_id  INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    PRIMARY KEY (league_id, channel_id)
  );

  CREATE TABLE reports (
    id          INTEGER PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    league_id   INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('gameweek','monthly','standings')),
    period_key  TEXT NOT NULL,
    report_json TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (league_id, kind, period_key)
  );
  CREATE INDEX reports_league ON reports(league_id, created_at);

  CREATE TABLE deliveries (
    id         INTEGER PRIMARY KEY,
    report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('sent','failed')),
    error      TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (report_id, channel_id)
  );

  CREATE TABLE telegram_link_codes (
    code       TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE job_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]!;
    db.exec("BEGIN");
    try {
      db.exec(sql);
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
