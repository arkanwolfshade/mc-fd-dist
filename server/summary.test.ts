import { describe, expect, it } from "vitest";
import { roundWeight, shiftSummary } from "./summary.js";
import type { SummaryCard } from "./summary.js";

function card(overrides: Partial<SummaryCard> & { familySize?: number } = {}): SummaryCard {
  return {
    arrivalMethod: "Walk",
    seniorBox: false,
    cheese: false,
    tefapBags: 1,
    status: "entered",
    loads: [null, null, null],
    ...overrides,
  };
}

// A Door Dash or Helping Hands Family, entered at the end of a shift. See ADR 0023.
function partnerCard(overrides: Partial<SummaryCard> = {}): SummaryCard {
  return card({ arrivalMethod: "DD", status: "distributed", ...overrides });
}

describe("roundWeight", () => {
  it("removes floating point noise from a sum", () => {
    expect(roundWeight(0.1 + 0.2)).toBe(0.3);
  });
});

describe("shiftSummary", () => {
  it("returns zeros for an empty shift", () => {
    expect(shiftSummary([], [])).toEqual({
      families: { total: 0, cards: 0, partners: 0, left: 0 },
      weight: { total: 0, cards: 0, partners: 0 },
      returnedWeight: 0,
      netWeight: 0,
      tefapBags: 0,
      seniorBoxes: 0,
      cheese: 0,
      distributedWithoutWeight: 0,
    });
  });

  it("leaves out families who left without food, and counts them separately", () => {
    const summary = shiftSummary(
      [
        card({ status: "distributed", tefapBags: 2, seniorBox: true, loads: [10, null, null] }),
        card({
          status: "left",
          tefapBags: 3,
          seniorBox: true,
          cheese: true,
          loads: [5, null, null],
        }),
        partnerCard({ loads: [40, null, null] }),
      ],
      [],
    );
    expect(summary).toMatchObject({
      families: { total: 2, cards: 1, partners: 1, left: 1 },
      weight: { total: 50, cards: 10, partners: 40 },
      netWeight: 50,
      tefapBags: 3,
      seniorBoxes: 1,
      cheese: 0,
    });
  });

  it("counts each card as one family regardless of family size", () => {
    const summary = shiftSummary([card({ familySize: 5 }), card({ familySize: 2 })], []);
    expect(summary.families.cards).toBe(2);
  });

  it("counts Door Dash and Helping Hands cards as partner Families and shows the split", () => {
    const summary = shiftSummary([card(), partnerCard(), partnerCard({ arrivalMethod: "HH" })], []);
    expect(summary.families).toEqual({ total: 3, cards: 1, partners: 2, left: 0 });
  });

  it("adds partner cart weight to the total and shows the split", () => {
    const summary = shiftSummary(
      [card({ loads: [12.5, 8, null] }), partnerCard({ loads: [6, 4, null] })],
      [],
    );
    expect(summary.weight).toEqual({ total: 30.5, cards: 20.5, partners: 10 });
  });

  it("subtracts returned batches only from net weight", () => {
    const summary = shiftSummary(
      [card({ loads: [30, null, null] })],
      [{ weight: 4.5 }, { weight: 0.5 }],
    );
    expect(summary.weight.total).toBe(30);
    expect(summary.returnedWeight).toBe(5);
    expect(summary.netWeight).toBe(25);
  });

  it("totals TEFAP bags, senior boxes and cheese across walk-in and partner cards", () => {
    const summary = shiftSummary(
      [
        card({ tefapBags: 2, seniorBox: true, cheese: true }),
        card({ tefapBags: 3, seniorBox: true }),
        partnerCard({ tefapBags: 1, seniorBox: true }),
      ],
      [],
    );
    expect(summary).toMatchObject({ tefapBags: 6, seniorBoxes: 3, cheese: 1 });
  });

  it("counts distributed cards that have no weight", () => {
    const summary = shiftSummary(
      [
        card({ status: "distributed" }),
        card({ status: "distributed", loads: [5, null, null] }),
        card({ status: "confirmed" }),
        partnerCard(),
      ],
      [],
    );
    expect(summary.distributedWithoutWeight).toBe(2);
  });

  it("treats a recorded weight of zero as a weight", () => {
    const summary = shiftSummary([card({ status: "distributed", loads: [0, null, null] })], []);
    expect(summary.distributedWithoutWeight).toBe(0);
  });
});
