import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts.js";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";
import { PASSWORD, signIn } from "./test-support.js";

describe("partner and returned batches", () => {
  let db: Database;
  let app: FastifyInstance;
  let frontDesk: string;
  let distribution: string;
  let shiftId: number;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    await createAccount(db, { username: "front-desk", password: PASSWORD, role: "front_desk" });
    await createAccount(db, { username: "distribution", password: PASSWORD, role: "distribution" });
    app = await buildApp({ db, cookieSecure: true });
    frontDesk = await signIn(app, "front-desk");
    distribution = await signIn(app, "distribution");
    const shift = await request("POST", "/api/shifts", frontDesk, { date: "2026-11-07" });
    shiftId = shift.json().id;
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  function request(
    method: "GET" | "POST" | "DELETE",
    url: string,
    cookie: string,
    payload?: object,
  ) {
    return app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  function addPartner(cookie: string, overrides: object = {}) {
    return request("POST", `/api/shifts/${shiftId}/partner-batches`, cookie, {
      clientId: crypto.randomUUID(),
      partner: "Door Dash",
      familyCount: 3,
      weight: 40,
      ...overrides,
    });
  }

  function addReturned(cookie: string, overrides: object = {}) {
    return request("POST", `/api/shifts/${shiftId}/returned-batches`, cookie, {
      clientId: crypto.randomUUID(),
      weight: 6.5,
      ...overrides,
    });
  }

  function shift() {
    return request("GET", "/api/shifts?date=2026-11-07", distribution);
  }

  it("records several partner batches for one partner in a shift", async () => {
    expect((await addPartner(distribution)).statusCode).toBe(201);
    expect((await addPartner(distribution)).statusCode).toBe(201);
    const { partnerBatches } = (await shift()).json();
    expect(partnerBatches).toHaveLength(2);
    expect(partnerBatches[0]).toMatchObject({ partner: "Door Dash", familyCount: 3, weight: 40 });
  });

  it("keeps partner batches out of the card list", async () => {
    await addPartner(distribution);
    expect((await shift()).json().cards).toEqual([]);
  });

  it("includes batches in the shift summary", async () => {
    await addPartner(distribution);
    await addReturned(distribution);
    expect((await shift()).json().summary).toMatchObject({
      families: { total: 3, cards: 0, partners: 3 },
      returnedWeight: 6.5,
      netWeight: 33.5,
    });
  });

  it("stops the front desk adding either kind of batch", async () => {
    expect((await addPartner(frontDesk)).statusCode).toBe(403);
    expect((await addReturned(frontDesk)).statusCode).toBe(403);
  });

  it.each([
    ["an unknown partner", { partner: "Uber" }],
    ["a family count of zero", { familyCount: 0 }],
    ["a negative weight", { weight: -1 }],
  ])("rejects a partner batch with %s", async (_name, overrides) => {
    expect((await addPartner(distribution, overrides)).statusCode).toBe(400);
  });

  it("rejects a returned batch with a weight of zero", async () => {
    expect((await addReturned(distribution, { weight: 0 })).statusCode).toBe(400);
  });

  it("treats a repeated clientId as a safe retry", async () => {
    const clientId = crypto.randomUUID();
    await addReturned(distribution, { clientId });
    const retry = await addReturned(distribution, { clientId });
    expect(retry.statusCode).toBe(200);
    expect((await shift()).json().returnedBatches).toHaveLength(1);
  });

  it("removes a batch entered by mistake", async () => {
    const batch = (await addReturned(distribution)).json();
    const response = await request("DELETE", `/api/returned-batches/${batch.id}`, distribution);
    expect(response.statusCode).toBe(204);
    expect((await shift()).json().returnedBatches).toEqual([]);
  });

  it("rejects a batch on a closed shift", async () => {
    db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(shiftId);
    expect((await addPartner(distribution)).statusCode).toBe(409);
    expect((await addReturned(distribution)).statusCode).toBe(409);
  });

  it("rejects removing a batch from a closed shift", async () => {
    const batch = (await addPartner(distribution)).json();
    db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(shiftId);
    const response = await request("DELETE", `/api/partner-batches/${batch.id}`, distribution);
    expect(response.statusCode).toBe(409);
  });

  it("sends batch changes to connected stations", async () => {
    const socket = await app.injectWS("/api/live", { headers: { cookie: frontDesk } });
    const message = new Promise<string>((resolve) => {
      socket.once("message", (data) => resolve(data.toString()));
    });

    await addReturned(distribution);

    expect(JSON.parse(await message)).toMatchObject({
      type: "batches",
      shiftId,
      partnerBatches: [],
      returnedBatches: [{ weight: 6.5 }],
    });
    socket.terminate();
  });
});
