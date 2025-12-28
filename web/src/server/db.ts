import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(THIS_DIR, "..", "..", "data");
export const DB_PATH = join(DATA_DIR, "glmtts.sqlite");

mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH, { create: true, strict: true });

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    input_text TEXT NOT NULL,
    reference_text TEXT,
    seed INTEGER,
    audio_path TEXT NOT NULL,
    audio_mime TEXT NOT NULL,
    output_filename TEXT NOT NULL,
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

// Lightweight schema migrations for existing DBs.
// SQLite doesn't support IF NOT EXISTS for ADD COLUMN on all versions.
for (const sql of [
  "ALTER TABLE generations ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}'",
]) {
  try {
    db.run(sql);
  } catch {
    // ignore (e.g. duplicate column)
  }
}

db.run(
  "CREATE INDEX IF NOT EXISTS idx_generations_session_created_at ON generations(session_id, created_at DESC);",
);

// Saved configurations table
db.run(`
  CREATE TABLE IF NOT EXISTS saved_configs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    settings_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

db.run(
  "CREATE INDEX IF NOT EXISTS idx_saved_configs_session_created_at ON saved_configs(session_id, created_at DESC);",
);

export function nowMs(): number {
  return Date.now();
}
