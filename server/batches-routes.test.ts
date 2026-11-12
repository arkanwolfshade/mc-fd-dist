import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts.js";
import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";
import { messageText, PASSWORD, signIn } from "./test-support.js";

describe("returned batches", () => {
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
    const created = await request("POST", "/api/shifts", frontDesk, { date: "2026-11-07" });
    shiftId = created.json().id;
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

  it("subtracts returned weight in the shift summary", async () => {
    await addReturned(distribution);
    expect((await shift()).json().summary).toMatchObject({
      returnedWeight: 6.5,
      netWeight: -6.5,
    });
  });

  it("stops the front desk adding a returned batch", async () => {
    expect((await addReturned(frontDesk)).statusCode).toBe(403);
  });

  // Door Dash and Helping Hands Families are cards now. See ADR 0023.
  it("no longer accepts partner batches", async () => {
    const response = await request("POST", `/api/shifts/${shiftId}/partner-batches`, distribution, {
      clientId: crypto.randomUUID(),
      partner: "Door Dash",
      familyCount: 3,
      weight: 40,
    });
    expect(response.statusCode).toBe(404);
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
    expect((await addReturned(distribution)).statusCode).toBe(409);
  });

  it("rejects removing a batch from a closed shift", async () => {
    const batch = (await addReturned(distribution)).json();
    db.prepare("UPDATE shift SET status = 'closed' WHERE id = ?").run(shiftId);
    const response = await request("DELETE", `/api/returned-batches/${batch.id}`, distribution);
    expect(response.statusCode).toBe(409);
  });

  it("sends batch changes to connected stations", async () => {
    const socket = await app.injectWS("/api/live", { headers: { cookie: frontDesk } });
    const message = new Promise<string>((resolve) => {
      socket.once("message", (data) => resolve(messageText(data)));
    });

    await addReturned(distribution);

    expect(JSON.parse(await message)).toMatchObject({
      type: "batches",
      shiftId,
      returnedBatches: [{ weight: 6.5 }],
    });
    socket.terminate();
  });
});
