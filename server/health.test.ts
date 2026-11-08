import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";

describe("health check", () => {
  let db: Database;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    app = await buildApp({ db, cookieSecure: true });
  });

  afterEach(async () => {
    await app.close();
    if (db.open) db.close();
  });

  it("answers without signing in, and says nothing else about the server", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("reports a failure when the database cannot be read", async () => {
    db.close();
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });
  });
});
