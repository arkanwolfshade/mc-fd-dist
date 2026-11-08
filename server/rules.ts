import type { Role } from "./accounts.js";

// The path a family's card follows. See ADR 0010.
export const CARD_STATUSES = ["entered", "called", "confirmed", "distributed"] as const;
// Off the path: the family left without being served. See ADR 0019.
export const LEFT = "left";
export const ALL_CARD_STATUSES = [...CARD_STATUSES, LEFT] as const;
export type CardStatus = (typeof ALL_CARD_STATUSES)[number];

export const ARRIVAL_METHODS = ["East", "West", "AC", "Bus", "Walk"] as const;
export type ArrivalMethod = (typeof ARRIVAL_METHODS)[number];

// The rule printed on the MC-FD and MC-Dist footers: 1-4 = 1, 5-8 = 2, 9+ = 3.
export function tefapBags(familySize: number): number {
  if (familySize <= 4) return 1;
  if (familySize <= 8) return 2;
  return 3;
}

// The statuses each role may move a card between on the path. See ADR 0010.
const STATUSES_BY_ROLE: Record<Role, readonly CardStatus[]> = {
  front_desk: ["entered", "called"],
  distribution: ["called", "confirmed", "distributed"],
  admin: CARD_STATUSES,
};

export function canChangeStatus(role: Role, from: CardStatus, to: CardStatus): boolean {
  const canRecordLeaving = role === "distribution" || role === "admin";
  // Any time before the family is served. Undoing it puts them back in the queue.
  if (to === LEFT) return canRecordLeaving && from !== "distributed" && from !== LEFT;
  if (from === LEFT) return canRecordLeaving && to === "called";

  const path: readonly CardStatus[] = CARD_STATUSES;
  const isSingleStep = Math.abs(path.indexOf(from) - path.indexOf(to)) === 1;
  const allowed = STATUSES_BY_ROLE[role];
  return isSingleStep && allowed.includes(from) && allowed.includes(to);
}
