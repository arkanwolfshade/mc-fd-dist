import argon2 from "argon2";
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createAccount, verifyPassword } from "./accounts.js";
import { openDatabase } from "./db.js";

const PASSWORD = "correct-horse-battery";

describe("accounts", () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  it("stores an Argon2id hash, not the password", async () => {
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });
    const row = db.prepare("SELECT password_hash FROM account").get() as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain(PASSWORD);
  });

  it("rejects a password shorter than ten characters", async () => {
    await expect(
      createAccount(db, { username: "front-desk", password: "too-short", role: "front_desk" }),
    ).rejects.toThrow(/at least 10 characters/);
  });

  it("rejects a duplicate username regardless of case", async () => {
    await createAccount(db, { username: "Admin", password: PASSWORD, role: "admin" });
    await expect(
      createAccount(db, { username: "admin", password: PASSWORD, role: "admin" }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects an unknown role", async () => {
    await expect(
      createAccount(db, { username: "x", password: PASSWORD, role: "owner" as never }),
    ).rejects.toThrow(/role/);
  });

  it("returns the account for the correct password", async () => {
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });
    const account = await verifyPassword(db, "front-desk", PASSWORD);
    expect(account).toMatchObject({ username: "front-desk", role: "front_desk" });
  });

  it("returns null for a wrong password", async () => {
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });
    expect(await verifyPassword(db, "front-desk", "wrong-password-here")).toBeNull();
  });

  it("returns null for an unknown username", async () => {
    expect(await verifyPassword(db, "nobody", PASSWORD)).toBeNull();
  });

  it("returns null when the password is changed while it is being checked", async () => {
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });
    const newHash = await argon2.hash("a-different-password");

    // The old hash is read at once and verified in the background, so this change lands
    // while the check is still running.
    const check = verifyPassword(db, "front-desk", PASSWORD);
    db.prepare("UPDATE account SET password_hash = ? WHERE username = ?").run(
      newHash,
      "front-desk",
    );

    expect(await check).toBeNull();
  });

  it("returns null when the account is deleted while it is being checked", async () => {
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });

    const check = verifyPassword(db, "front-desk", PASSWORD);
    db.prepare("DELETE FROM account WHERE username = ?").run("front-desk");

    expect(await check).toBeNull();
  });
});
