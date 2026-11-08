import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Sqlite from "better-sqlite3";
import { MIGRATIONS, openDatabase } from "./db.js";

describe("openDatabase", () => {
  const dirs: string[] = [];

  function tempPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "mc-fd-dist-"));
    dirs.push(dir);
    return join(dir, "test.db");
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses WAL mode for a database file", () => {
    const db = openDatabase(tempPath());
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.close();
  });

  it("enforces foreign keys", () => {
    const db = openDatabase(":memory:");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.close();
  });

  it("keeps existing data when the database is reopened", () => {
    const path = tempPath();
    const first = openDatabase(path);
    first
      .prepare("INSERT INTO account (username, password_hash, role) VALUES (?, ?, ?)")
      .run("front-desk", "hash", "front_desk");
    first.close();

    const second = openDatabase(path);
    const row = second.prepare("SELECT username FROM account").get() as { username: string };
    second.close();

    expect(row.username).toBe("front-desk");
  });

  describe("when a database from before 'left without food' is upgraded", () => {
    function databaseAtVersion4(): string {
      const path = tempPath();
      const old = new Sqlite(path);
      MIGRATIONS.slice(0, 4).forEach((sql) => old.exec(sql));
      old.pragma("user_version = 4");
      old.prepare("INSERT INTO shift (date) VALUES ('2026-11-07')").run();
      old
        .prepare(
          `INSERT INTO card (shift_id, client_id, number, family_size, arrival_method, tefap_bags, status)
           VALUES (1, 'a', 1, 5, 'East', 2, 'called')`,
        )
        .run();
      old.close();
      return path;
    }

    it("keeps existing cards", () => {
      const db = openDatabase(databaseAtVersion4());
      const card = db.prepare("SELECT number, family_size, status FROM card").get();
      db.close();
      expect(card).toEqual({ number: 1, family_size: 5, status: "called" });
    });

    it("accepts the new status, and still rejects unknown ones", () => {
      const db = openDatabase(databaseAtVersion4());
      expect(() => db.prepare("UPDATE card SET status = 'left'").run()).not.toThrow();
      expect(() => db.prepare("UPDATE card SET status = 'lost'").run()).toThrow(
        "CHECK constraint failed",
      );
      db.close();
    });

    it("still allows each card number only once per shift", () => {
      const db = openDatabase(databaseAtVersion4());
      expect(() =>
        db
          .prepare(
            `INSERT INTO card (shift_id, client_id, number, family_size, arrival_method, tefap_bags)
             VALUES (1, 'b', 1, 2, 'Walk', 1)`,
          )
          .run(),
      ).toThrow("UNIQUE constraint failed");
      db.close();
    });
  });
});
