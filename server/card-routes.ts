import type { Database } from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Account, Role } from "./accounts.js";
import { listReturnedBatches } from "./batches.js";
import type { ReturnedBatch } from "./batches.js";
import {
  bagsAfter,
  createCard,
  createShift,
  deleteCard,
  findCard,
  findCardByClientId,
  findShift,
  findShiftByDate,
  listCards,
  newCardBags,
  updateCard,
} from "./cards.js";
import type { Card, CardChanges, NewCard, Shift } from "./cards.js";
import {
  ALL_ARRIVAL_METHODS,
  ALL_CARD_STATUSES,
  breaksCheeseRule,
  canChangeStatus,
  cartCount,
  cartRule,
  CHEESE_RULE,
  fitsCarts,
  INITIALS_RULE,
  isPartnerMethod,
  normalizeInitials,
} from "./rules.js";
import { shiftSummary } from "./summary.js";

const CARD_DETAIL_PROPERTIES = {
  number: { type: "integer", minimum: 1 },
  familySize: { type: "integer", minimum: 1, maximum: 100 },
  arrivalMethod: { type: "string", enum: ALL_ARRIVAL_METHODS },
  seniorBox: { type: "boolean" },
  cheese: { type: "boolean" },
  other: { type: "string", maxLength: 500 },
  extrasAdded: { type: "boolean" },
  extrasNote: { type: "string", maxLength: 200 },
} as const;

const LOADS = {
  type: "array",
  maxItems: 3,
  items: { type: ["number", "null"], minimum: 0 },
} as const;

export interface CardRouteContext {
  db: Database;
  currentAccount: (request: FastifyRequest) => Account | null;
  requireRole: (
    ...roles: Role[]
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  broadcast: (message: LiveMessage) => void;
  closeEndedSockets: () => void;
  audit: (request: FastifyRequest, action: string, detail?: object) => void;
}

export type LiveMessage =
  | { type: "card"; card: Card }
  | { type: "card-deleted"; shiftId: number; cardId: number }
  | { type: "shift"; shift: Shift }
  | { type: "batches"; shiftId: number; returnedBatches: ReturnedBatch[] };

export function registerCardRoutes(app: FastifyInstance, context: CardRouteContext): void {
  const { db, currentAccount, requireRole, broadcast, audit } = context;

  app.post<{ Body: { date: string } }>(
    "/api/shifts",
    {
      preHandler: requireRole(),
      schema: {
        body: {
          type: "object",
          required: ["date"],
          properties: { date: { type: "string", format: "date" } },
        },
      },
    },
    async (request, reply) => {
      const shift = createShift(db, request.body.date);
      if (shift === "duplicate") {
        return reply.code(409).send({ error: "A shift already exists for that date" });
      }
      audit(request, "shift.open", { date: shift.date });
      broadcast({ type: "shift", shift });
      return reply.code(201).send(shift);
    },
  );

  app.get<{ Querystring: { date: string } }>(
    "/api/shifts",
    {
      preHandler: requireRole(),
      schema: {
        querystring: {
          type: "object",
          required: ["date"],
          properties: { date: { type: "string", format: "date" } },
        },
      },
    },
    async (request, reply) => {
      const shift = findShiftByDate(db, request.query.date);
      if (!shift) {
        return reply.code(404).send({ error: "No shift for that date" });
      }
      const cards = listCards(db, shift.id);
      const returnedBatches = listReturnedBatches(db, shift.id);
      return {
        ...shift,
        cards,
        returnedBatches,
        summary: shiftSummary(cards, returnedBatches),
      };
    },
  );

  // The front desk enters walk-in Families. Distribution enters Door Dash and Helping Hands
  // Families at the end of a shift, already served. See ADR 0023.
  app.post<{ Params: { shiftId: number }; Body: NewCard }>(
    "/api/shifts/:shiftId/cards",
    {
      preHandler: requireRole(),
      schema: {
        params: {
          type: "object",
          properties: { shiftId: { type: "integer" } },
        },
        body: {
          type: "object",
          required: ["clientId", "number", "familySize", "arrivalMethod"],
          properties: {
            clientId: { type: "string", minLength: 1, maxLength: 100 },
            ...CARD_DETAIL_PROPERTIES,
            seniorBox: { type: "boolean", default: false },
            cheese: { type: "boolean", default: false },
            other: { type: "string", maxLength: 500, default: "" },
            tefapBags: { type: "integer", minimum: 0, maximum: 20 },
            intakeInitials: { type: "string", maxLength: 10 },
            loads: LOADS,
          },
        },
      },
    },
    async (request, reply) => {
      const account = currentAccount(request) as Account;
      const retried = findCardByClientId(db, request.body.clientId);
      if (retried) {
        return reply.code(200).send(retried);
      }

      const shift = findShift(db, request.params.shiftId);
      if (!shift) {
        return reply.code(404).send({ error: "Shift not found" });
      }
      if (shift.status === "closed") {
        return reply.code(409).send({ error: "This shift is closed" });
      }
      if (breaksCheeseRule({ seniorBox: request.body.seniorBox, cheese: request.body.cheese })) {
        return reply.code(400).send({ error: CHEESE_RULE });
      }

      const input = { ...request.body };
      if (isPartnerMethod(input.arrivalMethod)) {
        if (account.role === "front_desk") {
          return reply
            .code(400)
            .send({ error: "Door Dash and Helping Hands Families are entered by Distribution" });
        }
        if (input.intakeInitials !== undefined) {
          return reply.code(400).send({ error: "Partner Families have no intake initials" });
        }
        input.status = "distributed";
      } else {
        if (account.role === "distribution") {
          return reply.code(403).send({ error: "Walk-in Families are entered at the front desk" });
        }
        if (input.loads || input.extrasAdded !== undefined || input.extrasNote !== undefined) {
          return reply.code(403).send({ error: "Only distribution can record weights and extras" });
        }
        const initials = normalizeInitials(input.intakeInitials ?? "");
        if (!initials) {
          return reply.code(400).send({ error: INITIALS_RULE });
        }
        input.intakeInitials = initials;
      }
      const carts = cartCount({ tefapBags: newCardBags(input) });
      if (!fitsCarts(input.loads ?? [], carts)) {
        return reply.code(400).send({ error: cartRule(carts) });
      }

      const card = createCard(db, shift.id, input);
      if (card === "duplicate") {
        return reply.code(409).send({ error: "That card number is already in use" });
      }
      audit(request, "card.create", { shiftId: shift.id, number: card.number });
      broadcast({ type: "card", card });
      return reply.code(201).send(card);
    },
  );

  app.patch<{ Params: { id: number }; Body: CardChanges & { revision: number } }>(
    "/api/cards/:id",
    {
      preHandler: requireRole(),
      schema: {
        params: { type: "object", properties: { id: { type: "integer" } } },
        body: {
          type: "object",
          required: ["revision"],
          properties: {
            revision: { type: "integer", minimum: 1 },
            ...CARD_DETAIL_PROPERTIES,
            tefapBags: { type: ["integer", "null"], minimum: 0, maximum: 20 },
            status: { type: "string", enum: ALL_CARD_STATUSES },
            loads: LOADS,
          },
        },
      },
    },
    async (request, reply) => {
      const account = currentAccount(request) as Account;
      const { revision, ...changes } = request.body;

      const current = findCard(db, request.params.id);
      if (!current) {
        return reply.code(404).send({ error: "Card not found" });
      }
      if (findShift(db, current.shiftId)?.status === "closed") {
        return reply.code(409).send({ error: "This shift is closed" });
      }
      const extras = {
        seniorBox: changes.seniorBox ?? current.seniorBox,
        cheese: changes.cheese ?? current.cheese,
      };
      if (breaksCheeseRule(extras)) {
        return reply.code(400).send({ error: CHEESE_RULE });
      }
      if (
        changes.arrivalMethod &&
        isPartnerMethod(changes.arrivalMethod) !== isPartnerMethod(current.arrivalMethod)
      ) {
        return reply
          .code(400)
          .send({ error: "A walk-in Family and a partner Family cannot be swapped" });
      }
      const carts = cartCount({ tefapBags: bagsAfter(current, changes) });
      if (!fitsCarts(changes.loads ?? current.loads, carts)) {
        return reply.code(400).send({ error: cartRule(carts) });
      }

      const recordsDistribution =
        changes.loads || changes.extrasAdded !== undefined || changes.extrasNote !== undefined;
      if (recordsDistribution && account.role === "front_desk") {
        return reply.code(403).send({ error: "Only distribution can record weights and extras" });
      }
      if (
        changes.status &&
        changes.status !== current.status &&
        !canChangeStatus(account.role, current.status, changes.status)
      ) {
        return reply.code(403).send({ error: "That status change is not allowed" });
      }

      const result = updateCard(db, current, revision, changes);
      if (result === "stale") {
        return reply.code(409).send({
          error: "This card was changed at another station",
          card: findCard(db, current.id),
        });
      }
      if (result === "duplicate") {
        return reply.code(409).send({ error: "That card number is already in use" });
      }
      audit(request, "card.update", { shiftId: result.shiftId, number: result.number, changes });
      broadcast({ type: "card", card: result });
      return result;
    },
  );

  // For a card entered by mistake. The activity log keeps what it held. See ADR 0019.
  app.delete<{ Params: { id: number } }>(
    "/api/cards/:id",
    {
      preHandler: requireRole("admin"),
      schema: { params: { type: "object", properties: { id: { type: "integer" } } } },
    },
    async (request, reply) => {
      const card = findCard(db, request.params.id);
      if (!card) {
        return reply.code(404).send({ error: "Card not found" });
      }
      if (findShift(db, card.shiftId)?.status === "closed") {
        return reply.code(409).send({ error: "This shift is closed" });
      }

      deleteCard(db, card.id);
      const { id: _id, ...details } = card;
      audit(request, "card.delete", { shiftId: card.shiftId, number: card.number, card: details });
      broadcast({ type: "card-deleted", shiftId: card.shiftId, cardId: card.id });
      return reply.code(204).send();
    },
  );
}
