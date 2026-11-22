import { describe, expect, it } from "vitest";
import type { DisplayCard } from "../../server/display.js";
import {
  applyDisplayMessage,
  GRACE_MS,
  isStale,
  queueView,
  rowsThatFit,
  screenFor,
  SILENT_LIMIT_MS,
} from "./display-state.js";
import type { DisplayShift } from "./display-state.js";

function card(overrides: Partial<DisplayCard>): DisplayCard {
  return {
    id: 1,
    number: 1,
    familySize: 4,
    arrivalMethod: "East",
    seniorBox: false,
    cheese: false,
    tefapBags: 1,
    status: "called",
    calledOrder: 1,
    revision: 1,
    ...overrides,
  };
}

const SHIFT: DisplayShift = { id: 7, date: "2026-11-07", status: "open", cards: [] };
const TODAY = "2026-11-07";

describe("applyDisplayMessage", () => {
  it("adds a card that enters the queue", () => {
    const next = applyDisplayMessage(SHIFT, { type: "card", card: card({ id: 3 }) }, TODAY);
    expect(next?.cards.map((c) => c.id)).toEqual([3]);
  });

  it("replaces a card with a newer revision, and ignores an older one", () => {
    const shift = { ...SHIFT, cards: [card({ id: 3, revision: 4, status: "confirmed" })] };
    const older = applyDisplayMessage(
      shift,
      { type: "card", card: card({ id: 3, revision: 3 }) },
      TODAY,
    );
    expect(older?.cards[0]?.status).toBe("confirmed");

    const newer = applyDisplayMessage(
      shift,
      { type: "card", card: card({ id: 3, revision: 5, status: "called" }) },
      TODAY,
    );
    expect(newer?.cards[0]?.status).toBe("called");
  });

  it("drops a card that leaves the queue", () => {
    const shift = { ...SHIFT, cards: [card({ id: 3 }), card({ id: 4, number: 2 })] };
    const next = applyDisplayMessage(shift, { type: "card-deleted", shiftId: 7, cardId: 3 }, TODAY);
    expect(next?.cards.map((c) => c.id)).toEqual([4]);
  });

  it("ignores a message about another shift's card", () => {
    const shift = { ...SHIFT, cards: [card({ id: 3 })] };
    const next = applyDisplayMessage(
      shift,
      { type: "card-deleted", shiftId: 99, cardId: 3 },
      TODAY,
    );
    expect(next).toBe(shift);
  });

  it("follows the shift closing", () => {
    const next = applyDisplayMessage(
      SHIFT,
      { type: "shift", shift: { id: 7, date: TODAY, status: "closed" } },
      TODAY,
    );
    expect(next?.status).toBe("closed");
  });

  it("starts today's shift when it opens, with nobody in the queue", () => {
    const next = applyDisplayMessage(
      null,
      { type: "shift", shift: { id: 8, date: TODAY, status: "open" } },
      TODAY,
    );
    expect(next).toEqual({ id: 8, date: TODAY, status: "open", cards: [] });
  });

  it("does not switch to a shift for another day", () => {
    const next = applyDisplayMessage(
      SHIFT,
      { type: "shift", shift: { id: 2, date: "2026-10-01", status: "open" } },
      TODAY,
    );
    expect(next).toBe(SHIFT);
  });

  it("leaves a shift that has not loaded yet alone", () => {
    expect(applyDisplayMessage(undefined, { type: "card", card: card({}) }, TODAY)).toBeUndefined();
    expect(applyDisplayMessage(null, { type: "card", card: card({}) }, TODAY)).toBeNull();
  });
});

describe("queueView", () => {
  it("puts confirmed families and called families in groups, each in the order they were called", () => {
    const view = queueView(
      [
        card({ id: 1, number: 1, status: "called", calledOrder: 3 }),
        card({ id: 2, number: 2, status: "confirmed", calledOrder: 2 }),
        card({ id: 3, number: 3, status: "called", calledOrder: 1 }),
        card({ id: 4, number: 4, status: "confirmed", calledOrder: 4 }),
      ],
      10,
    );
    expect(view.confirmed.shown.map((c) => c.number)).toEqual([2, 4]);
    expect(view.called.shown.map((c) => c.number)).toEqual([3, 1]);
  });

  it("shows everyone when they all fit", () => {
    const cards = [card({ id: 1 }), card({ id: 2, number: 2, calledOrder: 2 })];
    const view = queueView(cards, 2);
    expect(view.called).toMatchObject({ total: 2, hidden: 0 });
    expect(view.called.shown).toHaveLength(2);
  });

  it("gives the last place to a count of those waiting longer, never hiding the front", () => {
    const cards = [1, 2, 3, 4, 5].map((n) => card({ id: n, number: n, calledOrder: n }));
    const view = queueView(cards, 3);
    expect(view.called.shown.map((c) => c.number)).toEqual([1, 2]);
    expect(view.called).toMatchObject({ total: 5, hidden: 3 });
  });

  it("always shows at least one family", () => {
    const cards = [1, 2, 3].map((n) => card({ id: n, number: n, calledOrder: n }));
    expect(queueView(cards, 1).called.shown.map((c) => c.number)).toEqual([1]);
    expect(queueView(cards, 0).called.shown.map((c) => c.number)).toEqual([1]);
  });

  it("counts a group with nobody in it", () => {
    expect(queueView([], 5).confirmed).toEqual({ shown: [], hidden: 0, total: 0 });
  });
});

describe("rowsThatFit", () => {
  it("counts whole rows", () => {
    expect(rowsThatFit(700, 100)).toBe(7);
    expect(rowsThatFit(799, 100)).toBe(7);
  });

  it("is at least one, even before anything has been measured", () => {
    expect(rowsThatFit(0, 100)).toBe(1);
    expect(rowsThatFit(500, 0)).toBe(1);
  });
});

describe("isStale", () => {
  const start = 1_000_000;

  it("is not stale while connected and recently updated", () => {
    expect(isStale({ lostSince: null, lastHeard: start, now: start + 30_000 })).toBe(false);
  });

  it("forgives a short break in the connection", () => {
    expect(isStale({ lostSince: start, lastHeard: start - 5_000, now: start + GRACE_MS - 1 })).toBe(
      false,
    );
  });

  it("is stale once the connection has been gone for the grace period", () => {
    expect(isStale({ lostSince: start, lastHeard: start - 5_000, now: start + GRACE_MS })).toBe(
      true,
    );
  });

  it("is stale if nothing has been heard for too long, even with no break reported", () => {
    expect(isStale({ lostSince: null, lastHeard: start, now: start + SILENT_LIMIT_MS })).toBe(true);
  });
});

describe("screenFor", () => {
  const open = { ...SHIFT, cards: [card({})] };

  it("hides everything when stale, whatever the shift", () => {
    expect(screenFor(open, true)).toBe("offline");
    expect(screenFor(undefined, true)).toBe("offline");
  });

  it("waits for the first load", () => {
    expect(screenFor(undefined, false)).toBe("loading");
  });

  it("says when no shift is open", () => {
    expect(screenFor(null, false)).toBe("no-shift");
  });

  it("says when the shift is closed", () => {
    expect(screenFor({ ...open, status: "closed" }, false)).toBe("closed");
  });

  it("says when nobody is waiting", () => {
    expect(screenFor({ ...SHIFT, cards: [] }, false)).toBe("empty");
  });

  it("shows the queue when there is one", () => {
    expect(screenFor(open, false)).toBe("queue");
  });
});
