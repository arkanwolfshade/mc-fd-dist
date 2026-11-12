import type { Role } from "./accounts.js";

// The path a family's card follows. See ADR 0010.
export const CARD_STATUSES = ["entered", "called", "confirmed", "distributed"] as const;
// Off the path: the family left without being served. See ADR 0019.
export const LEFT = "left";
export const ALL_CARD_STATUSES = [...CARD_STATUSES, LEFT] as const;
export type CardStatus = (typeof ALL_CARD_STATUSES)[number];

// The Family's location or transport, chosen at the front desk.
export const ARRIVAL_METHODS = ["East", "West", "AC", "Bus", "Walk"] as const;
// Families served through a partner, entered by Distribution at the end of a shift. See ADR 0023.
export const PARTNER_METHODS = ["DD", "HH"] as const;
export const ALL_ARRIVAL_METHODS = [...ARRIVAL_METHODS, ...PARTNER_METHODS] as const;
export type ArrivalMethod = (typeof ALL_ARRIVAL_METHODS)[number];
export type PartnerMethod = (typeof PARTNER_METHODS)[number];

// Stored as short codes, shown in full. "AC" was the paper sheet's abbreviation.
const ARRIVAL_LABELS: Record<ArrivalMethod, string> = {
  East: "East",
  West: "West",
  AC: "Around corner",
  Bus: "Bus",
  Walk: "Walk",
  DD: "Door Dash",
  HH: "Helping Hands",
};

export function arrivalLabel(method: ArrivalMethod): string {
  return ARRIVAL_LABELS[method];
}

export function isPartnerMethod(method: string): method is PartnerMethod {
  return (PARTNER_METHODS as readonly string[]).includes(method);
}

// The rule printed on the MC-FD and MC-Dist footers: 1-4 = 1, 5-8 = 2, 9+ = 3.
export function tefapBags(familySize: number): number {
  if (familySize <= 4) return 1;
  if (familySize <= 8) return 2;
  return 3;
}

// Each TEFAP bag goes out on its own cart, so a Family has a weight for each. See ADR 0023.
export function cartCount(card: { tefapBags: number }): number {
  return card.tefapBags;
}

// True when no weight is recorded for a cart the Family does not get.
export function fitsCarts(loads: readonly (number | null)[], carts: number): boolean {
  return loads.slice(carts).every((load) => load === null);
}

export function cartRule(carts: number): string {
  return `This Family gets ${carts} ${carts === 1 ? "cart" : "carts"}, so only ${carts === 1 ? "one weight" : `${carts} weights`} can be recorded`;
}

// Families just past each four people have room on their last cart for extras, such as meat,
// deli or bakery, so Distribution checks that something was added. See ADR 0023.
export function needsExtrasCheck(familySize: number): boolean {
  return familySize >= 13 || (familySize >= 5 && familySize % 4 !== 0);
}

// The intake volunteer whose computer the Family's details came from. See ADR 0024.
const INITIALS_PATTERN = /^[A-Z]{2,4}$/;
export const INITIALS_RULE = "Initials must be 2 to 4 letters";

export function normalizeInitials(value: string): string | null {
  const initials = value.trim().toUpperCase();
  return INITIALS_PATTERN.test(initials) ? initials : null;
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
