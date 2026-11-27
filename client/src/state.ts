import type { Card } from "../../server/cards.js";
import type { LiveMessage } from "../../server/card-routes.js";
import {
  byCallOrder,
  cartCount,
  inDistributionQueue,
  isPartnerMethod,
  needsExtrasCheck,
  unweighedCarts,
  weighRule,
} from "../../server/rules.js";
import { ApiError } from "./api.js";
import { classify } from "./outbox.js";
import type { ShiftWithCards } from "./types.js";

// null means no shift has been opened today; undefined means it hasn't loaded yet.
type KnownShift = ShiftWithCards | null | undefined;

// A change only applies to the shift it is about, so a late message about yesterday's shift
// cannot touch today's.
export function applyToShift(
  shift: KnownShift,
  shiftId: number,
  patch: (shift: ShiftWithCards) => ShiftWithCards,
): KnownShift {
  return shift && shift.id === shiftId ? patch(shift) : shift;
}

// How a change another station made, or this one's own save, reaches the shift on screen.
export function applyLiveMessage(shift: KnownShift, message: LiveMessage): KnownShift {
  if (message.type === "card") {
    return applyToShift(shift, message.card.shiftId, (current) => ({
      ...current,
      cards: mergeCard(current.cards, message.card),
    }));
  }
  if (message.type === "card-deleted") {
    return applyToShift(shift, message.shiftId, (current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== message.cardId),
    }));
  }
  if (message.type === "shift") {
    return applyToShift(shift, message.shift.id, (current) => ({
      ...current,
      status: message.shift.status,
    }));
  }
  return applyToShift(shift, message.shiftId, (current) => ({
    ...current,
    returnedBatches: message.returnedBatches,
  }));
}

// The shift as a reload answered it, with the changes made or heard while it waited put back on
// top. The server read its state when the request arrived, so a change announced in the meantime
// may be newer than the answer, and replacing the screen with the answer would erase it. Applying
// a change again is safe, because a card only replaces one of an older revision.
export function settleShiftLoad(
  loaded: ShiftWithCards,
  heardDuringLoad: readonly LiveMessage[],
): ShiftWithCards {
  let settled: KnownShift = loaded;
  for (const message of heardDuringLoad) {
    settled = applyLiveMessage(settled, message);
  }
  return settled as ShiftWithCards;
}

// What a station shows: today's shift, or an earlier one the server answered because it is still
// open. Once that one closes it counts as no shift, so today's can be opened. See ADR 0040.
export function shiftOnScreen<T extends { date: string; status: string }>(
  shift: T | null | undefined,
  today: string,
): T | null | undefined {
  return shift && shift.date < today && shift.status === "closed" ? null : shift;
}

// The last shift seen, for a reload during an outage. Only used for the same date.
export function savedShift(
  storage: Pick<Storage, "getItem">,
  key: string,
  date: string,
): ShiftWithCards | undefined {
  try {
    const saved = JSON.parse(storage.getItem(key) ?? "null") as ShiftWithCards | null;
    return saved?.date === date ? saved : undefined;
  } catch {
    return undefined;
  }
}

export type LoadFailure = "no-shift" | "sign-out" | "offline" | "notice";

// What a station does when loading today's shift fails. Anything the outbox would retry
// later, including a proxy's HTML error page, means the server can't be reached.
export function classifyLoadFailure(error: unknown): LoadFailure {
  if (error instanceof ApiError && error.status === 404) return "no-shift";
  const outcome = classify(error);
  if (outcome === "session-ended") return "sign-out";
  return outcome === "retry-later" ? "offline" : "notice";
}

// Updates can arrive out of order, for example a broadcast overtaking an HTTP
// response, so a card is only replaced by a newer revision.
export function mergeCard(cards: Card[], incoming: Card): Card[] {
  const existing = cards.find((card) => card.id === incoming.id);
  if (existing && existing.revision >= incoming.revision) {
    return cards;
  }
  return [...cards.filter((card) => card.id !== incoming.id), incoming].sort(
    (a, b) => a.number - b.number,
  );
}

export function nextCardNumber(cards: readonly { number: number }[]): number {
  return cards.reduce((highest, card) => Math.max(highest, card.number), 0) + 1;
}

// Shared with the server, which names a day in its messages.
export { dayInWords } from "../../server/rules.js";

export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseLoads(fields: string[]): (number | null)[] {
  return fields.map((field) => (field.trim() === "" ? null : Number(field)));
}

// Weights typed for carts the Family does not have, say after the family size was corrected,
// are dropped.
export function loadsForCarts(fields: string[], carts: number): (number | null)[] {
  return parseLoads(fields).map((load, index) => (index < carts ? load : null));
}

// Cheese comes only with a Senior Box, so it goes when the box does.
export function toggleSeniorBox(current: { seniorBox: boolean; cheese: boolean }): {
  seniorBox: boolean;
  cheese: boolean;
} {
  return { seniorBox: !current.seniorBox, cheese: current.seniorBox ? false : current.cheese };
}

export function hasWeight(loads: readonly (number | null)[]): boolean {
  return loads.some((load) => load !== null);
}

// Partner cards are saved as distributed, so they never wait in the queue. See ADR 0023.
export function distributionQueue(cards: Card[]): Card[] {
  return cards.filter(inDistributionQueue).sort(byCallOrder);
}

// How Distribution sorts a shift's cards.
export function distributionLists(cards: Card[]) {
  return {
    queue: distributionQueue(cards),
    // Partner cards are listed in their own panel, where they were entered.
    done: cards.filter(
      (card) => card.status === "distributed" && !isPartnerMethod(card.arrivalMethod),
    ),
    left: cards.filter((card) => card.status === "left"),
    // Still counted as families, but at the end of a shift each one needs correcting.
    unserved: cards.filter((card) => card.status !== "distributed" && card.status !== "left"),
  };
}

// What is checked before a Family is marked distributed. A cart without a weight stops it, as
// the server would; extras not ticked is only a warning, which a volunteer may go past.
// See ADR 0023 and 0039.
export function checkBeforeDistribution(
  card: { familySize: number; tefapBags: number },
  loads: readonly (number | null)[],
  extrasAdded: boolean,
): { stop: string | null; warnings: string[] } {
  const unweighed = unweighedCarts(loads, cartCount(card));
  return {
    stop: unweighed.length > 0 ? weighRule(unweighed) : null,
    warnings:
      needsExtrasCheck(card.familySize) && !extrasAdded ? ["Extras added is not ticked."] : [],
  };
}
