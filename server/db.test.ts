import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";

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
});
