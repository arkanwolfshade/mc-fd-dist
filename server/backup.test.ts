import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Sqlite from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBackup, describeBackup, restoreBackup } from "./backup.js";
import { openDatabase, SCHEMA_VERSION } from "./db.js";

function addShift(path: string, date: string): void {
  const db = openDatabase(path);
  db.prepare("INSERT INTO shift (date) VALUES (?)").run(date);
  db.close();
}

function shiftDates(path: string): string[] {
  const db = new Sqlite(path, { readonly: true });
  const rows = db.prepare("SELECT date FROM shift ORDER BY date").all() as { date: string }[];
  db.close();
  return rows.map((row) => row.date);
}

describe("backups", () => {
  let dir: string;
  let source: string;
  let backup: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mc-backup-"));
    source = join(dir, "live.db");
    backup = join(dir, "backup.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("createBackup", () => {
    it("includes recent writes the live database has not yet moved out of its WAL", async () => {
      const live = openDatabase(source);
      live.prepare("INSERT INTO shift (date) VALUES (?)").run("2026-11-06");

      await createBackup(source, backup);
      live.close();

      expect(shiftDates(backup)).toEqual(["2026-11-06"]);
    });

    it("produces one self-contained file", async () => {
      addShift(source, "2026-11-06");

      await createBackup(source, backup);

      expect(readdirSync(dir).filter((name) => name.startsWith("backup"))).toEqual(["backup.db"]);
    });

    it("creates the folder it writes into", async () => {
      addShift(source, "2026-11-06");
      const nested = join(dir, "backups", "nightly.db");

      await createBackup(source, nested);

      expect(shiftDates(nested)).toEqual(["2026-11-06"]);
    });

    it("leaves no partial file when the source is not a database", async () => {
      writeFileSync(source, "this is not a database, and it is long enough to be read as one");

      await expect(createBackup(source, backup)).rejects.toThrow();

      expect(readdirSync(dir)).toEqual(["live.db"]);
    });
  });

  describe("describeBackup", () => {
    it("reports what a backup holds, so a restore can be compared with the original", async () => {
      addShift(source, "2026-11-05");
      addShift(source, "2026-11-06");
      await createBackup(source, backup);

      expect(describeBackup(backup)).toEqual({
        schemaVersion: SCHEMA_VERSION,
        shifts: 2,
        cards: 0,
        latestShift: "2026-11-06",
      });
    });

    it("refuses a file that is not a database", () => {
      writeFileSync(backup, "this is not a database, and it is long enough to be read as one");
      expect(() => describeBackup(backup)).toThrow();
    });

    it("refuses a database with no schema", () => {
      new Sqlite(backup).close();
      expect(() => describeBackup(backup)).toThrow("not a backup of this app");
    });

    it("refuses a backup from a newer version of the app", async () => {
      addShift(source, "2026-11-06");
      await createBackup(source, backup);
      const db = new Sqlite(backup);
      db.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
      db.close();

      expect(() => describeBackup(backup)).toThrow("newer version");
    });

    it("refuses a damaged backup", async () => {
      const db = new Sqlite(backup);
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
      db.exec(`
        CREATE TABLE shift (id INTEGER PRIMARY KEY, date TEXT);
        CREATE TABLE card (id INTEGER PRIMARY KEY);
        CREATE INDEX shift_date ON shift (date);
        INSERT INTO shift (date) VALUES ('2026-11-06');
      `);
      const { rootpage } = db
        .prepare("SELECT rootpage FROM sqlite_schema WHERE name = 'shift_date'")
        .get() as { rootpage: number };
      db.close();
      corruptPage(backup, rootpage);

      expect(() => describeBackup(backup)).toThrow();
    });
  });

  describe("restoreBackup", () => {
    it("replaces the database and keeps the previous one beside it", async () => {
      addShift(source, "2026-11-05");
      await createBackup(source, backup);
      addShift(source, "2026-11-06");

      const kept = restoreBackup(backup, source);

      expect(shiftDates(source)).toEqual(["2026-11-05"]);
      expect(kept).not.toBeNull();
      expect(shiftDates(kept as string)).toEqual(["2026-11-05", "2026-11-06"]);
    });

    it("restores onto a new server with no database", async () => {
      addShift(source, "2026-11-05");
      await createBackup(source, backup);
      const target = join(dir, "new", "restored.db");

      const kept = restoreBackup(backup, target);

      expect(kept).toBeNull();
      expect(shiftDates(target)).toEqual(["2026-11-05"]);
    });

    it("leaves the database alone when the backup is unusable", () => {
      addShift(source, "2026-11-05");
      writeFileSync(backup, "this is not a database, and it is long enough to be read as one");

      expect(() => restoreBackup(backup, source)).toThrow();

      // Checked first, because reading a WAL database leaves its side files behind.
      expect(readdirSync(dir).sort()).toEqual(["backup.db", "live.db"]);
      expect(shiftDates(source)).toEqual(["2026-11-05"]);
    });

    it("does not let old WAL contents replay over the restored data", async () => {
      addShift(source, "2026-11-05");
      await createBackup(source, backup);

      // Left behind by a server that stopped uncleanly.
      writeFileSync(`${source}-wal`, "leftover");

      restoreBackup(backup, source);

      expect(existsSync(`${source}-wal`)).toBe(false);
      const restored = openDatabase(source);
      restored.close();
      expect(shiftDates(source)).toEqual(["2026-11-05"]);
    });
  });
});

function corruptPage(path: string, page: number): void {
  const db = new Sqlite(path);
  const pageSize = db.pragma("page_size", { simple: true }) as number;
  db.close();
  const noise = Buffer.alloc(pageSize, 0xff);
  const fd = openSync(path, "r+");
  writeSync(fd, noise, 0, pageSize, (page - 1) * pageSize);
  closeSync(fd);
}
