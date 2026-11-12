import { describe, expect, it } from "vitest";
import type { Card } from "../../server/cards.js";
import { EMPTY_FORM, frontDeskView, isEmpty, prepareCard } from "./forms.js";
import type { PendingCard, ShiftView } from "./pending.js";

function card(overrides: Partial<Card>): Card {
  return {
    id: 1,
    shiftId: 3,
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

function pendingCard(overrides: Partial<PendingCard>): PendingCard {
  return {
    id: "pending-1",
    number: 1,
    familySize: 2,
    arrivalMethod: "Walk",
    seniorBox: false,
    cheese: false,
    tefapBags: 1,
    loads: [null, null, null],
    ...overrides,
  };
}

function shiftView(cards: Card[], pendingCards: PendingCard[] = []): ShiftView {
  return {
    id: 3,
    date: "2026-11-12",
    status: "open",
    cards,
    returnedBatches: [],
    pendingCards,
    pendingReturned: [],
  };
}

describe("isEmpty", () => {
  it("is true for a form nothing has been typed into", () => {
    expect(isEmpty(EMPTY_FORM)).toBe(true);
  });

  it("is false once any field has something in it", () => {
    expect(isEmpty({ ...EMPTY_FORM, other: "stroller" })).toBe(false);
    expect(isEmpty({ ...EMPTY_FORM, method: "Walk" })).toBe(false);
    expect(isEmpty({ ...EMPTY_FORM, seniorBox: true })).toBe(false);
  });
});

describe("frontDeskView", () => {
  it("suggests the number after every card, waiting card and card still saving", () => {
    const view = frontDeskView(shiftView([card({ number: 4 })], [pendingCard({ number: 6 })]), [8]);
    expect(view.suggested).toBe(9);
  });

  it("counts partner cards toward the next number but leaves them out of the lists", () => {
    const view = frontDeskView(
      shiftView(
        [card({ id: 1, number: 1 }), card({ id: 2, number: 2, arrivalMethod: "DD" })],
        [pendingCard({ number: 3, arrivalMethod: "HH" }), pendingCard({ id: "p2", number: 4 })],
      ),
      [],
    );
    expect(view.suggested).toBe(5);
    expect(view.cards.map((c) => c.number)).toEqual([1]);
    expect(view.pendingCards.map((c) => c.number)).toEqual([4]);
  });

  it("lists each set of intake initials once, in order", () => {
    const view = frontDeskView(
      shiftView([
        card({ id: 1, intakeInitials: "PT" }),
        card({ id: 2, number: 2, intakeInitials: "AB" }),
        card({ id: 3, number: 3, intakeInitials: "PT" }),
        card({ id: 4, number: 4, intakeInitials: "" }),
      ]),
      [],
    );
    expect(view.knownInitials).toEqual(["AB", "PT"]);
  });
});

describe("prepareCard", () => {
  const filled = {
    ...EMPTY_FORM,
    familySize: "4",
    method: "Walk" as const,
    initials: "ab",
    seniorBox: true,
    cheese: true,
    other: "stroller",
  };

  it("asks for a location or transport first", () => {
    expect(prepareCard({ ...filled, method: null }, 3, 7)).toEqual({
      ok: false,
      error: "Choose the Family's location or transport.",
    });
  });

  it("asks who the Family's details came from", () => {
    expect(prepareCard({ ...filled, initials: "" }, 3, 7)).toEqual({
      ok: false,
      error: "Choose who the Family's details came from.",
    });
    expect(prepareCard({ ...filled, initials: "A1" }, 3, 7)).toMatchObject({ ok: false });
  });

  it("builds the write for the suggested number", () => {
    const prepared = prepareCard(filled, 3, 7);
    expect(prepared).toEqual({
      ok: true,
      cardNumber: 7,
      label: "Card 7 (Family of 4, Walk)",
      write: {
        kind: "card-create",
        method: "POST",
        url: "/api/shifts/3/cards",
        label: "Card 7 (Family of 4, Walk)",
        body: {
          clientId: expect.any(String),
          number: 7,
          familySize: 4,
          arrivalMethod: "Walk",
          intakeInitials: "AB",
          seniorBox: true,
          cheese: true,
          other: "stroller",
        },
      },
      saved: { number: 7, familySize: 4, arrivalMethod: "Walk", seniorBox: true, cheese: true },
    });
  });

  it("uses the number typed in place of the suggestion", () => {
    expect(prepareCard({ ...filled, number: "12" }, 3, 7)).toMatchObject({
      ok: true,
      cardNumber: 12,
      label: "Card 12 (Family of 4, Walk)",
    });
  });

  it("gives each write its own client ID, so a retry can be told from a new card", () => {
    const first = prepareCard(filled, 3, 7);
    const second = prepareCard(filled, 3, 7);
    expect(first.ok && second.ok && first.write.body.clientId).not.toBe(
      second.ok && second.write.body.clientId,
    );
  });
});
