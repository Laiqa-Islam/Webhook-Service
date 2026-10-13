import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { newId, newSecret } from "./id";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS endpoints (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  secret TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  next_attempt_at INTEGER NOT NULL,
  manual_next INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_due ON deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_event ON deliveries(event_id);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id),
  attempt_number INTEGER NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'auto',
  status_code INTEGER,
  ok INTEGER NOT NULL,
  response_body TEXT,
  error TEXT,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_delivery ON attempts(delivery_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS destination_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT,
  event_type TEXT,
  delivery_id TEXT,
  attempt INTEGER,
  signature_valid INTEGER NOT NULL,
  responded_status INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
`;

const g = globalThis as unknown as { __webhookDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__webhookDb) {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const d = new DatabaseSync(path.join(dir, "webhooks.db"));
    d.exec("PRAGMA journal_mode = WAL;");
    d.exec(SCHEMA);
    migrate(d);
    seed(d);
    g.__webhookDb = d;
  }
  return g.__webhookDb;
}

// Additive migrations for databases created by earlier versions.
function migrate(d: DatabaseSync) {
  ensureColumns(d, "endpoints", [
    ["consecutive_failures", "consecutive_failures INTEGER NOT NULL DEFAULT 0"],
    ["circuit_state", "circuit_state TEXT NOT NULL DEFAULT 'closed'"],
    ["circuit_opened_at", "circuit_opened_at INTEGER"],
    ["old_secret", "old_secret TEXT"],
    ["old_secret_expires_at", "old_secret_expires_at INTEGER"],
    ["event_types", "event_types TEXT NOT NULL DEFAULT '*'"],
    ["strict_ordering", "strict_ordering INTEGER NOT NULL DEFAULT 0"],
  ]);
}

function ensureColumns(
  d: DatabaseSync,
  table: string,
  cols: [name: string, ddl: string][]
) {
  const existing = new Set(
    (
      d.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as {
        name: string;
      }[]
    ).map((r) => r.name)
  );
  for (const [name, ddl] of cols) {
    if (!existing.has(name)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function getSetting(key: string): string | null {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

// Seed a built-in demo destination endpoint so the console works out of the box.
function seed(d: DatabaseSync) {
  const count = d.prepare("SELECT COUNT(*) AS n FROM endpoints").get() as {
    n: number;
  };
  if (count.n > 0) return;

  const id = newId("ep");
  const port = process.env.PORT ?? "3000";
  d.prepare(
    "INSERT INTO endpoints (id, url, description, secret, active, created_at) VALUES (?, ?, ?, ?, 1, ?)"
  ).run(
    id,
    `http://localhost:${port}/api/destination`,
    "Built-in demo destination (has a kill switch)",
    newSecret(),
    Date.now()
  );
  d.prepare(
    "INSERT INTO settings (key, value) VALUES ('demo_endpoint_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(id);
  d.prepare(
    "INSERT INTO settings (key, value) VALUES ('destination_mode', 'healthy') ON CONFLICT(key) DO NOTHING"
  ).run();
}
