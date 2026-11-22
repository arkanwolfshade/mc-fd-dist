import type { FastifyInstance } from "fastify";
import type { Card, Shift } from "./cards.js";
import { findShiftByDate, listCards } from "./cards.js";
import { DATE_OBJECT } from "./card-routes.js";
import type { CardRouteContext, LiveMessage } from "./card-routes.js";
import { byCallOrder, inDistributionQueue } from "./rules.js";
import type { ArrivalMethod, CardStatus } from "./rules.js";

// What the wall display is told about a Family: enough to stage the right carts, and nothing that
// says who they are. No initials, no notes, no weights. See ADR 0002, 0024 and 0033.
export interface DisplayCard {
  id: number;
  number: number;
  familySize: number;
  arrivalMethod: ArrivalMethod;
  seniorBox: boolean;
  cheese: boolean;
  tefapBags: number;
  status: CardStatus;
  calledOrder: number | null;
  revision: number;
}

export type DisplayMessage =
  | { type: "card"; card: DisplayCard }
  | { type: "card-deleted"; shiftId: number; cardId: number }
  | { type: "shift"; shift: Shift };

// The routes a display may use, and the only ones: everything else under /api is closed to it,
// including routes written later.
export const DISPLAY_ROUTES: ReadonlySet<string> = new Set([
  "/api/login",
  "/api/logout",
  "/api/live",
  "/api/me",
  "/api/health",
  "/api/display",
]);

export function toDisplayCard(card: Card): DisplayCard {
  return {
    id: card.id,
    number: card.number,
    familySize: card.familySize,
    arrivalMethod: card.arrivalMethod,
    seniorBox: card.seniorBox,
    cheese: card.cheese,
    tefapBags: card.tefapBags,
    status: card.status,
    calledOrder: card.calledOrder,
    revision: card.revision,
  };
}

// The families waiting in the queue, in the order they were called.
export function displayQueue(cards: Card[]): DisplayCard[] {
  return cards.filter(inDistributionQueue).sort(byCallOrder).map(toDisplayCard);
}

// What a display hears of a change, or null when it hears nothing. A card that is not (or is no
// longer) in the queue is announced as gone, not sent, so the display never holds its details.
export function displayMessage(message: LiveMessage): DisplayMessage | null {
  if (message.type === "batches") return null;
  if (message.type !== "card") return message;
  return inDistributionQueue(message.card)
    ? { type: "card", card: toDisplayCard(message.card) }
    : { type: "card-deleted", shiftId: message.card.shiftId, cardId: message.card.id };
}

export function registerDisplayRoutes(app: FastifyInstance, context: CardRouteContext): void {
  const { db, requireRole } = context;

  app.get<{ Querystring: { date: string } }>(
    "/api/display",
    { preHandler: requireRole("display"), schema: { querystring: DATE_OBJECT } },
    async (request, reply) => {
      const shift = findShiftByDate(db, request.query.date);
      if (!shift) {
        return reply.code(404).send({ error: "No shift for that date" });
      }
      return { ...shift, cards: displayQueue(listCards(db, shift.id)) };
    },
  );
}
