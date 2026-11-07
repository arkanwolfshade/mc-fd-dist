import Sqlite from "better-sqlite3";
import type { Database } from "better-sqlite3";

// Applied in order. Each entry's position is its schema version, so entries must
// never be edited or reordered once released: add a new one instead.
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE account (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('front_desk', 'distribution', 'admin'))
  );

  CREATE TABLE session (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES account (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  `,
];

export function openDatabase(path: string): Database {
  const db = new Sqlite(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  MIGRATIONS.slice(current).forEach((sql, index) => {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${current + index + 1}`);
    })();
  });
}
