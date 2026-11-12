import Sqlite from "better-sqlite3";
import type { Database } from "better-sqlite3";

// A migration is SQL, or a function for one that must check the data before it changes it.
type Migration = string | ((db: Database) => void);

// Applied in order. Each entry's position is its schema version, so entries must
// never be edited or reordered once released: add a new one instead.
export const MIGRATIONS: readonly Migration[] = [
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
  // SQLite cannot change a CHECK constraint, so the card table is rebuilt to allow "left".
  `
  CREATE TABLE card_new (
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
      CHECK (status IN ('entered', 'called', 'confirmed', 'distributed', 'left')),
    load_1 REAL CHECK (load_1 >= 0),
    load_2 REAL CHECK (load_2 >= 0),
    load_3 REAL CHECK (load_3 >= 0),
    revision INTEGER NOT NULL DEFAULT 1,
    UNIQUE (shift_id, number)
  );
  INSERT INTO card_new SELECT * FROM card;
  DROP TABLE card;
  ALTER TABLE card_new RENAME TO card;
  `,
  // Partner Families become cards with Door Dash or Helping Hands as their location or transport,
  // and cards gain the extras check and the intake volunteer's initials. See ADR 0023 and 0024.
  // A partner batch holds no card numbers or sizes, so it cannot become cards: the upgrade stops
  // rather than lose it.
  (db) => {
    const { batches } = db.prepare("SELECT COUNT(*) AS batches FROM partner_batch").get() as {
      batches: number;
    };
    if (batches > 0) {
      throw new Error(
        `The database holds ${batches} partner batch(es), which cannot become cards. ` +
          "Re-enter them as Door Dash or Helping Hands cards by hand, then delete them. See ADR 0023.",
      );
    }
    db.exec(`
      CREATE TABLE card_new (
        id INTEGER PRIMARY KEY,
        shift_id INTEGER NOT NULL REFERENCES shift (id),
        client_id TEXT NOT NULL UNIQUE,
        number INTEGER NOT NULL CHECK (number > 0),
        family_size INTEGER NOT NULL CHECK (family_size > 0),
        arrival_method TEXT NOT NULL
          CHECK (arrival_method IN ('East', 'West', 'AC', 'Bus', 'Walk', 'DD', 'HH')),
        senior_box INTEGER NOT NULL DEFAULT 0,
        cheese INTEGER NOT NULL DEFAULT 0,
        other TEXT NOT NULL DEFAULT '',
        tefap_bags INTEGER NOT NULL CHECK (tefap_bags >= 0),
        tefap_override INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'entered'
          CHECK (status IN ('entered', 'called', 'confirmed', 'distributed', 'left')),
        load_1 REAL CHECK (load_1 >= 0),
        load_2 REAL CHECK (load_2 >= 0),
        load_3 REAL CHECK (load_3 >= 0),
        revision INTEGER NOT NULL DEFAULT 1,
        extras_added INTEGER NOT NULL DEFAULT 0,
        extras_note TEXT NOT NULL DEFAULT '',
        intake_initials TEXT,
        UNIQUE (shift_id, number)
      );
      INSERT INTO card_new (id, shift_id, client_id, number, family_size, arrival_method,
        senior_box, cheese, other, tefap_bags, tefap_override, status, load_1, load_2, load_3,
        revision)
      SELECT id, shift_id, client_id, number, family_size, arrival_method, senior_box, cheese,
        other, tefap_bags, tefap_override, status, load_1, load_2, load_3, revision
      FROM card;
      DROP TABLE card;
      ALTER TABLE card_new RENAME TO card;
      DROP TABLE partner_batch;
    `);
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function openDatabase(path: string): Database {
  const db = new Sqlite(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  try {
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

function migrate(db: Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  MIGRATIONS.slice(current).forEach((migration, index) => {
    db.transaction(() => {
      if (typeof migration === "string") db.exec(migration);
      else migration(db);
      db.pragma(`user_version = ${current + index + 1}`);
    })();
  });
}
