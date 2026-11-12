import { describe, expect, it } from "vitest";
import type { Card } from "../../server/cards.js";
import {
  EMPTY_FORM,
  EMPTY_PARTNER_FORM,
  frontDeskView,
  isEmpty,
  partnerFormView,
  prepareCard,
  preparePartnerCard,
} from "./forms.js";
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

describe("partnerFormView", () => {
  const sized = (familySize: string) => ({ ...EMPTY_PARTNER_FORM, familySize });
  const shift = shiftView([card({})]);

  it("expects nothing until a family size is typed", () => {
    expect(partnerFormView(sized(""), shift)).toMatchObject({
      size: 0,
      bags: 0,
      carts: 0,
      checkExtras: false,
    });
  });

  it("gives a family of four one bag, one cart and no extras check", () => {
    expect(partnerFormView(sized("4"), shift)).toMatchObject({
      size: 4,
      bags: 1,
      carts: 1,
      checkExtras: false,
    });
  });

  it("gives a family just past four people a second cart and an extras check", () => {
    expect(partnerFormView(sized("6"), shift)).toMatchObject({
      bags: 2,
      carts: 2,
      checkExtras: true,
    });
  });

  it("asks for no extras check at a full cart", () => {
    expect(partnerFormView(sized("8"), shift).checkExtras).toBe(false);
  });

  it("suggests the number after every card, including those waiting to send", () => {
    const view = partnerFormView(
      EMPTY_PARTNER_FORM,
      shiftView([card({ number: 4 })], [pendingCard({ number: 6 })]),
    );
    expect(view.suggested).toBe(7);
  });

  it("counts only partner cards, saved and waiting", () => {
    const view = partnerFormView(
      EMPTY_PARTNER_FORM,
      shiftView(
        [card({ id: 1, number: 1 }), card({ id: 2, number: 2, arrivalMethod: "DD" })],
        [pendingCard({ id: "p1", number: 3, arrivalMethod: "HH" }), pendingCard({ number: 4 })],
      ),
    );
    expect(view.partnerCards.map((c) => c.number)).toEqual([2]);
    expect(view.pendingPartnerCards.map((c) => c.number)).toEqual([3]);
    expect(view.count).toBe(2);
  });
});

describe("preparePartnerCard", () => {
  const filled = {
    ...EMPTY_PARTNER_FORM,
    partner: "DD" as const,
    number: "9",
    familySize: "4",
    seniorBox: true,
    loads: ["30", "12", ""],
  };

  it("asks for a partner first", () => {
    expect(preparePartnerCard({ ...filled, partner: null }, 3)).toEqual({
      ok: false,
      error: "Choose a partner.",
    });
  });

  it("builds the write, sending empty any cart the family does not get", () => {
    expect(preparePartnerCard(filled, 3)).toEqual({
      ok: true,
      write: {
        kind: "card-create",
        method: "POST",
        url: "/api/shifts/3/cards",
        label: "Door Dash card 9",
        body: {
          clientId: expect.any(String),
          number: 9,
          familySize: 4,
          arrivalMethod: "DD",
          seniorBox: true,
          cheese: false,
          other: "",
          loads: [30, null, null],
        },
      },
    });
  });

  it("sends the extras check only for a family that has one", () => {
    const extras = { extrasAdded: true, extrasNote: "deli meat" };
    const withCheck = preparePartnerCard({ ...filled, familySize: "6", ...extras }, 3);
    expect(withCheck.ok && withCheck.write.body).toMatchObject(extras);

    const withoutCheck = preparePartnerCard({ ...filled, ...extras }, 3);
    expect(withoutCheck.ok && withoutCheck.write.body).not.toHaveProperty("extrasAdded");
  });

  it("labels a Helping Hands card with its own name", () => {
    expect(preparePartnerCard({ ...filled, partner: "HH" }, 3)).toMatchObject({
      write: { label: "Helping Hands card 9" },
    });
  });
});
