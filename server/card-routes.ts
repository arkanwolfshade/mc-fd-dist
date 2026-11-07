import type { Database } from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Account, Role } from "./accounts.js";
import { listPartnerBatches, listReturnedBatches } from "./batches.js";
import type { PartnerBatch, ReturnedBatch } from "./batches.js";
import {
  createCard,
  createShift,
  findCard,
  findCardByClientId,
  findShift,
  findShiftByDate,
  listCards,
  updateCard,
} from "./cards.js";
import type { Card, CardChanges, NewCard, Shift } from "./cards.js";
import { ARRIVAL_METHODS, CARD_STATUSES, canChangeStatus } from "./rules.js";
import { shiftSummary } from "./summary.js";

const CARD_DETAIL_PROPERTIES = {
  number: { type: "integer", minimum: 1 },
  familySize: { type: "integer", minimum: 1, maximum: 100 },
  arrivalMethod: { type: "string", enum: ARRIVAL_METHODS },
  seniorBox: { type: "boolean" },
  cheese: { type: "boolean" },
  other: { type: "string", maxLength: 500 },
} as const;

export interface CardRouteContext {
  db: Database;
  currentAccount: (request: FastifyRequest) => Account | null;
  requireRole: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  broadcast: (message: LiveMessage) => void;
  closeEndedSockets: () => void;
  audit: (request: FastifyRequest, action: string, detail?: object) => void;
}

export type LiveMessage =
  | { type: "card"; card: Card }
  | { type: "shift"; shift: Shift }
  | {
      type: "batches";
      shiftId: number;
      partnerBatches: PartnerBatch[];
      returnedBatches: ReturnedBatch[];
    };

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
      const partnerBatches = listPartnerBatches(db, shift.id);
      const returnedBatches = listReturnedBatches(db, shift.id);
      return {
        ...shift,
        cards,
        partnerBatches,
        returnedBatches,
        summary: shiftSummary(cards, partnerBatches, returnedBatches),
      };
    },
  );

  app.post<{ Params: { shiftId: number }; Body: NewCard }>(
    "/api/shifts/:shiftId/cards",
    {
      preHandler: requireRole("front_desk", "admin"),
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
          },
        },
      },
    },
    async (request, reply) => {
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

      const card = createCard(db, shift.id, request.body);
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
            status: { type: "string", enum: CARD_STATUSES },
            loads: {
              type: "array",
              maxItems: 3,
              items: { type: ["number", "null"], minimum: 0 },
            },
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

      if (changes.loads && account.role === "front_desk") {
        return reply.code(403).send({ error: "Only distribution can record weights" });
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
}
