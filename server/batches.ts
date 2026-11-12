import type { Database } from "better-sqlite3";

// Food handed back during a shift, weighed and subtracted from the shift's net weight.
// Door Dash and Helping Hands Families are cards now. See ADR 0023.
export interface ReturnedBatch {
  id: number;
  shiftId: number;
  weight: number;
}

const RETURNED_COLUMNS = `id, shift_id AS shiftId, weight`;

export function listReturnedBatches(db: Database, shiftId: number): ReturnedBatch[] {
  return db
    .prepare(`SELECT ${RETURNED_COLUMNS} FROM returned_batch WHERE shift_id = ? ORDER BY id`)
    .all(shiftId) as ReturnedBatch[];
}

export function findReturnedBatchByClientId(db: Database, clientId: string): ReturnedBatch | null {
  const row = db
    .prepare(`SELECT ${RETURNED_COLUMNS} FROM returned_batch WHERE client_id = ?`)
    .get(clientId);
  return (row as ReturnedBatch | undefined) ?? null;
}

export function createReturnedBatch(
  db: Database,
  shiftId: number,
  input: { clientId: string; weight: number },
): ReturnedBatch {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO returned_batch (shift_id, client_id, weight) VALUES (?, ?, ?)")
    .run(shiftId, input.clientId, input.weight);
  return { id: Number(lastInsertRowid), shiftId, weight: input.weight };
}

export function findReturnedBatchShiftId(db: Database, id: number): number | null {
  const row = db.prepare("SELECT shift_id AS shiftId FROM returned_batch WHERE id = ?").get(id) as
    { shiftId: number } | undefined;
  return row?.shiftId ?? null;
}

export function deleteReturnedBatch(db: Database, id: number): void {
  db.prepare("DELETE FROM returned_batch WHERE id = ?").run(id);
}
