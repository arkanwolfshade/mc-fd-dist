import type { Card } from "../../server/cards.js";

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

export function nextCardNumber(cards: Card[]): number {
  return cards.reduce((highest, card) => Math.max(highest, card.number), 0) + 1;
}

export function distributionQueue(cards: Card[]): Card[] {
  return cards.filter((card) => card.status === "called" || card.status === "confirmed");
}
