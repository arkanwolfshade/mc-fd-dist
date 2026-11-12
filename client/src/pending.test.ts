import { describe, expect, it } from "vitest";
import { withPending } from "./pending.js";
import type { QueuedWrite } from "./outbox.js";
import type { Card, ShiftWithCards } from "./types.js";

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 5,
    shiftId: 1,
    number: 3,
    familySize: 3,
    arrivalMethod: "East",
    seniorBox: false,
    cheese: false,
    other: "",
    tefapBags: 1,
    tefapOverride: false,
    status: "called",
    loads: [null, null, null],
    totalWeight: 0,
    revision: 2,
    extrasAdded: false,
    extrasNote: "",
    intakeInitials: "AB",
    ...overrides,
  };
}

function shift(cards: Card[]): ShiftWithCards {
  return {
    id: 1,
    date: "2026-11-07",
    status: "open",
    cards,
    returnedBatches: [],
  };
}

function update(body: object, cardId = 5): QueuedWrite {
  return {
    id: crypto.randomUUID(),
    kind: "card-update",
    method: "PATCH",
    url: `/api/cards/${cardId}`,
    cardId,
    body: { revision: 2, ...body },
    label: "Card",
  };
}

describe("withPending", () => {
  it("returns the shift unchanged when nothing is waiting", () => {
    const view = withPending(shift([card()]), []);
    expect(view.cards[0]?.status).toBe("called");
    expect(view.pendingCards).toEqual([]);
  });

  it("shows a waiting change on its card and keeps the server revision", () => {
    const view = withPending(shift([card()]), [update({ status: "confirmed" })]);
    expect(view.cards[0]).toMatchObject({ status: "confirmed", revision: 2 });
  });

  it("applies several waiting changes in order", () => {
    const view = withPending(shift([card()]), [
      update({ status: "confirmed" }),
      update({ status: "distributed", loads: [12.5, 8, null] }),
    ]);
    expect(view.cards[0]).toMatchObject({
      status: "distributed",
      loads: [12.5, 8, null],
      totalWeight: 20.5,
    });
  });

  it("recalculates TEFAP bags when a waiting change alters family size", () => {
    const view = withPending(shift([card()]), [update({ familySize: 9 })]);
    expect(view.cards[0]?.tefapBags).toBe(3);
  });

  it("leaves a TEFAP override alone", () => {
    const view = withPending(shift([card({ tefapOverride: true, tefapBags: 0 })]), [
      update({ familySize: 9 }),
    ]);
    expect(view.cards[0]?.tefapBags).toBe(0);
  });

  it("lists waiting new cards separately, with TEFAP bags calculated", () => {
    const view = withPending(shift([]), [
      {
        id: "x",
        kind: "card-create",
        method: "POST",
        url: "/api/shifts/1/cards",
        body: { clientId: "c", number: 8, familySize: 5, arrivalMethod: "Bus" },
        label: "Card 8",
      },
    ]);
    expect(view.cards).toEqual([]);
    expect(view.pendingCards).toMatchObject([{ number: 8, familySize: 5, tefapBags: 2 }]);
  });

  it("lists waiting returned batches, and partner Families as waiting cards", () => {
    const view = withPending(shift([]), [
      {
        id: "x",
        kind: "returned",
        method: "POST",
        url: "/api/shifts/1/returned-batches",
        body: { clientId: "r", weight: 3.5 },
        label: "Returned",
      },
      {
        id: "y",
        kind: "card-create",
        method: "POST",
        url: "/api/shifts/1/cards",
        body: { clientId: "p", number: 60, familySize: 9, arrivalMethod: "DD", loads: [9, 8, 7] },
        label: "Door Dash card 60",
      },
    ]);
    expect(view.pendingReturned).toMatchObject([{ weight: 3.5 }]);
    expect(view.pendingCards).toMatchObject([
      { number: 60, arrivalMethod: "DD", tefapBags: 3, loads: [9, 8, 7] },
    ]);
  });
});
