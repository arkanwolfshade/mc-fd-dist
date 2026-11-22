import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "./accounts.js";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";
import { canChangeStatus } from "./rules.js";
import { createSession } from "./sessions.js";
import { messageText } from "./test-support.js";

const DATE = "2026-11-07";

type Method = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";

// The wall display shows the queue, and nothing else about a Family. See ADR 0033.
describe("the queue display", () => {
  let db: Database;
  let app: FastifyInstance;
  let frontDesk: string;
  let distribution: string;
  let admin: string;
  let wall: string;

  // Signing in is tested with the other routes. Here a session is made straight away, because
  // hashing a password for every account in every test would make this file slow.
  function sessionFor(username: string, role: Role): string {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO account (username, password_hash, role) VALUES (?, 'unused', ?)")
      .run(username, role);
    const { token } = createSession(
      db,
      { id: Number(lastInsertRowid), username, role },
      Date.now(),
    );
    return `session=${token}`;
  }

  beforeEach(async () => {
    db = openDatabase(":memory:");
    app = await buildApp({ db, cookieSecure: true });
    await app.ready();
    frontDesk = sessionFor("front-desk", "front_desk");
    distribution = sessionFor("distribution", "distribution");
    admin = sessionFor("pat", "admin");
    wall = sessionFor("wall", "display");
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  function request(method: Method, url: string, cookie: string, payload?: object) {
    return app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  async function openShift(): Promise<number> {
    const response = await request("POST", "/api/shifts", frontDesk, { date: DATE });
    return response.json().id;
  }

  // A walk-in with every private detail filled in, so any that leaks shows up.
  async function addCard(shiftId: number, number: number) {
    const response = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
      clientId: crypto.randomUUID(),
      number,
      familySize: 5,
      arrivalMethod: "East",
      seniorBox: true,
      cheese: false,
      other: "allergic to peanuts",
      intakeInitials: "AB",
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  async function move(card: { id: number; revision: number }, cookie: string, status: string) {
    const response = await request("PATCH", `/api/cards/${card.id}`, cookie, {
      revision: card.revision,
      status,
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  function nextMessage(socket: Awaited<ReturnType<FastifyInstance["injectWS"]>>) {
    return new Promise<unknown>((resolve) => {
      socket.once("message", (data) => resolve(JSON.parse(messageText(data))));
    });
  }

  function shown(card: { id: number; revision: number }, fields: object) {
    return {
      id: card.id,
      familySize: 5,
      arrivalMethod: "East",
      seniorBox: true,
      cheese: false,
      tefapBags: 2,
      ...fields,
    };
  }

  describe("what it can read", () => {
    it("lists the families in the queue, in the order they were called, and nothing else about them", async () => {
      const shiftId = await openShift();
      const first = await addCard(shiftId, 1);
      const second = await addCard(shiftId, 2);
      await addCard(shiftId, 3); // not yet called
      const partner = await request("POST", `/api/shifts/${shiftId}/cards`, distribution, {
        clientId: crypto.randomUUID(),
        number: 50,
        familySize: 4,
        arrivalMethod: "DD",
        seniorBox: false,
        cheese: false,
        loads: [10],
      });
      expect(partner.statusCode).toBe(201);

      const calledSecond = await move(second, frontDesk, "called");
      const calledFirst = await move(first, frontDesk, "called");
      const confirmedFirst = await move(calledFirst, distribution, "confirmed");

      const response = await request("GET", `/api/display?date=${DATE}`, wall);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: shiftId,
        date: DATE,
        status: "open",
        cards: [
          shown(second, {
            number: 2,
            status: "called",
            calledOrder: 1,
            revision: calledSecond.revision,
          }),
          shown(first, {
            number: 1,
            status: "confirmed",
            calledOrder: 2,
            revision: confirmedFirst.revision,
          }),
        ],
      });
    });

    it("says so when there is no shift for the date", async () => {
      const response = await request("GET", `/api/display?date=${DATE}`, wall);
      expect(response.statusCode).toBe(404);
    });

    it("is read by the display only, not by a station", async () => {
      await openShift();
      for (const station of [frontDesk, distribution, admin]) {
        const response = await request("GET", `/api/display?date=${DATE}`, station);
        expect(response.statusCode).toBe(403);
      }
    });

    it("needs a session", async () => {
      const response = await app.inject({ method: "GET", url: `/api/display?date=${DATE}` });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("what it hears live", () => {
    it("gets a card entering the queue with only what it shows", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId, 7);
      const socket = await app.injectWS("/api/live", { headers: { cookie: wall } });
      const message = nextMessage(socket);

      const called = await move(card, frontDesk, "called");

      expect(await message).toEqual({
        type: "card",
        card: shown(card, {
          number: 7,
          status: "called",
          calledOrder: 1,
          revision: called.revision,
        }),
      });
      socket.terminate();
    });

    it("is told to drop a card that leaves the queue, without being sent the card", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId, 7);
      const called = await move(card, frontDesk, "called");
      const socket = await app.injectWS("/api/live", { headers: { cookie: wall } });
      const message = nextMessage(socket);

      await move(called, frontDesk, "entered");

      expect(await message).toEqual({ type: "card-deleted", shiftId, cardId: card.id });
      socket.terminate();
    });

    it("is never sent initials, notes or weights, whatever the change", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId, 7);
      const socket = await app.injectWS("/api/live", { headers: { cookie: wall } });
      const heard: string[] = [];
      socket.on("message", (data) => heard.push(messageText(data)));

      const called = await move(card, frontDesk, "called");
      const confirmed = await move(called, distribution, "confirmed");
      await request("PATCH", `/api/cards/${card.id}`, distribution, {
        revision: confirmed.revision,
        extrasAdded: true,
        extrasNote: "bakery bread",
        loads: [12.5, 8],
      });
      await request("POST", `/api/shifts/${shiftId}/returned-batches`, distribution, {
        clientId: crypto.randomUUID(),
        weight: 3.5,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(heard.length).toBeGreaterThan(0);
      const everything = heard.join("\n");
      for (const secret of ["AB", "peanuts", "bakery", "12.5", "returned"]) {
        expect(everything).not.toContain(secret);
      }
      socket.terminate();
    });

    it("hears when the shift opens", async () => {
      const socket = await app.injectWS("/api/live", { headers: { cookie: wall } });
      const message = nextMessage(socket);

      const shiftId = await openShift();

      expect(await message).toEqual({
        type: "shift",
        shift: { id: shiftId, date: DATE, status: "open" },
      });
      socket.terminate();
    });

    it("leaves the stations hearing everything, as before", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId, 7);
      const socket = await app.injectWS("/api/live", { headers: { cookie: distribution } });
      const message = nextMessage(socket);

      await move(card, frontDesk, "called");

      expect(await message).toMatchObject({
        type: "card",
        card: { intakeInitials: "AB", other: "allergic to peanuts" },
      });
      socket.terminate();
    });
  });

  describe("what it cannot do", () => {
    // Every route the app has, and whether the display may use it. A new route must be added to
    // one list (the count below fails until it is), so each is decided on purpose.
    const FORBIDDEN: [Method, string][] = [
      ["POST", "/api/shifts"],
      ["GET", `/api/shifts?date=${DATE}`],
      ["POST", "/api/shifts/1/cards"],
      ["POST", "/api/shifts/1/close"],
      ["POST", "/api/shifts/1/returned-batches"],
      ["PATCH", "/api/cards/1"],
      ["DELETE", "/api/cards/1"],
      ["DELETE", "/api/returned-batches/1"],
      ["POST", "/api/admin/shifts/1/reopen"],
      ["GET", "/api/admin/reports/totals?from=2026-11-01&to=2026-11-30"],
      ["GET", "/api/admin/reports/shifts.csv?from=2026-11-01&to=2026-11-30"],
      ["GET", "/api/admin/reports/cards.csv?from=2026-11-01&to=2026-11-30"],
      ["GET", "/api/admin/accounts"],
      ["POST", "/api/admin/accounts"],
      ["DELETE", "/api/admin/accounts/front-desk"],
      ["PUT", "/api/admin/accounts/front-desk/password"],
      ["GET", "/api/admin/audit"],
    ];
    const ALLOWED: [Method, string][] = [
      ["POST", "/api/login"],
      ["POST", "/api/logout"],
      ["GET", "/api/live"],
      ["GET", "/api/me"],
      ["GET", "/api/health"],
      ["GET", `/api/display?date=${DATE}`],
    ];

    it("is refused every route that reads or changes anything else", async () => {
      await openShift();
      for (const [method, url] of FORBIDDEN) {
        const response = await request(method, url, wall, {});
        expect(response.statusCode, `${method} ${url}`).toBe(403);
      }
    });

    it("is refused a route nobody has written yet", async () => {
      const response = await request("GET", "/api/anything-added-later", wall);
      expect(response.statusCode).toBe(403);
      const station = await request("GET", "/api/anything-added-later", frontDesk);
      expect(station.statusCode).toBe(404);
    });

    it("can still use the routes it needs", async () => {
      const me = await request("GET", "/api/me", wall);
      expect(me.json()).toEqual({ username: "wall", role: "display" });
      expect((await request("GET", "/api/health", wall)).statusCode).toBe(200);
      const socket = await app.injectWS("/api/live", { headers: { cookie: wall } });
      socket.terminate();
      expect((await request("POST", "/api/logout", wall)).statusCode).toBe(204);
    });

    it("has every route in the lists above", async () => {
      await app.ready();
      const methods = [...app.printRoutes({ commonPrefix: false }).matchAll(/\(([A-Z, ]+)\)/g)]
        .flatMap((match) => (match[1] as string).split(", "))
        .filter((method) => method !== "HEAD" && method !== "OPTIONS");
      expect(methods.length, "a route was added: decide whether the display may use it").toBe(
        FORBIDDEN.length + ALLOWED.length,
      );
    });

    it("cannot change a card's status, even if a route let it through", () => {
      expect(canChangeStatus("display", "entered", "called")).toBe(false);
      expect(canChangeStatus("display", "called", "confirmed")).toBe(false);
      expect(canChangeStatus("display", "called", "left")).toBe(false);
    });
  });
});
