import type { Card } from "../../server/cards.js";
import { cartCount, isPartnerMethod, needsExtrasCheck } from "../../server/rules.js";
import { ApiError } from "./api.js";
import { classify } from "./outbox.js";

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

export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseLoads(fields: string[]): (number | null)[] {
  return fields.map((field) => (field.trim() === "" ? null : Number(field)));
}

export function hasWeight(loads: readonly (number | null)[]): boolean {
  return loads.some((load) => load !== null);
}

// Partner cards are saved as distributed, so they never wait in the queue. See ADR 0023.
export function distributionQueue(cards: Card[]): Card[] {
  return cards.filter(
    (card) =>
      (card.status === "called" || card.status === "confirmed") &&
      !isPartnerMethod(card.arrivalMethod),
  );
}

// What Distribution is warned about before marking a Family distributed. Each is a warning,
// not a block: a volunteer can still go ahead. See ADR 0023.
export function missingBeforeDistribution(
  card: { familySize: number; tefapBags: number },
  loads: readonly (number | null)[],
  extrasAdded: boolean,
): string[] {
  const missing: string[] = [];
  for (let cart = 0; cart < cartCount(card); cart++) {
    if ((loads[cart] ?? null) === null) missing.push(`Cart ${cart + 1} has no weight.`);
  }
  if (needsExtrasCheck(card.familySize) && !extrasAdded) {
    missing.push("Extras added is not ticked.");
  }
  return missing;
}
