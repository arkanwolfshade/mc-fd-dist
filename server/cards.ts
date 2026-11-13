import { SqliteError } from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { tefapBags } from "./rules.js";
import type { ArrivalMethod, CardStatus } from "./rules.js";
import { roundWeight } from "./summary.js";

export type Loads = [number | null, number | null, number | null];

export interface Card {
  id: number;
  shiftId: number;
  number: number;
  familySize: number;
  arrivalMethod: ArrivalMethod;
  seniorBox: boolean;
  cheese: boolean;
  other: string;
  tefapBags: number;
  tefapOverride: boolean;
  status: CardStatus;
  loads: Loads;
  totalWeight: number;
  revision: number;
  extrasAdded: boolean;
  extrasNote: string;
  intakeInitials: string | null;
}

export interface Shift {
  id: number;
  date: string;
  status: "open" | "closed";
}

export interface NewCard {
  clientId: string;
  number: number;
  familySize: number;
  arrivalMethod: ArrivalMethod;
  seniorBox: boolean;
  cheese: boolean;
  other: string;
  tefapBags?: number;
  intakeInitials?: string | null;
  status?: CardStatus;
  loads?: (number | null)[];
  extrasAdded?: boolean;
  extrasNote?: string;
}

export interface CardChanges {
  number?: number;
  familySize?: number;
  arrivalMethod?: ArrivalMethod;
  seniorBox?: boolean;
  cheese?: boolean;
  other?: string;
  tefapBags?: number | null;
  status?: CardStatus;
  loads?: (number | null)[];
  extrasAdded?: boolean;
  extrasNote?: string;
}

interface CardRow {
  id: number;
  shift_id: number;
  number: number;
  family_size: number;
  arrival_method: ArrivalMethod;
  senior_box: number;
  cheese: number;
  other: string;
  tefap_bags: number;
  tefap_override: number;
  status: CardStatus;
  load_1: number | null;
  load_2: number | null;
  load_3: number | null;
  revision: number;
  extras_added: number;
  extras_note: string;
  intake_initials: string | null;
}

function toCard(row: CardRow): Card {
  const loads: Loads = [row.load_1, row.load_2, row.load_3];
  return {
    id: row.id,
    shiftId: row.shift_id,
    number: row.number,
    familySize: row.family_size,
    arrivalMethod: row.arrival_method,
    seniorBox: row.senior_box === 1,
    cheese: row.cheese === 1,
    other: row.other,
    tefapBags: row.tefap_bags,
    tefapOverride: row.tefap_override === 1,
    status: row.status,
    loads,
    totalWeight: roundWeight(loads.reduce<number>((sum, load) => sum + (load ?? 0), 0)),
    revision: row.revision,
    extrasAdded: row.extras_added === 1,
    extrasNote: row.extras_note,
    intakeInitials: row.intake_initials,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof SqliteError && error.code === "SQLITE_CONSTRAINT_UNIQUE";
}

export function createShift(db: Database, date: string): Shift | "duplicate" {
  try {
    const { lastInsertRowid } = db.prepare("INSERT INTO shift (date) VALUES (?)").run(date);
    return { id: Number(lastInsertRowid), date, status: "open" };
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}

export function findShiftByDate(db: Database, date: string): Shift | null {
  const row = db.prepare("SELECT id, date, status FROM shift WHERE date = ?").get(date);
  return (row as Shift | undefined) ?? null;
}

export function findShift(db: Database, id: number): Shift | null {
  const row = db.prepare("SELECT id, date, status FROM shift WHERE id = ?").get(id);
  return (row as Shift | undefined) ?? null;
}

export function listShiftsBetween(db: Database, from: string, to: string): Shift[] {
  return db
    .prepare("SELECT id, date, status FROM shift WHERE date BETWEEN ? AND ? ORDER BY date")
    .all(from, to) as Shift[];
}

export function listCards(db: Database, shiftId: number): Card[] {
  const rows = db
    .prepare("SELECT * FROM card WHERE shift_id = ? ORDER BY number")
    .all(shiftId) as CardRow[];
  return rows.map(toCard);
}

export function findCard(db: Database, id: number): Card | null {
  const row = db.prepare("SELECT * FROM card WHERE id = ?").get(id) as CardRow | undefined;
  return row ? toCard(row) : null;
}

export function deleteCard(db: Database, id: number): void {
  db.prepare("DELETE FROM card WHERE id = ?").run(id);
}

export function findCardByClientId(db: Database, clientId: string): Card | null {
  const row = db.prepare("SELECT * FROM card WHERE client_id = ?").get(clientId) as
    CardRow | undefined;
  return row ? toCard(row) : null;
}

// The TEFAP bags a new card gets: the Family's size rule, unless set by hand.
export function newCardBags(input: Pick<NewCard, "familySize" | "tefapBags">): number {
  return input.tefapBags ?? tefapBags(input.familySize);
}

// SQLite stores a flag as 0 or 1.
function flag(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function createCard(db: Database, shiftId: number, input: NewCard): Card | "duplicate" {
  try {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO card (shift_id, client_id, number, family_size, arrival_method, senior_box,
           cheese, other, tefap_bags, tefap_override, status, load_1, load_2, load_3,
           extras_added, extras_note, intake_initials)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        shiftId,
        input.clientId,
        input.number,
        input.familySize,
        input.arrivalMethod,
        flag(input.seniorBox),
        flag(input.cheese),
        input.other,
        newCardBags(input),
        flag(input.tefapBags !== undefined),
        input.status ?? "entered",
        ...loadColumns(input.loads ?? []),
        flag(input.extrasAdded ?? false),
        input.extrasNote ?? "",
        input.intakeInitials ?? null,
      );
    return findCard(db, Number(lastInsertRowid)) as Card;
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}

export type UpdateResult = Card | "stale" | "duplicate";

// Whether the TEFAP bags are set by hand once the changes are made. Setting them to null
// returns to the size rule.
function overrideAfter(current: Card, changes: CardChanges): boolean {
  return changes.tefapBags === undefined ? current.tefapOverride : changes.tefapBags !== null;
}

// The TEFAP bags a card will have once the changes are made.
export function bagsAfter(current: Card, changes: CardChanges): number {
  return overrideAfter(current, changes)
    ? (changes.tefapBags ?? current.tefapBags)
    : tefapBags(changes.familySize ?? current.familySize);
}

// A card's weights fill three columns, one for each cart it can have.
function loadColumns(loads: readonly (number | null)[]): (number | null)[] {
  return [loads[0] ?? null, loads[1] ?? null, loads[2] ?? null];
}

// The changes that name a value: a missing or null field leaves the card as it was. The TEFAP
// bags are left out, because there null means "go back to the size rule".
function given(changes: CardChanges): Partial<Omit<CardChanges, "tefapBags">> {
  const { tefapBags: _byHand, ...rest } = changes;
  return Object.fromEntries(Object.entries(rest).filter(([, value]) => value != null));
}

export function updateCard(
  db: Database,
  current: Card,
  revision: number,
  changes: CardChanges,
): UpdateResult {
  const next = { ...current, ...given(changes) };

  try {
    const { changes: updated } = db
      .prepare(
        `UPDATE card SET number = ?, family_size = ?, arrival_method = ?, senior_box = ?,
           cheese = ?, other = ?, tefap_bags = ?, tefap_override = ?, status = ?,
           load_1 = ?, load_2 = ?, load_3 = ?, extras_added = ?, extras_note = ?,
           revision = revision + 1
         WHERE id = ? AND revision = ?`,
      )
      .run(
        next.number,
        next.familySize,
        next.arrivalMethod,
        flag(next.seniorBox),
        flag(next.cheese),
        next.other,
        bagsAfter(current, changes),
        flag(overrideAfter(current, changes)),
        next.status,
        ...loadColumns(next.loads),
        flag(next.extrasAdded),
        next.extrasNote,
        current.id,
        revision,
      );
    return updated === 0 ? "stale" : (findCard(db, current.id) as Card);
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}
