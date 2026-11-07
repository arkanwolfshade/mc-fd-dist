import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Database } from "better-sqlite3";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";

describe("serving the client", () => {
  let dir: string;
  let db: Database;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "mc-fd-dist-client-"));
    writeFileSync(join(dir, "index.html"), "<title>Shift tracker</title>");
    db = openDatabase(":memory:");
    app = await buildApp({ db, cookieSecure: true, clientDir: dir });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves the app at the root", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Shift tracker");
  });

  it("keeps a JSON 404 for an unknown API route", async () => {
    const response = await app.inject({ method: "GET", url: "/api/nothing-here" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });
});
