import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts.js";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";
import { messageText, PASSWORD, signIn } from "./test-support.js";

const NEW_PASSWORD = "a-new-password-here";

describe("admin and closing routes", () => {
  let db: Database;
  let app: FastifyInstance;
  let frontDesk: string;
  let distribution: string;
  let admin: string;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });
    await createAccount(db, { username: "distribution", password: PASSWORD, role: "distribution" });
    await createAccount(db, { username: "pat", password: PASSWORD, role: "admin" });
    app = await buildApp({ db, cookieSecure: true });
    frontDesk = await signIn(app, "front-desk");
    distribution = await signIn(app, "distribution");
    admin = await signIn(app, "pat");
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  function request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    cookie: string,
    payload?: object,
  ) {
    return app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  async function openShift(date: string): Promise<number> {
    const response = await request("POST", "/api/shifts", frontDesk, { date });
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  async function addCard(shiftId: number, overrides: object = {}) {
    const response = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
      clientId: crypto.randomUUID(),
      number: 1,
      familySize: 5,
      arrivalMethod: "East",
      ...overrides,
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  describe("opening a shift", () => {
    it("tells connected stations that a shift opened", async () => {
      const socket = await app.injectWS("/api/live", { headers: { cookie: distribution } });
      const message = new Promise<string>((resolve) => {
        socket.once("message", (data) => resolve(messageText(data)));
      });

      const shiftId = await openShift("2026-11-07");

      expect(JSON.parse(await message)).toMatchObject({
        type: "shift",
        shift: { id: shiftId, status: "open" },
      });
      socket.terminate();
    });
  });

  describe("closing a shift", () => {
    it("lets distribution close a shift, which blocks further card entry", async () => {
      const shiftId = await openShift("2026-11-07");
      const response = await request("POST", `/api/shifts/${shiftId}/close`, distribution);
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("closed");

      const blocked = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
        clientId: crypto.randomUUID(),
        number: 1,
        familySize: 5,
        arrivalMethod: "East",
      });
      expect(blocked.statusCode).toBe(409);
    });

    it("lets an admin close a shift", async () => {
      const shiftId = await openShift("2026-11-07");
      const response = await request("POST", `/api/shifts/${shiftId}/close`, admin);
      expect(response.statusCode).toBe(200);
    });

    it("stops the front desk closing a shift", async () => {
      const shiftId = await openShift("2026-11-07");
      const response = await request("POST", `/api/shifts/${shiftId}/close`, frontDesk);
      expect(response.statusCode).toBe(403);
    });

    it("lets an admin reopen a closed shift", async () => {
      const shiftId = await openShift("2026-11-07");
      await request("POST", `/api/shifts/${shiftId}/close`, admin);
      const response = await request("POST", `/api/admin/shifts/${shiftId}/reopen`, admin);
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("open");
    });

    it("stops distribution reopening a shift", async () => {
      const shiftId = await openShift("2026-11-07");
      await request("POST", `/api/shifts/${shiftId}/close`, distribution);
      const response = await request("POST", `/api/admin/shifts/${shiftId}/reopen`, distribution);
      expect(response.statusCode).toBe(403);
    });

    it("returns 404 for an unknown shift", async () => {
      const response = await request("POST", "/api/shifts/999/close", admin);
      expect(response.statusCode).toBe(404);
    });

    it("tells connected stations that a shift closed", async () => {
      const shiftId = await openShift("2026-11-07");
      const socket = await app.injectWS("/api/live", { headers: { cookie: frontDesk } });
      const message = new Promise<string>((resolve) => {
        socket.once("message", (data) => resolve(messageText(data)));
      });

      await request("POST", `/api/shifts/${shiftId}/close`, distribution);

      expect(JSON.parse(await message)).toMatchObject({
        type: "shift",
        shift: { id: shiftId, status: "closed" },
      });
      socket.terminate();
    });
  });

  describe("reports", () => {
    it("is limited to admins", async () => {
      const url = "/api/admin/reports/totals?from=2026-11-01&to=2026-11-30";
      expect((await request("GET", url, distribution)).statusCode).toBe(403);
    });

    it("rejects a range that ends before it starts", async () => {
      const url = "/api/admin/reports/totals?from=2026-11-30&to=2026-11-01";
      expect((await request("GET", url, admin)).statusCode).toBe(400);
    });

    it("returns each shift in the range and combined totals", async () => {
      const first = await openShift("2026-11-07");
      const second = await openShift("2026-11-14");
      const outside = await openShift("2026-12-01");
      await addCard(first, { tefapBags: 2 });
      await addCard(second, { tefapBags: 1 });
      await addCard(second, { number: 2, tefapBags: 3 });
      await addCard(outside, { tefapBags: 9 });

      const response = await request(
        "GET",
        "/api/admin/reports/totals?from=2026-11-01&to=2026-11-30",
        admin,
      );
      expect(response.statusCode).toBe(200);
      const report = response.json();
      expect(report.shifts.map((s: { date: string }) => s.date)).toEqual([
        "2026-11-07",
        "2026-11-14",
      ]);
      expect(report.shifts[0].summary.families.total).toBe(1);
      expect(report.totals).toMatchObject({ families: { total: 3 }, tefapBags: 6 });
    });

    it("exports shift totals as a CSV attachment", async () => {
      const shiftId = await openShift("2026-11-07");
      await addCard(shiftId, { tefapBags: 2 });
      const response = await request(
        "GET",
        "/api/admin/reports/shifts.csv?from=2026-11-01&to=2026-11-30",
        admin,
      );
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.headers["content-disposition"]).toContain("attachment");
      const [header, row] = response.body.split("\r\n");
      expect(header).toContain("date,status,families_total");
      expect(row).toContain("2026-11-07,open,1");
    });

    it("exports families who left without food in their own column", async () => {
      const shiftId = await openShift("2026-11-07");
      await addCard(shiftId);
      await addCard(shiftId, { number: 2 });
      db.prepare("UPDATE card SET status = 'left' WHERE number = 2").run();
      const response = await request(
        "GET",
        "/api/admin/reports/shifts.csv?from=2026-11-01&to=2026-11-30",
        admin,
      );
      const [header, row] = response.body.split("\r\n");
      expect(header).toContain(
        "families_total,families_cards,families_partners,families_left,weight_total",
      );
      expect(row).toMatch(/^2026-11-07,open,1,1,0,1,/);
    });

    it("exports cards as a CSV and guards free text against formulas", async () => {
      const shiftId = await openShift("2026-11-07");
      await addCard(shiftId, { other: "=HYPERLINK(1)" });
      const response = await request(
        "GET",
        "/api/admin/reports/cards.csv?from=2026-11-01&to=2026-11-30",
        admin,
      );
      expect(response.statusCode).toBe(200);
      expect(response.body.split("\r\n")[0]).toContain("date,card_number,family_size");
      expect(response.body).toContain("'=HYPERLINK(1)");
    });

    it("limits CSV exports to admins", async () => {
      const url = "/api/admin/reports/cards.csv?from=2026-11-01&to=2026-11-30";
      expect((await request("GET", url, frontDesk)).statusCode).toBe(403);
    });
  });

  describe("accounts", () => {
    function signInAs(username: string, password: string) {
      return app.inject({ method: "POST", url: "/api/login", payload: { username, password } });
    }

    it("changes a role password, so the old one stops working", async () => {
      const response = await request("PUT", "/api/admin/accounts/front-desk/password", admin, {
        password: NEW_PASSWORD,
      });
      expect(response.statusCode).toBe(204);
      expect((await signInAs("front-desk", PASSWORD)).statusCode).toBe(401);
      expect((await signInAs("front-desk", NEW_PASSWORD)).statusCode).toBe(200);
    });

    it("ends existing sessions when a role password changes", async () => {
      await request("PUT", "/api/admin/accounts/front-desk/password", admin, {
        password: NEW_PASSWORD,
      });
      expect((await request("GET", "/api/me", frontDesk)).statusCode).toBe(401);
    });

    it("leaves other accounts signed in when a role password changes", async () => {
      await request("PUT", "/api/admin/accounts/front-desk/password", admin, {
        password: NEW_PASSWORD,
      });
      expect((await request("GET", "/api/me", distribution)).statusCode).toBe(200);
    });

    it("stops sending live updates to a station whose password changed", async () => {
      const shiftId = await openShift("2026-11-07");
      const socket = await app.injectWS("/api/live", { headers: { cookie: frontDesk } });
      const messages: string[] = [];
      socket.on("message", (data) => messages.push(messageText(data)));
      const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));

      await request("PUT", "/api/admin/accounts/front-desk/password", admin, {
        password: NEW_PASSWORD,
      });
      await request("POST", `/api/shifts/${shiftId}/close`, admin);
      await closed;

      expect(messages).toEqual([]);
    });

    it("disconnects a station straight away when its password changes", async () => {
      const socket = await app.injectWS("/api/live", { headers: { cookie: frontDesk } });
      const closed = new Promise<number>((resolve) => socket.once("close", resolve));

      await request("PUT", "/api/admin/accounts/front-desk/password", admin, {
        password: NEW_PASSWORD,
      });

      expect(await closed).toBe(4401);
    });

    it("rejects a short password", async () => {
      const response = await request("PUT", "/api/admin/accounts/front-desk/password", admin, {
        password: "short",
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 404 when changing the password of an unknown account", async () => {
      const response = await request("PUT", "/api/admin/accounts/nobody/password", admin, {
        password: NEW_PASSWORD,
      });
      expect(response.statusCode).toBe(404);
    });

    it("stops a station changing passwords", async () => {
      const response = await request("PUT", "/api/admin/accounts/pat/password", distribution, {
        password: NEW_PASSWORD,
      });
      expect(response.statusCode).toBe(403);
    });

    it("adds an admin account", async () => {
      const response = await request("POST", "/api/admin/accounts", admin, {
        username: "sam",
        password: NEW_PASSWORD,
      });
      expect(response.statusCode).toBe(201);
      const created = await signInAs("sam", NEW_PASSWORD);
      expect(created.json()).toEqual({ username: "sam", role: "admin" });
    });

    it("rejects a duplicate account", async () => {
      const response = await request("POST", "/api/admin/accounts", admin, {
        username: "PAT",
        password: NEW_PASSWORD,
      });
      expect(response.statusCode).toBe(409);
    });

    it("removes another admin and ends their sessions", async () => {
      await createAccount(db, { username: "sam", password: PASSWORD, role: "admin" });
      const sam = await signIn(app, "sam");
      const response = await request("DELETE", "/api/admin/accounts/sam", admin);
      expect(response.statusCode).toBe(204);
      expect((await request("GET", "/api/me", sam)).statusCode).toBe(401);
    });

    it("stops an admin removing their own account", async () => {
      const response = await request("DELETE", "/api/admin/accounts/pat", admin);
      expect(response.statusCode).toBe(409);
    });

    it("stops removal of a shared station login", async () => {
      const response = await request("DELETE", "/api/admin/accounts/front-desk", admin);
      expect(response.statusCode).toBe(409);
    });
  });

  describe("audit log", () => {
    async function auditEntries() {
      const response = await request("GET", "/api/admin/audit", admin);
      expect(response.statusCode).toBe(200);
      return response.json<{ actor: string; action: string; detail: string }[]>();
    }

    it("is limited to admins", async () => {
      expect((await request("GET", "/api/admin/audit", distribution)).statusCode).toBe(403);
    });

    it("records which station made each card change, newest first", async () => {
      const shiftId = await openShift("2026-11-07");
      const card = await addCard(shiftId);
      await request("PATCH" as "POST", `/api/cards/${card.id}`, distribution, {
        revision: 1,
        familySize: 2,
      });

      const entries = await auditEntries();
      expect(entries.map((e) => [e.actor, e.action]).slice(0, 3)).toEqual([
        ["distribution", "card.update"],
        ["front-desk", "card.create"],
        ["front-desk", "shift.open"],
      ]);
      expect(entries[0]?.detail).toContain("familySize");
    });

    it("records batches and shift closing", async () => {
      const shiftId = await openShift("2026-11-07");
      await request("POST", `/api/shifts/${shiftId}/returned-batches`, distribution, {
        clientId: crypto.randomUUID(),
        weight: 3,
      });
      await request("POST", `/api/shifts/${shiftId}/close`, distribution);
      const actions = (await auditEntries()).map((e) => e.action);
      expect(actions).toEqual(expect.arrayContaining(["returned.create", "shift.close"]));
    });

    it("records a password change without the password", async () => {
      await request("PUT", "/api/admin/accounts/front-desk/password", admin, {
        password: NEW_PASSWORD,
      });
      const [entry] = await auditEntries();
      expect(entry?.action).toBe("account.password");
      expect(entry?.actor).toBe("pat");
      expect(JSON.stringify(entry)).not.toContain(NEW_PASSWORD);
    });

    it("does not record a rejected change", async () => {
      await request("POST", "/api/shifts/999/close", admin);
      expect(await auditEntries()).toEqual([]);
    });
  });
});
