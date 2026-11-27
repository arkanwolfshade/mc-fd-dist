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

interface BagState {
  familySize: number;
  tefapBags: number;
  tefapOverride: boolean;
}

interface BagChanges {
  familySize?: number;
  tefapBags?: number | null;
}

// Whether the TEFAP bags are set by hand once the changes are made. Setting them to null
// returns to the size rule.
export function overrideAfter(current: BagState, changes: BagChanges): boolean {
  return changes.tefapBags === undefined ? current.tefapOverride : changes.tefapBags !== null;
}

// The TEFAP bags a card will have once the changes are made. Stations use it to show a change
// still waiting to send, so it must match what the server saves.
export function bagsAfter(current: BagState, changes: BagChanges): number {
  return overrideAfter(current, changes)
    ? (changes.tefapBags ?? current.tefapBags)
    : tefapBags(changes.familySize ?? current.familySize);
}

// Whether a card waits in Distribution's queue: called or confirmed, and not a partner Family,
// who is saved as already served. See ADR 0023.
export function inDistributionQueue(card: { status: CardStatus; arrivalMethod: string }): boolean {
  return (
    (card.status === "called" || card.status === "confirmed") &&
    !isPartnerMethod(card.arrivalMethod)
  );
}

// The order families were called in. A family called before the order was kept has none, and was
// called before any that have one, so those come first, by card number. See ADR 0032.
export function byCallOrder(
  a: { number: number; calledOrder: number | null },
  b: { number: number; calledOrder: number | null },
): number {
  if (a.calledOrder === null || b.calledOrder === null) {
    if (a.calledOrder === b.calledOrder) return a.number - b.number;
    return a.calledOrder === null ? -1 : 1;
  }
  return a.calledOrder - b.calledOrder;
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

// Every cart a Family gets is weighed, at more than 0 lb, before the Family counts as
// distributed. Returns the cart numbers, from 1, still to weigh. See ADR 0039.
export function unweighedCarts(loads: readonly (number | null)[], carts: number): number[] {
  const missing: number[] = [];
  for (let cart = 0; cart < carts; cart++) {
    if (!((loads[cart] ?? 0) > 0)) missing.push(cart + 1);
  }
  return missing;
}

export function weighRule(
  missing: readonly number[],
  then = "mark the Family distributed",
): string {
  return `Weigh ${missing.length === 1 ? "cart" : "carts"} ${listInWords(missing)}, then ${then}`;
}

// Families just past each four people have room on their last cart for extras, such as meat,
// deli or bakery, so Distribution checks that something was added. See ADR 0023.
export function needsExtrasCheck(familySize: number): boolean {
  return familySize >= 13 || (familySize >= 5 && familySize % 4 !== 0);
}

// The intake operator: the volunteer who typed the Family's details in at an intake computer.
// The initials are never the Family's. See ADR 0024.
const INITIALS_PATTERN = /^[A-Z]{2,4}$/;
export const INITIALS_RULE = "The intake operator's initials must be 2 to 4 letters";

export function normalizeInitials(value: string): string | null {
  const initials = value.trim().toUpperCase();
  return INITIALS_PATTERN.test(initials) ? initials : null;
}

// "2026-11-07" becomes "Saturday, November 7".
export function dayInWords(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// "1, 2 and 3".
function listInWords(items: readonly (string | number)[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// One shift is open at a time, so another can't open or reopen until it closes. See ADR 0040.
export function stillOpenRule(openDate: string, action: "opening" | "reopening"): string {
  return `The shift of ${dayInWords(openDate)} is still open. Close it before ${action} another.`;
}

// A shift closes only when no card is still waiting: each was distributed or left. See ADR 0040.
export const WAITING_STATUSES: readonly CardStatus[] = ["entered", "called", "confirmed"];

export function waitingCardsRule(numbers: readonly number[]): string {
  const cards = numbers.length === 1 ? "Card" : "Cards";
  const are = numbers.length === 1 ? "is" : "are";
  return `${cards} ${listInWords(numbers)} ${are} still waiting. Mark each distributed or left without food, then close the shift.`;
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
  // The wall display only reads. Its routes are closed to it as well (ADR 0033).
  display: [],
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
