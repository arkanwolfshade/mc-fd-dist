import type { Database } from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { AUTOMATIC_ACTOR, recordAudit } from "./audit.js";
import type { LiveMessage } from "./card-routes.js";
import { findShift } from "./cards.js";
import type { Shift } from "./cards.js";

const AUTO_CLOSE_INTERVAL_MS = 60 * 60 * 1000;

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

// Closes the shifts of earlier days when the server starts and every hour after. Each one is
// logged as the automatic actor and announced to the stations.
export function scheduleAutoClose(
  app: FastifyInstance,
  options: {
    db: Database;
    timeZone: string;
    now: () => number;
    broadcast: (message: LiveMessage) => void;
  },
): void {
  const { db, timeZone, now, broadcast } = options;
  const runAutoClose = () => {
    for (const shift of closeExpiredShifts(db, localDate(now(), timeZone))) {
      recordAudit(db, {
        at: now(),
        actor: AUTOMATIC_ACTOR,
        action: "shift.close",
        detail: { date: shift.date },
      });
      broadcast({ type: "shift", shift });
    }
  };
  let timer: NodeJS.Timeout;
  app.addHook("onReady", async () => {
    runAutoClose();
    timer = setInterval(runAutoClose, AUTO_CLOSE_INTERVAL_MS);
    timer.unref();
  });
  app.addHook("onClose", async () => clearInterval(timer));
}
