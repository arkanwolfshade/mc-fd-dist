import type { Database } from "better-sqlite3";
import { findShift } from "./cards.js";
import type { Shift } from "./cards.js";

// The date at the food bank, as YYYY-MM-DD.
export function localDate(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

// Reopening marks the shift, so that the overnight close leaves it for the admin
// who reopened it. See ADR 0013.
export function setShiftStatus(db: Database, id: number, status: Shift["status"]): Shift | null {
  db.prepare(
    `UPDATE shift SET status = ?, reopened = CASE WHEN ? = 'open' THEN 1 ELSE reopened END
     WHERE id = ?`,
  ).run(status, status, id);
  return findShift(db, id);
}

export function closeExpiredShifts(db: Database, today: string): Shift[] {
  return db
    .prepare(
      `UPDATE shift SET status = 'closed'
       WHERE status = 'open' AND reopened = 0 AND date < ?
       RETURNING id, date, status`,
    )
    .all(today) as Shift[];
}
