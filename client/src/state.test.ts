import { describe, expect, it } from "vitest";
import type { Card } from "../../server/cards.js";
import { ApiError, NetworkError } from "./api.js";
import type { ShiftWithCards } from "./types.js";
import {
  applyLiveMessage,
  applyToShift,
  classifyLoadFailure,
  distributionQueue,
  hasWeight,
  isoDate,
  missingBeforeDistribution,
  mergeCard,
  nextCardNumber,
  parseLoads,
} from "./state.js";

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
    extrasAdded: false,
    extrasNote: "",
    intakeInitials: "AB",
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

describe("isoDate", () => {
  it("formats the local date with leading zeros", () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("parseLoads", () => {
  it("turns blank fields into empty loads", () => {
    expect(parseLoads(["12.5", "", " "])).toEqual([12.5, null, null]);
  });

  it("keeps a typed zero as a weight", () => {
    expect(parseLoads(["0", "", ""])).toEqual([0, null, null]);
  });
});

describe("hasWeight", () => {
  it("is false when every load is empty", () => {
    expect(hasWeight([null, null, null])).toBe(false);
  });

  it("is true when a zero was typed", () => {
    expect(hasWeight([0, null, null])).toBe(true);
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

  it("leaves out partner cards", () => {
    const queue = distributionQueue([
      card({ id: 1, number: 1, status: "called" }),
      card({ id: 2, number: 2, status: "called", arrivalMethod: "DD", intakeInitials: null }),
      card({ id: 3, number: 3, status: "confirmed", arrivalMethod: "HH", intakeInitials: null }),
    ]);
    expect(queue.map((c) => c.number)).toEqual([1]);
  });
});

describe("missingBeforeDistribution", () => {
  it("names each shown cart without a weight", () => {
    const missing = missingBeforeDistribution(card({ tefapBags: 3 }), [12, null, null], false);
    expect(missing).toEqual(["Cart 2 has no weight.", "Cart 3 has no weight."]);
  });

  it("ignores carts the Family does not get", () => {
    expect(missingBeforeDistribution(card({ tefapBags: 1 }), [8, null, null], false)).toEqual([]);
  });

  it("counts a typed zero as a weight", () => {
    expect(missingBeforeDistribution(card({ tefapBags: 1 }), [0, null, null], false)).toEqual([]);
  });

  it("asks about extras only for sizes that need the check", () => {
    const five = card({ familySize: 5, tefapBags: 2 });
    expect(missingBeforeDistribution(five, [5, 6, null], false)).toEqual([
      "Extras added is not ticked.",
    ]);
    expect(missingBeforeDistribution(five, [5, 6, null], true)).toEqual([]);
    const eight = card({ familySize: 8, tefapBags: 2 });
    expect(missingBeforeDistribution(eight, [5, 6, null], false)).toEqual([]);
  });

  it("follows an override of the bags", () => {
    const missing = missingBeforeDistribution(card({ tefapBags: 2 }), [4, null, null], false);
    expect(missing).toEqual(["Cart 2 has no weight."]);
  });
});

describe("classifyLoadFailure", () => {
  const refused = (status: number) => new ApiError(status, {});

  it("treats 404 as no shift opened yet", () => {
    expect(classifyLoadFailure(refused(404))).toBe("no-shift");
  });

  it("signs out on 401", () => {
    expect(classifyLoadFailure(refused(401))).toBe("sign-out");
  });

  it("treats an unreachable server as offline", () => {
    expect(classifyLoadFailure(new NetworkError())).toBe("offline");
  });

  it.each([408, 429, 500, 502, 503])("treats %i as offline, as the outbox does", (status) => {
    expect(classifyLoadFailure(refused(status))).toBe("offline");
  });

  it("treats an answer that is not a shift at all, such as a captive portal's page, as offline", () => {
    expect(classifyLoadFailure(new SyntaxError("Unexpected token '<'"))).toBe("offline");
  });

  it.each([400, 403])("shows a notice for other refusals such as %i", (status) => {
    expect(classifyLoadFailure(refused(status))).toBe("notice");
  });
});

function shiftWith(cards: Card[]): ShiftWithCards {
  return { id: 1, date: "2026-11-07", status: "open", cards, returnedBatches: [] };
}

describe("applyToShift", () => {
  it("patches the shift it is given the id of", () => {
    const patched = applyToShift(shiftWith([]), 1, (shift) => ({ ...shift, status: "closed" }));
    expect(patched?.status).toBe("closed");
  });

  it("leaves a different shift untouched", () => {
    const shift = shiftWith([]);
    expect(applyToShift(shift, 2, (other) => ({ ...other, status: "closed" }))).toBe(shift);
  });

  it("passes through a station that has no shift", () => {
    expect(applyToShift(null, 1, (shift) => shift)).toBeNull();
    expect(applyToShift(undefined, 1, (shift) => shift)).toBeUndefined();
  });
});

describe("applyLiveMessage", () => {
  it("merges a card, keeping the newer revision", () => {
    const shift = shiftWith([card({ id: 1, revision: 2, familySize: 5 })]);
    const stale = applyLiveMessage(shift, {
      type: "card",
      card: card({ id: 1, revision: 1, familySize: 9 }),
    });
    expect(stale?.cards[0]?.familySize).toBe(5);

    const added = applyLiveMessage(shift, { type: "card", card: card({ id: 2, number: 2 }) });
    expect(added?.cards.map((c) => c.id)).toEqual([1, 2]);
  });

  it("removes a deleted card", () => {
    const shift = shiftWith([card({ id: 1 }), card({ id: 2, number: 2 })]);
    const result = applyLiveMessage(shift, { type: "card-deleted", shiftId: 1, cardId: 1 });
    expect(result?.cards.map((c) => c.id)).toEqual([2]);
  });

  it("takes the status of a shift that was closed elsewhere", () => {
    const shift = shiftWith([card({})]);
    const result = applyLiveMessage(shift, {
      type: "shift",
      shift: { id: 1, date: "2026-11-07", status: "closed" },
    });
    expect(result).toMatchObject({ status: "closed", cards: shift.cards });
  });

  it("replaces the returned batches", () => {
    const batches = [{ id: 1, shiftId: 1, weight: 12 }];
    const result = applyLiveMessage(shiftWith([]), {
      type: "batches",
      shiftId: 1,
      returnedBatches: batches,
    });
    expect(result?.returnedBatches).toEqual(batches);
  });

  it("ignores a message about another shift", () => {
    const shift = shiftWith([card({ id: 1 })]);
    expect(applyLiveMessage(shift, { type: "card", card: card({ id: 2, shiftId: 2 }) })).toBe(
      shift,
    );
    expect(applyLiveMessage(shift, { type: "card-deleted", shiftId: 2, cardId: 1 })).toBe(shift);
    expect(applyLiveMessage(shift, { type: "batches", shiftId: 2, returnedBatches: [] })).toBe(
      shift,
    );
  });

  it("does nothing while the station has no shift", () => {
    const message = { type: "card", card: card({}) } as const;
    expect(applyLiveMessage(null, message)).toBeNull();
    expect(applyLiveMessage(undefined, message)).toBeUndefined();
  });
});
