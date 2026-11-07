import type { Database } from "better-sqlite3";

export const PARTNERS = ["Door Dash", "Helping Hands"] as const;
export type Partner = (typeof PARTNERS)[number];

export interface PartnerBatch {
  id: number;
  shiftId: number;
  partner: Partner;
  familyCount: number;
  weight: number;
}

export interface ReturnedBatch {
  id: number;
  shiftId: number;
  weight: number;
}

const PARTNER_COLUMNS = `id, shift_id AS shiftId, partner, family_count AS familyCount, weight`;
const RETURNED_COLUMNS = `id, shift_id AS shiftId, weight`;

export function listPartnerBatches(db: Database, shiftId: number): PartnerBatch[] {
  return db
    .prepare(`SELECT ${PARTNER_COLUMNS} FROM partner_batch WHERE shift_id = ? ORDER BY id`)
    .all(shiftId) as PartnerBatch[];
}

export function listReturnedBatches(db: Database, shiftId: number): ReturnedBatch[] {
  return db
    .prepare(`SELECT ${RETURNED_COLUMNS} FROM returned_batch WHERE shift_id = ? ORDER BY id`)
    .all(shiftId) as ReturnedBatch[];
}

export function findPartnerBatchByClientId(db: Database, clientId: string): PartnerBatch | null {
  const row = db
    .prepare(`SELECT ${PARTNER_COLUMNS} FROM partner_batch WHERE client_id = ?`)
    .get(clientId);
  return (row as PartnerBatch | undefined) ?? null;
}

export function findReturnedBatchByClientId(db: Database, clientId: string): ReturnedBatch | null {
  const row = db
    .prepare(`SELECT ${RETURNED_COLUMNS} FROM returned_batch WHERE client_id = ?`)
    .get(clientId);
  return (row as ReturnedBatch | undefined) ?? null;
}

export function createPartnerBatch(
  db: Database,
  shiftId: number,
  input: { clientId: string; partner: Partner; familyCount: number; weight: number },
): PartnerBatch {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO partner_batch (shift_id, client_id, partner, family_count, weight)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(shiftId, input.clientId, input.partner, input.familyCount, input.weight);
  return {
    id: Number(lastInsertRowid),
    shiftId,
    partner: input.partner,
    familyCount: input.familyCount,
    weight: input.weight,
  };
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

export type BatchTable = "partner_batch" | "returned_batch";

export function findBatchShiftId(db: Database, table: BatchTable, id: number): number | null {
  const row = db.prepare(`SELECT shift_id AS shiftId FROM ${table} WHERE id = ?`).get(id) as
    | { shiftId: number }
    | undefined;
  return row?.shiftId ?? null;
}

export function deleteBatch(db: Database, table: BatchTable, id: number): void {
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}
