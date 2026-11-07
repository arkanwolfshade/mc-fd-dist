import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts.js";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";

const PASSWORD = "correct-horse-battery";
const HOUR = 60 * 60 * 1000;

describe("auth routes", () => {
  let db: Database;
  let app: FastifyInstance;
  let time: number;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    time = Date.UTC(2026, 10, 6, 12);
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });
    await createAccount(db, { username: "pat", password: PASSWORD, role: "admin" });
    app = await buildApp({ db, cookieSecure: true, now: () => time });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  function login(username: string, password = PASSWORD) {
    return app.inject({ method: "POST", url: "/api/login", payload: { username, password } });
  }

  async function sessionCookie(username: string): Promise<string> {
    const response = await login(username);
    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((c) => c.name === "session");
    return `session=${cookie?.value}`;
  }

  function get(url: string, cookie?: string) {
    return app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });
  }

  it("returns the role and sets a protected session cookie on login", async () => {
    const response = await login("front-desk");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ username: "front-desk", role: "front_desk" });

    const cookie = response.cookies.find((c) => c.name === "session");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  });

  it("gives the same response for a wrong password and an unknown user", async () => {
    const wrong = await login("front-desk", "wrong-password-here");
    const unknown = await login("nobody");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it("rejects a login without a password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { username: "front-desk" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("limits repeated login attempts", async () => {
    for (let i = 0; i < 10; i++) {
      await login("front-desk", "wrong-password-here");
    }
    const response = await login("front-desk");
    expect(response.statusCode).toBe(429);
  });

  it("requires a session for /api/me", async () => {
    expect((await get("/api/me")).statusCode).toBe(401);
  });

  it("rejects a made-up session token", async () => {
    expect((await get("/api/me", "session=not-a-real-token")).statusCode).toBe(401);
  });

  it("identifies the signed-in account", async () => {
    const response = await get("/api/me", await sessionCookie("front-desk"));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ username: "front-desk", role: "front_desk" });
  });

  it("does not store the session token in the database", async () => {
    const cookie = await sessionCookie("front-desk");
    const token = cookie.replace("session=", "");
    const rows = db.prepare("SELECT token_hash FROM session").all() as { token_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).not.toBe(token);
  });

  it("ends the session on logout", async () => {
    const cookie = await sessionCookie("front-desk");
    const logout = await app.inject({
      method: "POST",
      url: "/api/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);
    expect((await get("/api/me", cookie)).statusCode).toBe(401);
  });

  it("keeps a station signed in across a long period", async () => {
    const cookie = await sessionCookie("front-desk");
    time += 80 * 24 * HOUR;
    expect((await get("/api/me", cookie)).statusCode).toBe(200);
  });

  it("expires a station session after ninety days", async () => {
    const cookie = await sessionCookie("front-desk");
    time += 91 * 24 * HOUR;
    expect((await get("/api/me", cookie)).statusCode).toBe(401);
  });

  it("expires an admin session after twelve hours", async () => {
    const cookie = await sessionCookie("pat");
    time += 11 * HOUR;
    expect((await get("/api/me", cookie)).statusCode).toBe(200);
    time += 2 * HOUR;
    expect((await get("/api/me", cookie)).statusCode).toBe(401);
  });

  it("forbids station roles from admin routes", async () => {
    const response = await get("/api/admin/accounts", await sessionCookie("front-desk"));
    expect(response.statusCode).toBe(403);
  });

  it("requires a session for admin routes", async () => {
    expect((await get("/api/admin/accounts")).statusCode).toBe(401);
  });

  it("lists accounts for an admin without exposing password hashes", async () => {
    const response = await get("/api/admin/accounts", await sessionCookie("pat"));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { username: "front-desk", role: "front_desk" },
      { username: "pat", role: "admin" },
    ]);
  });
});
