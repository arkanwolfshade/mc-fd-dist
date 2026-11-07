import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts.js";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";
import { PASSWORD, signIn } from "./test-support.js";

const DATE = "2026-11-07";
const DETAILS = {
  number: 1,
  familySize: 5,
  arrivalMethod: "East",
  seniorBox: true,
  cheese: false,
  other: "",
};

describe("shift and card routes", () => {
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

  function request(method: "GET" | "POST" | "PATCH", url: string, cookie: string, payload?: object) {
    return app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  async function openShift(): Promise<number> {
    const response = await request("POST", "/api/shifts", frontDesk, { date: DATE });
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  async function addCard(shiftId: number, overrides: object = {}) {
    const response = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
      clientId: crypto.randomUUID(),
      ...DETAILS,
      ...overrides,
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  function patchCard(id: number, cookie: string, payload: object) {
    return request("PATCH", `/api/cards/${id}`, cookie, payload);
  }

  describe("shifts", () => {
    it("requires a session to open a shift", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/shifts",
        payload: { date: DATE },
      });
      expect(response.statusCode).toBe(401);
    });

    it("allows only one shift per date", async () => {
      await openShift();
      const response = await request("POST", "/api/shifts", distribution, { date: DATE });
      expect(response.statusCode).toBe(409);
    });

    it("rejects an invalid date", async () => {
      const response = await request("POST", "/api/shifts", frontDesk, { date: "next tuesday" });
      expect(response.statusCode).toBe(400);
    });

    it("returns the shift and its cards for a date", async () => {
      const shiftId = await openShift();
      await addCard(shiftId);
      const response = await request("GET", `/api/shifts?date=${DATE}`, distribution);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: shiftId,
        date: DATE,
        status: "open",
        cards: [{ number: 1, familySize: 5 }],
      });
    });

    it("returns 404 when a date has no shift", async () => {
      const response = await request("GET", `/api/shifts?date=${DATE}`, frontDesk);
      expect(response.statusCode).toBe(404);
    });
  });

  describe("entering a card", () => {
    it("creates a card at the entered status with TEFAP bags calculated", async () => {
      const card = await addCard(await openShift());
      expect(card).toMatchObject({
        number: 1,
        familySize: 5,
        arrivalMethod: "East",
        seniorBox: true,
        cheese: false,
        status: "entered",
        tefapBags: 2,
        tefapOverride: false,
        revision: 1,
      });
    });

    it("keeps a TEFAP override when one is given", async () => {
      const card = await addCard(await openShift(), { tefapBags: 0 });
      expect(card).toMatchObject({ tefapBags: 0, tefapOverride: true });
    });

    it("rejects a duplicate card number within a shift", async () => {
      const shiftId = await openShift();
      await addCard(shiftId);
      const response = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
        clientId: crypto.randomUUID(),
        ...DETAILS,
      });
      expect(response.statusCode).toBe(409);
    });

    it("allows the same card number on a different shift", async () => {
      await addCard(await openShift());
      const other = await request("POST", "/api/shifts", frontDesk, { date: "2026-11-14" });
      const card = await addCard(other.json().id);
      expect(card.number).toBe(1);
    });

    it("treats a repeated clientId as a safe retry", async () => {
      const shiftId = await openShift();
      const payload = { clientId: crypto.randomUUID(), ...DETAILS };
      const first = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, payload);
      const retry = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, payload);
      expect(retry.statusCode).toBe(200);
      expect(retry.json().id).toBe(first.json().id);
      expect(db.prepare("SELECT COUNT(*) AS n FROM card").get()).toEqual({ n: 1 });
    });

    it("stops distribution from entering a card", async () => {
      const shiftId = await openShift();
      const response = await request("POST", `/api/shifts/${shiftId}/cards`, distribution, {
        clientId: crypto.randomUUID(),
        ...DETAILS,
      });
      expect(response.statusCode).toBe(403);
    });

    it.each([
      ["a family of zero", { familySize: 0 }],
      ["a card number of zero", { number: 0 }],
      ["an unknown arrival method", { arrivalMethod: "Helicopter" }],
      ["a partner as an arrival method", { arrivalMethod: "DD" }],
    ])("rejects %s", async (_name, overrides) => {
      const shiftId = await openShift();
      const response = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
        clientId: crypto.randomUUID(),
        ...DETAILS,
        ...overrides,
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects a card on a closed shift", async () => {
      const shiftId = await openShift();
      db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(shiftId);
      const response = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
        clientId: crypto.randomUUID(),
        ...DETAILS,
      });
      expect(response.statusCode).toBe(409);
    });
  });

  describe("updating a card", () => {
    it("lets distribution correct details and increases the revision", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, { revision: 1, familySize: 9 });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ familySize: 9, tefapBags: 3, revision: 2 });
    });

    it("does not recalculate TEFAP bags over an override", async () => {
      const card = await addCard(await openShift(), { tefapBags: 0 });
      const response = await patchCard(card.id, distribution, { revision: 1, familySize: 9 });
      expect(response.json()).toMatchObject({ tefapBags: 0, tefapOverride: true });
    });

    it("rejects a stale write and returns the current card", async () => {
      const card = await addCard(await openShift());
      await patchCard(card.id, distribution, { revision: 1, familySize: 2 });
      const stale = await patchCard(card.id, frontDesk, { revision: 1, familySize: 3 });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().card).toMatchObject({ familySize: 2, revision: 2 });
    });

    it("requires a revision", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, { familySize: 2 });
      expect(response.statusCode).toBe(400);
    });

    it("moves a card through the full path", async () => {
      const card = await addCard(await openShift());
      const called = await patchCard(card.id, frontDesk, { revision: 1, status: "called" });
      const confirmed = await patchCard(card.id, distribution, { revision: 2, status: "confirmed" });
      const done = await patchCard(card.id, distribution, { revision: 3, status: "distributed" });
      expect(called.json().status).toBe("called");
      expect(confirmed.json().status).toBe("confirmed");
      expect(done.json().status).toBe("distributed");
    });

    it("rejects a status change the role may not make", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, { revision: 1, status: "called" });
      expect(response.statusCode).toBe(403);
    });

    it("rejects a skipped step even for an admin", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, admin, { revision: 1, status: "distributed" });
      expect(response.statusCode).toBe(403);
    });

    it("lets distribution record up to three load weights", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, {
        revision: 1,
        loads: [12.5, 8, null],
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ loads: [12.5, 8, null], totalWeight: 20.5 });
    });

    it("stops the front desk recording weights", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, frontDesk, { revision: 1, loads: [1, null, null] });
      expect(response.statusCode).toBe(403);
    });

    it.each([
      ["a negative weight", [-1, null, null]],
      ["more than three loads", [1, 2, 3, 4]],
    ])("rejects %s", async (_name, loads) => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, { revision: 1, loads });
      expect(response.statusCode).toBe(400);
    });

    it("returns 404 for an unknown card", async () => {
      const response = await patchCard(999, distribution, { revision: 1, familySize: 2 });
      expect(response.statusCode).toBe(404);
    });

    it("rejects a change on a closed shift", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId);
      db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(shiftId);
      const response = await patchCard(card.id, distribution, { revision: 1, familySize: 2 });
      expect(response.statusCode).toBe(409);
    });

    it("rejects changing a card number to one already used", async () => {
      const shiftId = await openShift();
      await addCard(shiftId);
      const second = await addCard(shiftId, { number: 2 });
      const response = await patchCard(second.id, frontDesk, { revision: 1, number: 1 });
      expect(response.statusCode).toBe(409);
    });
  });

  describe("live updates", () => {
    it("requires a session to connect", async () => {
      await app.ready();
      await expect(app.injectWS("/api/live")).rejects.toThrow();
    });

    it("sends a new card to a connected station straight away", async () => {
      const shiftId = await openShift();
      const socket = await app.injectWS("/api/live", { headers: { cookie: distribution } });
      const message = new Promise<string>((resolve) => {
        socket.once("message", (data) => resolve(data.toString()));
      });

      const card = await addCard(shiftId);

      expect(JSON.parse(await message)).toEqual({ type: "card", card });
      socket.terminate();
    });

    it("sends a card update to a connected station", async () => {
      const card = await addCard(await openShift());
      const socket = await app.injectWS("/api/live", { headers: { cookie: frontDesk } });
      const message = new Promise<string>((resolve) => {
        socket.once("message", (data) => resolve(data.toString()));
      });

      await patchCard(card.id, distribution, { revision: 1, familySize: 2 });

      expect(JSON.parse(await message)).toMatchObject({
        type: "card",
        card: { id: card.id, familySize: 2, revision: 2 },
      });
      socket.terminate();
    });

    it("does not broadcast a safe retry again", async () => {
      const shiftId = await openShift();
      const payload = { clientId: crypto.randomUUID(), ...DETAILS };
      await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, payload);

      const socket = await app.injectWS("/api/live", { headers: { cookie: distribution } });
      const messages: string[] = [];
      socket.on("message", (data) => messages.push(data.toString()));

      await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, payload);
      await addCard(shiftId, { number: 2 });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0] ?? "{}").card.number).toBe(2);
      socket.terminate();
    });
  });
});
