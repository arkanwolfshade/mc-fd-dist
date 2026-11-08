import type { Role } from "./accounts.js";

// The path a family's card follows. See ADR 0010.
export const CARD_STATUSES = ["entered", "called", "confirmed", "distributed"] as const;
// Off the path: the family left without being served. See ADR 0019.
export const LEFT = "left";
export const ALL_CARD_STATUSES = [...CARD_STATUSES, LEFT] as const;
export type CardStatus = (typeof ALL_CARD_STATUSES)[number];

export const ARRIVAL_METHODS = ["East", "West", "AC", "Bus", "Walk"] as const;
export type ArrivalMethod = (typeof ARRIVAL_METHODS)[number];

// Stored as short codes, shown in full. "AC" was the paper sheet's abbreviation.
const ARRIVAL_LABELS: Record<ArrivalMethod, string> = {
  East: "East",
  West: "West",
  AC: "Around corner",
  Bus: "Bus",
  Walk: "Walk",
};

export function arrivalLabel(method: ArrivalMethod): string {
  return ARRIVAL_LABELS[method];
}

// The rule printed on the MC-FD and MC-Dist footers: 1-4 = 1, 5-8 = 2, 9+ = 3.
export function tefapBags(familySize: number): number {
  if (familySize <= 4) return 1;
  if (familySize <= 8) return 2;
  return 3;
}

// Cheese is handed out only with a senior box. See ADR 0020.
export const CHEESE_RULE = "Cheese comes only with a senior box";

export function breaksCheeseRule(card: { seniorBox: boolean; cheese: boolean }): boolean {
  return card.cheese && !card.seniorBox;
}

// The statuses each role may move a card between on the path. See ADR 0010.
const STATUSES_BY_ROLE: Record<Role, readonly CardStatus[]> = {
  front_desk: ["entered", "called"],
  distribution: ["called", "confirmed", "distributed"],
  admin: CARD_STATUSES,
};

export function canChangeStatus(role: Role, from: CardStatus, to: CardStatus): boolean {
  const canRecordLeaving = role === "distribution" || role === "admin";
  // Any time before the family is served. Undoing it returns the card to the front desk, so
  // that only the front desk can call the family forward again.
  if (to === LEFT) return canRecordLeaving && from !== "distributed" && from !== LEFT;
  if (from === LEFT) return canRecordLeaving && to === "entered";

  const path: readonly CardStatus[] = CARD_STATUSES;
  const isSingleStep = Math.abs(path.indexOf(from) - path.indexOf(to)) === 1;
  const allowed = STATUSES_BY_ROLE[role];
  return isSingleStep && allowed.includes(from) && allowed.includes(to);
}
