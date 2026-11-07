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
  `
  CREATE TABLE shift (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
  );

  CREATE TABLE card (
    id INTEGER PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shift (id),
    client_id TEXT NOT NULL UNIQUE,
    number INTEGER NOT NULL CHECK (number > 0),
    family_size INTEGER NOT NULL CHECK (family_size > 0),
    arrival_method TEXT NOT NULL
      CHECK (arrival_method IN ('East', 'West', 'AC', 'Bus', 'Walk')),
    senior_box INTEGER NOT NULL DEFAULT 0,
    cheese INTEGER NOT NULL DEFAULT 0,
    other TEXT NOT NULL DEFAULT '',
    tefap_bags INTEGER NOT NULL CHECK (tefap_bags >= 0),
    tefap_override INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'entered'
      CHECK (status IN ('entered', 'called', 'confirmed', 'distributed')),
    load_1 REAL CHECK (load_1 >= 0),
    load_2 REAL CHECK (load_2 >= 0),
    load_3 REAL CHECK (load_3 >= 0),
    revision INTEGER NOT NULL DEFAULT 1,
    UNIQUE (shift_id, number)
  );
  `,
  `
  CREATE TABLE partner_batch (
    id INTEGER PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shift (id),
    client_id TEXT NOT NULL UNIQUE,
    partner TEXT NOT NULL CHECK (partner IN ('Door Dash', 'Helping Hands')),
    family_count INTEGER NOT NULL CHECK (family_count > 0),
    weight REAL NOT NULL CHECK (weight >= 0)
  );

  CREATE TABLE returned_batch (
    id INTEGER PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shift (id),
    client_id TEXT NOT NULL UNIQUE,
    weight REAL NOT NULL CHECK (weight > 0)
  );
  `,
  `
  ALTER TABLE shift ADD COLUMN reopened INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL
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
