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

  it("sends security headers with every response", async () => {
    for (const url of ["/", "/api/health", "/api/nothing-here"]) {
      const { headers } = await app.inject({
        method: "GET",
        url,
        headers: { host: "shifts.test" },
      });
      expect(headers["content-security-policy"]).toBe(
        "default-src 'self'; connect-src 'self' wss://shifts.test; object-src 'none'; " +
          "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      );
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("no-referrer");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["strict-transport-security"]).toBe("max-age=31536000");
      expect(headers["permissions-policy"]).toBe(
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      );
      expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
      expect(headers["cross-origin-embedder-policy"]).toBe("require-corp");
      expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
    }
  });

  // Stations can be shared devices, so shift data must not be kept in any cache.
  it("marks API responses as never to be stored", async () => {
    for (const url of ["/api/health", "/api/nothing-here", "/api/me"]) {
      const { headers } = await app.inject({ method: "GET", url });
      expect(headers["cache-control"]).toBe("no-store");
    }
  });

  it("leaves the app's own files cacheable", async () => {
    const { headers } = await app.inject({ method: "GET", url: "/" });
    expect(headers["cache-control"]).not.toBe("no-store");
  });

  it("allows an unencrypted live connection only when running without HTTPS", async () => {
    const local = await buildApp({ db, cookieSecure: false, clientDir: dir });
    const { headers } = await local.inject({
      method: "GET",
      url: "/",
      headers: { host: "127.0.0.1:3000" },
    });
    await local.close();
    expect(headers["content-security-policy"]).toContain("connect-src 'self' ws://127.0.0.1:3000;");
    expect(headers["strict-transport-security"]).toBeUndefined();
  });

  it("keeps a JSON 404 for an unknown API route", async () => {
    const response = await app.inject({ method: "GET", url: "/api/nothing-here" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });
});
