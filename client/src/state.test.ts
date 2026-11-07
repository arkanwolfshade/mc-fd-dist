import { describe, expect, it } from "vitest";
import type { Card } from "../../server/cards.js";
import { distributionQueue, mergeCard, nextCardNumber } from "./state.js";

function card(overrides: Partial<Card>): Card {
  return {
    id: 1,
    shiftId: 1,
    number: 1,
    familySize: 3,
    arrivalMethod: "East",
    seniorBox: false,
    cheese: false,
    other: "",
    tefapBags: 1,
    tefapOverride: false,
    status: "entered",
    loads: [null, null, null],
    totalWeight: 0,
    revision: 1,
    ...overrides,
  };
}

describe("mergeCard", () => {
  it("adds a new card and keeps the list in number order", () => {
    const merged = mergeCard([card({ id: 2, number: 5 })], card({ id: 1, number: 2 }));
    expect(merged.map((c) => c.number)).toEqual([2, 5]);
  });

  it("replaces a card with a newer revision", () => {
    const merged = mergeCard([card({ revision: 1 })], card({ revision: 2, familySize: 9 }));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.familySize).toBe(9);
  });

  it("ignores an update older than the card already held", () => {
    const merged = mergeCard(
      [card({ revision: 3, familySize: 9 })],
      card({ revision: 2, familySize: 1 }),
    );
    expect(merged[0]?.familySize).toBe(9);
  });
});

describe("nextCardNumber", () => {
  it("starts at 1 for an empty shift", () => {
    expect(nextCardNumber([])).toBe(1);
  });

  it("suggests one above the highest number", () => {
    expect(nextCardNumber([card({ number: 1 }), card({ id: 2, number: 7 })])).toBe(8);
  });
});

describe("distributionQueue", () => {
  it("shows only called and confirmed cards", () => {
    const queue = distributionQueue([
      card({ id: 1, number: 1, status: "entered" }),
      card({ id: 2, number: 2, status: "called" }),
      card({ id: 3, number: 3, status: "confirmed" }),
      card({ id: 4, number: 4, status: "distributed" }),
    ]);
    expect(queue.map((c) => c.number)).toEqual([2, 3]);
  });
});
