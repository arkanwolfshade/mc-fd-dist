import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts.js";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";
import { messageText, PASSWORD, signIn } from "./test-support.js";

const DATE = "2026-11-07";
const DETAILS = {
  number: 1,
  familySize: 5,
  arrivalMethod: "East",
  seniorBox: true,
  cheese: false,
  other: "",
  intakeInitials: "AB",
};

// A Door Dash Family, entered by Distribution at the end of a shift. See ADR 0023.
const PARTNER_DETAILS = {
  number: 50,
  familySize: 6,
  arrivalMethod: "DD",
  seniorBox: false,
  cheese: false,
  loads: [10, 8, null],
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

  function request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    cookie: string,
    payload?: object,
  ) {
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

  // Each family is numbered as it is called, so the queue is in the order families were called,
  // not the order of their ticket numbers. See ADR 0032.
  describe("call order", () => {
    interface Moved {
      id: number;
      revision: number;
      calledOrder: number | null;
    }

    async function move(card: Moved, cookie: string, status: string): Promise<Moved> {
      const response = await patchCard(card.id, cookie, { revision: card.revision, status });
      expect(response.statusCode).toBe(200);
      return response.json();
    }

    it("numbers families in the order they are called, not by their card numbers", async () => {
      const shiftId = await openShift();
      const one = await addCard(shiftId, { number: 1 });
      const two = await addCard(shiftId, { number: 2 });
      const three = await addCard(shiftId, { number: 3 });
      expect(three.calledOrder).toBeNull();

      const calledThree = await move(three, frontDesk, "called");
      const calledOne = await move(one, frontDesk, "called");
      const calledTwo = await move(two, frontDesk, "called");

      expect([calledThree, calledOne, calledTwo].map((card) => card.calledOrder)).toEqual([
        1, 2, 3,
      ]);
    });

    it("keeps a family's place when the call is confirmed, and when that is undone", async () => {
      const shiftId = await openShift();
      const first = await addCard(shiftId, { number: 1 });
      const second = await addCard(shiftId, { number: 2 });
      const calledFirst = await move(first, frontDesk, "called");
      await move(second, frontDesk, "called");

      const confirmed = await move(calledFirst, distribution, "confirmed");
      const backToCalled = await move(confirmed, distribution, "called");

      expect(confirmed.calledOrder).toBe(1);
      expect(backToCalled.calledOrder).toBe(1);
    });

    it("forgets the place when the call is undone, and a second call goes to the back", async () => {
      const shiftId = await openShift();
      const first = await addCard(shiftId, { number: 1 });
      const second = await addCard(shiftId, { number: 2 });
      const calledFirst = await move(first, frontDesk, "called");
      await move(second, frontDesk, "called");

      const undone = await move(calledFirst, frontDesk, "entered");
      const calledAgain = await move(undone, frontDesk, "called");

      expect(undone.calledOrder).toBeNull();
      expect(calledAgain.calledOrder).toBe(3);
    });

    it("forgets the place when a family leaves without food, and when they come back", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId);
      const called = await move(card, frontDesk, "called");

      const left = await move(called, distribution, "left");
      const returned = await move(left, distribution, "entered");

      expect(left.calledOrder).toBeNull();
      expect(returned.calledOrder).toBeNull();
    });

    it("counts again from one in each shift", async () => {
      const today = await openShift();
      const first = await move(await addCard(today), frontDesk, "called");
      // Only one shift is open at a time (ADR 0040).
      db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(today);
      const other = await request("POST", "/api/shifts", frontDesk, { date: "2026-11-08" });
      const elsewhere = await addCard(other.json().id);
      const second = await move(elsewhere, frontDesk, "called");

      expect([first.calledOrder, second.calledOrder]).toEqual([1, 1]);
    });

    it("leaves other changes to a called card alone", async () => {
      const shiftId = await openShift();
      const called = await move(await addCard(shiftId), frontDesk, "called");

      const edited = await patchCard(called.id, frontDesk, {
        revision: called.revision,
        familySize: 3,
      });

      expect(edited.json().calledOrder).toBe(1);
    });
  });

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

    // One shift open at a time. See ADR 0040.
    it("refuses to open a shift while another is still open, naming its day", async () => {
      await openShift();
      const response = await request("POST", "/api/shifts", frontDesk, { date: "2026-11-08" });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe(
        "The shift of Saturday, November 7 is still open. Close it before opening another.",
      );
    });

    it("opens the next shift once the earlier one is closed", async () => {
      const shiftId = await openShift();
      db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(shiftId);
      const response = await request("POST", "/api/shifts", frontDesk, { date: "2026-11-08" });
      expect(response.statusCode).toBe(201);
    });

    it("answers an earlier shift still open when the date asked for has none", async () => {
      const shiftId = await openShift();
      const response = await request("GET", "/api/shifts?date=2026-11-08", distribution);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: shiftId, date: DATE, status: "open" });
    });

    it("does not answer an earlier shift once it is closed", async () => {
      const shiftId = await openShift();
      db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(shiftId);
      const response = await request("GET", "/api/shifts?date=2026-11-08", distribution);
      expect(response.statusCode).toBe(404);
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
      const first = await openShift();
      await addCard(first);
      db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(first);
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

    it("refuses cheese without a senior box", async () => {
      const shiftId = await openShift();
      const response = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
        clientId: crypto.randomUUID(),
        ...DETAILS,
        seniorBox: false,
        cheese: true,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("Cheese comes only with a senior box");
    });

    it("refuses a correction that leaves cheese without a senior box", async () => {
      const card = await addCard(await openShift(), { seniorBox: true, cheese: true });
      const response = await patchCard(card.id, distribution, { revision: 1, seniorBox: false });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("Cheese comes only with a senior box");
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

    it("stores the intake operator's initials in capitals", async () => {
      const card = await addCard(await openShift(), { intakeInitials: "jq" });
      expect(card.intakeInitials).toBe("JQ");
    });

    it.each([
      ["no initials", { intakeInitials: undefined }],
      ["one letter", { intakeInitials: "A" }],
      ["five letters", { intakeInitials: "ABCDE" }],
      ["a digit", { intakeInitials: "A1" }],
    ])("rejects a card with %s", async (_name, overrides) => {
      const shiftId = await openShift();
      const response = await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, {
        clientId: crypto.randomUUID(),
        ...DETAILS,
        ...overrides,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("The intake operator's initials must be 2 to 4 letters");
    });

    it("starts a walk-in card at the entered status whatever status is sent", async () => {
      const card = await addCard(await openShift(), { status: "distributed" });
      expect(card.status).toBe("entered");
    });

    it("starts a card with no extras", async () => {
      const card = await addCard(await openShift());
      expect(card).toMatchObject({ extrasAdded: false, extrasNote: "" });
    });
  });

  describe("entering a Door Dash or Helping Hands Family", () => {
    function addPartnerCard(shiftId: number, cookie: string, overrides: object = {}) {
      return request("POST", `/api/shifts/${shiftId}/cards`, cookie, {
        clientId: crypto.randomUUID(),
        ...PARTNER_DETAILS,
        ...overrides,
      });
    }

    it("lets distribution enter one, already distributed, with its cart weights", async () => {
      const response = await addPartnerCard(await openShift(), distribution, {
        extrasAdded: true,
        extrasNote: "Deli",
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        number: 50,
        arrivalMethod: "DD",
        status: "distributed",
        tefapBags: 2,
        loads: [10, 8, null],
        totalWeight: 18,
        extrasAdded: true,
        extrasNote: "Deli",
        intakeInitials: null,
      });
    });

    it("lets an admin enter one too", async () => {
      const response = await addPartnerCard(await openShift(), admin, { arrivalMethod: "HH" });
      expect(response.statusCode).toBe(201);
    });

    it("draws its number from the same card stack as walk-in Families", async () => {
      const shiftId = await openShift();
      await addCard(shiftId, { number: 50 });
      const response = await addPartnerCard(shiftId, distribution);
      expect(response.statusCode).toBe(409);
    });

    it("refuses a weight for a cart the Family does not get", async () => {
      const response = await addPartnerCard(await openShift(), distribution, {
        familySize: 3,
        loads: [5, 5, null],
      });
      expect(response.statusCode).toBe(400);
    });

    it("refuses one with a cart not weighed", async () => {
      const response = await addPartnerCard(await openShift(), distribution, {
        loads: [10, null, null],
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("Weigh cart 2, then add the partner Family");
    });

    it("refuses intake initials, which partner Families do not have", async () => {
      const response = await addPartnerCard(await openShift(), distribution, {
        intakeInitials: "AB",
      });
      expect(response.statusCode).toBe(400);
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

    it("returns to the size rule when a TEFAP override is cleared", async () => {
      const card = await addCard(await openShift(), { tefapBags: 0 });
      const response = await patchCard(card.id, distribution, {
        revision: 1,
        familySize: 9,
        tefapBags: null,
      });
      expect(response.json()).toMatchObject({ tefapBags: 3, tefapOverride: false });
    });

    it("rejects a stale write and returns the current card", async () => {
      const card = await addCard(await openShift());
      await patchCard(card.id, distribution, { revision: 1, familySize: 2 });
      const stale = await patchCard(card.id, frontDesk, { revision: 1, familySize: 3 });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().card).toMatchObject({ familySize: 2, revision: 2 });
    });

    it("logs only the changes it makes, not fields it does not accept", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, {
        revision: 1,
        familySize: 2,
        intakeInitials: "ZZ",
      });
      expect(response.statusCode).toBe(200);
      const { detail } = db
        .prepare("SELECT detail FROM audit_log WHERE action = 'card.update'")
        .get() as { detail: string };
      expect(JSON.parse(detail).changes).toEqual({ familySize: 2 });
    });

    it("requires a revision", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, { familySize: 2 });
      expect(response.statusCode).toBe(400);
    });

    it("moves a card through the full path", async () => {
      const card = await addCard(await openShift());
      const called = await patchCard(card.id, frontDesk, { revision: 1, status: "called" });
      const confirmed = await patchCard(card.id, distribution, {
        revision: 2,
        status: "confirmed",
      });
      const done = await patchCard(card.id, distribution, {
        revision: 3,
        status: "distributed",
        loads: [9, 8, null],
      });
      expect(called.json().status).toBe("called");
      expect(confirmed.json().status).toBe("confirmed");
      expect(done.json().status).toBe("distributed");
    });

    // Every cart the Family gets is weighed at more than 0 lb first. See ADR 0039.
    describe("weighing before distributing", () => {
      async function confirmedCard(overrides: object = {}) {
        const card = await addCard(await openShift(), overrides);
        await patchCard(card.id, frontDesk, { revision: 1, status: "called" });
        await patchCard(card.id, distribution, { revision: 2, status: "confirmed" });
        return card;
      }

      it("refuses to mark a Family distributed before every cart is weighed", async () => {
        const card = await confirmedCard();
        await patchCard(card.id, distribution, { revision: 3, loads: [9, null, null] });
        const response = await patchCard(card.id, distribution, {
          revision: 4,
          status: "distributed",
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe("Weigh cart 2, then mark the Family distributed");
      });

      it("names every cart still to weigh", async () => {
        const card = await confirmedCard({ familySize: 9 });
        const response = await patchCard(card.id, distribution, {
          revision: 3,
          status: "distributed",
        });
        expect(response.json().error).toBe(
          "Weigh carts 1, 2 and 3, then mark the Family distributed",
        );
      });

      it("keeps the weights of a Family already distributed", async () => {
        const card = await confirmedCard();
        await patchCard(card.id, distribution, {
          revision: 3,
          status: "distributed",
          loads: [9, 8, null],
        });
        const response = await patchCard(card.id, distribution, {
          revision: 4,
          loads: [9, null, null],
        });
        expect(response.statusCode).toBe(400);
      });

      it("lets a weight be cleared once the Family is no longer distributed", async () => {
        const card = await confirmedCard();
        const response = await patchCard(card.id, distribution, {
          revision: 3,
          loads: [9, null, null],
        });
        expect(response.statusCode).toBe(200);
      });
    });

    it("rejects a status change the role may not make", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, { revision: 1, status: "called" });
      expect(response.statusCode).toBe(403);
    });

    it("rejects a skipped step even for an admin", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, admin, {
        revision: 1,
        status: "distributed",
        loads: [9, 8, null],
      });
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

    it("refuses a weight for a cart the Family does not get", async () => {
      const card = await addCard(await openShift(), { familySize: 4 });
      const response = await patchCard(card.id, distribution, {
        revision: 1,
        loads: [12, 3, null],
      });
      expect(response.statusCode).toBe(400);
    });

    it("refuses a smaller Family while its weights fill more carts", async () => {
      const card = await addCard(await openShift(), { familySize: 6 });
      const weighed = await patchCard(card.id, distribution, { revision: 1, loads: [9, 8, null] });
      expect(weighed.statusCode).toBe(200);
      const response = await patchCard(card.id, distribution, { revision: 2, familySize: 3 });
      expect(response.statusCode).toBe(400);
    });

    it("records the extras added and what they were", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, {
        revision: 1,
        extrasAdded: true,
        extrasNote: "Meat and bakery",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ extrasAdded: true, extrasNote: "Meat and bakery" });
    });

    it("rejects an extras note longer than 200 characters", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, {
        revision: 1,
        extrasNote: "x".repeat(201),
      });
      expect(response.statusCode).toBe(400);
    });

    it("keeps a walk-in Family from becoming a partner Family", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, distribution, { revision: 1, arrivalMethod: "DD" });
      expect(response.statusCode).toBe(400);
    });

    it("stops the front desk recording weights", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, frontDesk, { revision: 1, loads: [1, null, null] });
      expect(response.statusCode).toBe(403);
    });

    it.each([
      ["a negative weight", [-1, null, null]],
      ["a weight of zero", [0, null, null]],
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

  describe("leaving without food", () => {
    it("lets distribution record that a family left, and put them back", async () => {
      const card = await addCard(await openShift());
      const left = await patchCard(card.id, distribution, { revision: 1, status: "left" });
      expect(left.statusCode).toBe(200);
      expect(left.json().status).toBe("left");

      const back = await patchCard(card.id, distribution, { revision: 2, status: "entered" });
      expect(back.json().status).toBe("entered");
    });

    it("refuses it once the family has been served", async () => {
      const card = await addCard(await openShift());
      await patchCard(card.id, frontDesk, { revision: 1, status: "called" });
      await patchCard(card.id, distribution, { revision: 2, status: "confirmed" });
      await patchCard(card.id, distribution, {
        revision: 3,
        status: "distributed",
        loads: [9, 8, null],
      });
      const response = await patchCard(card.id, distribution, { revision: 4, status: "left" });
      expect(response.statusCode).toBe(403);
    });

    it("refuses it from the front desk", async () => {
      const card = await addCard(await openShift());
      const response = await patchCard(card.id, frontDesk, { revision: 1, status: "left" });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("deleting a card", () => {
    it("lets an admin delete a card entered by mistake", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId);

      const response = await request("DELETE", `/api/cards/${card.id}`, admin);

      expect(response.statusCode).toBe(204);
      const shift = await request("GET", `/api/shifts?date=${DATE}`, admin);
      expect(shift.json().cards).toEqual([]);
    });

    it("records the deleted card's details in the activity log", async () => {
      const card = await addCard(await openShift(), { number: 7, familySize: 3 });
      await request("DELETE", `/api/cards/${card.id}`, admin);

      const entry = db
        .prepare("SELECT actor, detail FROM audit_log WHERE action = 'card.delete'")
        .get() as { actor: string; detail: string };
      expect(entry.actor).toBe("pat");
      expect(JSON.parse(entry.detail)).toMatchObject({
        card: { number: 7, familySize: 3, arrivalMethod: "East" },
      });
    });

    it("tells every station the card is gone", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId);
      const socket = await app.injectWS("/api/live", { headers: { cookie: frontDesk } });
      const message = new Promise<string>((resolve) => {
        socket.once("message", (data) => resolve(messageText(data)));
      });

      await request("DELETE", `/api/cards/${card.id}`, admin);

      expect(JSON.parse(await message)).toEqual({ type: "card-deleted", shiftId, cardId: card.id });
      socket.terminate();
    });

    it("is for admins only", async () => {
      const card = await addCard(await openShift());
      for (const station of [frontDesk, distribution]) {
        const response = await request("DELETE", `/api/cards/${card.id}`, station);
        expect(response.statusCode).toBe(403);
      }
    });

    it("refuses a card on a closed shift", async () => {
      const shiftId = await openShift();
      const card = await addCard(shiftId);
      db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(shiftId);
      const response = await request("DELETE", `/api/cards/${card.id}`, admin);
      expect(response.statusCode).toBe(409);
    });

    it("returns 404 for an unknown card", async () => {
      const response = await request("DELETE", "/api/cards/999", admin);
      expect(response.statusCode).toBe(404);
    });
  });

  describe("live updates", () => {
    it("requires a session to connect", async () => {
      await app.ready();
      await expect(app.injectWS("/api/live")).rejects.toThrow("401");
    });

    it("sends a new card to a connected station straight away", async () => {
      const shiftId = await openShift();
      const socket = await app.injectWS("/api/live", { headers: { cookie: distribution } });
      const message = new Promise<string>((resolve) => {
        socket.once("message", (data) => resolve(messageText(data)));
      });

      const card = await addCard(shiftId);

      expect(JSON.parse(await message)).toEqual({ type: "card", card });
      socket.terminate();
    });

    it("sends a card update to a connected station", async () => {
      const card = await addCard(await openShift());
      const socket = await app.injectWS("/api/live", { headers: { cookie: frontDesk } });
      const message = new Promise<string>((resolve) => {
        socket.once("message", (data) => resolve(messageText(data)));
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
      socket.on("message", (data) => messages.push(messageText(data)));

      await request("POST", `/api/shifts/${shiftId}/cards`, frontDesk, payload);
      await addCard(shiftId, { number: 2 });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0] ?? "{}").card.number).toBe(2);
      socket.terminate();
    });
  });
});
