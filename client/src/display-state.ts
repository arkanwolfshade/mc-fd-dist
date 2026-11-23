import type { DisplayCard, DisplayMessage } from "../../server/display.js";
import { byCallOrder } from "../../server/rules.js";

// What the wall display knows of today's shift: only the families in the queue. See ADR 0033.
export interface DisplayShift {
  id: number;
  date: string;
  status: "open" | "closed";
  cards: DisplayCard[];
}

// null means no shift has been opened today; undefined means it hasn't loaded yet.
export type KnownDisplayShift = DisplayShift | null | undefined;

// How a change reaches the shift on screen. A card is only replaced by a newer revision, because
// updates can arrive out of order, and a change about another shift cannot touch today's.
export function applyDisplayMessage(
  shift: KnownDisplayShift,
  message: DisplayMessage,
  today: string,
): KnownDisplayShift {
  if (message.type === "shift") {
    const { shift: incoming } = message;
    if (incoming.date !== today) return shift;
    if (shift && shift.id === incoming.id) return { ...shift, status: incoming.status };
    return { ...incoming, cards: [] };
  }
  if (!shift) return shift;
  if (message.type === "card-deleted") {
    return shift.id === message.shiftId
      ? { ...shift, cards: shift.cards.filter((card) => card.id !== message.cardId) }
      : shift;
  }
  const existing = shift.cards.find((card) => card.id === message.card.id);
  if (existing && existing.revision >= message.card.revision) return shift;
  return {
    ...shift,
    cards: [...shift.cards.filter((card) => card.id !== message.card.id), message.card],
  };
}

// The queue as a reload answered it, with what the wall heard while it waited put back on top.
// The server read its state when the request arrived, so a change announced in the meantime may be
// newer than the answer, and replacing the screen with the answer would erase it. Applying each
// message again is safe, because a card only replaces one of an older revision.
export function settleLoad(
  loaded: DisplayShift,
  heardDuringLoad: readonly DisplayMessage[],
  today: string,
): DisplayShift {
  let settled: KnownDisplayShift = loaded;
  for (const message of heardDuringLoad) {
    settled = applyDisplayMessage(settled, message, today);
  }
  return settled as DisplayShift;
}

export interface QueueGroup {
  shown: DisplayCard[];
  // Families further back that there is no room to show.
  hidden: number;
  total: number;
}

export interface QueueView {
  // Being packed now.
  confirmed: QueueGroup;
  // On their way.
  called: QueueGroup;
}

function group(cards: DisplayCard[], capacity: number): QueueGroup {
  const ordered = [...cards].sort(byCallOrder);
  if (ordered.length <= capacity) return { shown: ordered, hidden: 0, total: ordered.length };
  // The last place on screen says how many more are waiting, so the front of the queue is always
  // the part shown. At least one family is always shown.
  const shown = ordered.slice(0, Math.max(1, capacity - 1));
  return { shown, hidden: ordered.length - shown.length, total: ordered.length };
}

export function queueView(cards: DisplayCard[], capacity: number): QueueView {
  return {
    confirmed: group(
      cards.filter((card) => card.status === "confirmed"),
      capacity,
    ),
    called: group(
      cards.filter((card) => card.status === "called"),
      capacity,
    ),
  };
}

// Whole rows that fit in a space, and at least one.
export function rowsThatFit(spaceHeight: number, rowHeight: number): number {
  if (spaceHeight <= 0 || rowHeight <= 0) return 1;
  return Math.max(1, Math.floor(spaceHeight / rowHeight));
}

// How long a break in the connection is forgiven before the queue is hidden, so that a blip of
// Wi-Fi does not blank the wall.
export const GRACE_MS = 20 * 1000;
// The longest the wall can go without a successful load before it stops trusting itself. The
// screen reloads every 30 seconds, so this is two missed reloads, which also catches a
// connection that has stopped delivering without reporting that it closed.
export const SILENT_LIMIT_MS = 70 * 1000;

// Whether the queue on screen can no longer be relied on. Nobody stands at the wall to notice
// a small warning, so a stale queue is hidden, not marked.
export function isStale(state: {
  lostSince: number | null;
  lastHeard: number;
  now: number;
}): boolean {
  const gone = state.lostSince !== null && state.now - state.lostSince >= GRACE_MS;
  return gone || state.now - state.lastHeard >= SILENT_LIMIT_MS;
}

export type DisplayScreen = "offline" | "loading" | "no-shift" | "closed" | "empty" | "queue";

export function screenFor(shift: KnownDisplayShift, stale: boolean): DisplayScreen {
  if (stale) return "offline";
  if (shift === undefined) return "loading";
  if (shift === null) return "no-shift";
  if (shift.status === "closed") return "closed";
  return shift.cards.length === 0 ? "empty" : "queue";
}
