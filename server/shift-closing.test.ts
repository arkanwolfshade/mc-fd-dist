import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { AUTOMATIC_ACTOR, listAudit } from "./audit.js";
import { closeExpiredShifts, localDate, setShiftStatus } from "./shift-closing.js";
import { createShift, findShift } from "./cards.js";
import type { Shift } from "./cards.js";
import { openDatabase } from "./db.js";

describe("localDate", () => {
  const instant = Date.UTC(2026, 10, 7, 3, 30);

  it("uses the food bank's time zone, not UTC", () => {
    expect(localDate(instant, "America/Phoenix")).toBe("2026-11-06");
    expect(localDate(instant, "UTC")).toBe("2026-11-07");
  });
});

describe("automatic closing when the server starts", () => {
  it("closes an earlier shift, records it and leaves today's open", async () => {
    const db = openDatabase(":memory:");
    const old = createShift(db, "2026-11-05") as Shift;
    const today = createShift(db, "2026-11-06") as Shift;

    const app = await buildApp({
      db,
      cookieSecure: true,
      now: () => Date.UTC(2026, 10, 6, 18),
      autoCloseTimeZone: "UTC",
    });
    await app.ready();

    expect(findShift(db, old.id)?.status).toBe("closed");
    expect(findShift(db, today.id)?.status).toBe("open");
    expect(listAudit(db, 10)).toMatchObject([
      { actor: AUTOMATIC_ACTOR, action: "shift.close" },
    ]);

    await app.close();
    db.close();
  });
});

describe("closeExpiredShifts", () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  function shift(date: string): Shift {
    return createShift(db, date) as Shift;
  }

  it("closes an open shift from an earlier date", () => {
    const old = shift("2026-11-05");
    expect(closeExpiredShifts(db, "2026-11-06").map((s) => s.id)).toEqual([old.id]);
    expect(findShift(db, old.id)?.status).toBe("closed");
  });

  it("leaves today's shift open", () => {
    const today = shift("2026-11-06");
    expect(closeExpiredShifts(db, "2026-11-06")).toEqual([]);
    expect(findShift(db, today.id)?.status).toBe("open");
  });

  it("does not close a shift an admin reopened", () => {
    const old = shift("2026-11-05");
    setShiftStatus(db, old.id, "closed");
    setShiftStatus(db, old.id, "open");
    expect(closeExpiredShifts(db, "2026-11-06")).toEqual([]);
    expect(findShift(db, old.id)?.status).toBe("open");
  });

  it("closes an old shift that was reopened then closed by hand, and leaves it closed", () => {
    const old = shift("2026-11-05");
    setShiftStatus(db, old.id, "closed");
    setShiftStatus(db, old.id, "open");
    setShiftStatus(db, old.id, "closed");
    expect(closeExpiredShifts(db, "2026-11-06")).toEqual([]);
    expect(findShift(db, old.id)?.status).toBe("closed");
  });
});
