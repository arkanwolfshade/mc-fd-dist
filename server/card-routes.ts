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

export const SHIFT_PARAMS = {
  type: "object",
  properties: { shiftId: { type: "integer" } },
} as const;
export const ID_PARAMS = { type: "object", properties: { id: { type: "integer" } } } as const;

const DATE_OBJECT = {
  type: "object",
  required: ["date"],
  properties: { date: { type: "string", format: "date" } },
} as const;

// Sends the error reply and returns false unless the shift exists and accepts changes.
export function checkShiftOpen(db: Database, shiftId: number, reply: FastifyReply): boolean {
  const shift = findShift(db, shiftId);
  if (!shift) {
    void reply.code(404).send({ error: "Shift not found" });
    return false;
  }
  if (shift.status === "closed") {
    void reply.code(409).send({ error: "This shift is closed" });
    return false;
  }
  return true;
}

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

const NEW_CARD_BODY = {
  type: "object",
  required: ["clientId", "number", "familySize", "arrivalMethod"],
  // Fields not listed here, such as status, are dropped before the handler sees them.
  additionalProperties: false,
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
} as const;

const CARD_CHANGES_BODY = {
  type: "object",
  required: ["revision"],
  properties: {
    revision: { type: "integer", minimum: 1 },
    ...CARD_DETAIL_PROPERTIES,
    tefapBags: { type: ["integer", "null"], minimum: 0, maximum: 20 },
    status: { type: "string", enum: ALL_CARD_STATUSES },
    loads: LOADS,
  },
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

// A request the rules refuse, with the status code to answer it with.
interface Refusal {
  code: 400 | 403;
  error: string;
}

// The fields of a new card that a request may set. Anything else it carries, such as the
// status, is left out, because the role rules below decide that.
function allowedFields(body: NewCard): NewCard {
  return {
    clientId: body.clientId,
    number: body.number,
    familySize: body.familySize,
    arrivalMethod: body.arrivalMethod,
    seniorBox: body.seniorBox,
    cheese: body.cheese,
    other: body.other,
    ...(body.tefapBags !== undefined ? { tefapBags: body.tefapBags } : {}),
    ...(body.intakeInitials !== undefined ? { intakeInitials: body.intakeInitials } : {}),
    ...(body.loads !== undefined ? { loads: body.loads } : {}),
    ...(body.extrasAdded !== undefined ? { extrasAdded: body.extrasAdded } : {}),
    ...(body.extrasNote !== undefined ? { extrasNote: body.extrasNote } : {}),
    status: "entered",
  };
}

// A Door Dash or Helping Hands Family: entered by Distribution, already served, no initials.
function settlePartner(account: Account, input: NewCard): Refusal | null {
  if (account.role === "front_desk") {
    return { code: 400, error: "Door Dash and Helping Hands Families are entered by Distribution" };
  }
  if (input.intakeInitials !== undefined) {
    return { code: 400, error: "Partner Families have no intake initials" };
  }
  input.status = "distributed";
  return null;
}

// A walk-in Family: entered at the front desk, with the initials of who gave the details.
function settleWalkIn(account: Account, input: NewCard): Refusal | null {
  if (account.role === "distribution") {
    return { code: 403, error: "Walk-in Families are entered at the front desk" };
  }
  if (input.loads || input.extrasAdded !== undefined || input.extrasNote !== undefined) {
    return { code: 403, error: "Only distribution can record weights and extras" };
  }
  const initials = normalizeInitials(input.intakeInitials ?? "");
  if (!initials) {
    return { code: 400, error: INITIALS_RULE };
  }
  input.intakeInitials = initials;
  return null;
}

// Builds the card to create, or says why it cannot be.
export function newCardFrom(account: Account, body: NewCard): NewCard | Refusal {
  if (breaksCheeseRule({ seniorBox: body.seniorBox, cheese: body.cheese })) {
    return { code: 400, error: CHEESE_RULE };
  }
  const input = allowedFields(body);
  const refusal = isPartnerMethod(input.arrivalMethod)
    ? settlePartner(account, input)
    : settleWalkIn(account, input);
  if (refusal) {
    return refusal;
  }
  const carts = cartCount({ tefapBags: newCardBags(input) });
  if (!fitsCarts(input.loads ?? [], carts)) {
    return { code: 400, error: cartRule(carts) };
  }
  return input;
}

// The rules about the card itself, whoever makes the change.
function refuseByRules(current: Card, changes: CardChanges): Refusal | null {
  const extras = {
    seniorBox: changes.seniorBox ?? current.seniorBox,
    cheese: changes.cheese ?? current.cheese,
  };
  if (breaksCheeseRule(extras)) {
    return { code: 400, error: CHEESE_RULE };
  }
  if (
    changes.arrivalMethod &&
    isPartnerMethod(changes.arrivalMethod) !== isPartnerMethod(current.arrivalMethod)
  ) {
    return { code: 400, error: "A walk-in Family and a partner Family cannot be swapped" };
  }
  const carts = cartCount({ tefapBags: bagsAfter(current, changes) });
  if (!fitsCarts(changes.loads ?? current.loads, carts)) {
    return { code: 400, error: cartRule(carts) };
  }
  return null;
}

// The rules about who may make which change.
function refuseByRole(account: Account, current: Card, changes: CardChanges): Refusal | null {
  const recordsDistribution =
    changes.loads || changes.extrasAdded !== undefined || changes.extrasNote !== undefined;
  if (recordsDistribution && account.role === "front_desk") {
    return { code: 403, error: "Only distribution can record weights and extras" };
  }
  if (
    changes.status &&
    changes.status !== current.status &&
    !canChangeStatus(account.role, current.status, changes.status)
  ) {
    return { code: 403, error: "That status change is not allowed" };
  }
  return null;
}

// Says why `account` may not make `changes` to `current`, or null if it may.
function refuseChanges(account: Account, current: Card, changes: CardChanges): Refusal | null {
  return refuseByRules(current, changes) ?? refuseByRole(account, current, changes);
}

export function registerCardRoutes(app: FastifyInstance, context: CardRouteContext): void {
  const { db, currentAccount, requireRole, broadcast, audit } = context;

  app.post<{ Body: { date: string } }>(
    "/api/shifts",
    {
      preHandler: requireRole(),
      schema: { body: DATE_OBJECT },
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
      schema: { querystring: DATE_OBJECT },
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
      schema: { params: SHIFT_PARAMS, body: NEW_CARD_BODY },
    },
    async (request, reply) => {
      const account = currentAccount(request) as Account;
      const retried = findCardByClientId(db, request.body.clientId);
      if (retried) {
        return reply.code(200).send(retried);
      }

      const { shiftId } = request.params;
      if (!checkShiftOpen(db, shiftId, reply)) {
        return reply;
      }
      const input = newCardFrom(account, request.body);
      if ("error" in input) {
        return reply.code(input.code).send({ error: input.error });
      }

      const card = createCard(db, shiftId, input);
      if (card === "duplicate") {
        return reply.code(409).send({ error: "That card number is already in use" });
      }
      audit(request, "card.create", { shiftId, number: card.number });
      broadcast({ type: "card", card });
      return reply.code(201).send(card);
    },
  );

  app.patch<{ Params: { id: number }; Body: CardChanges & { revision: number } }>(
    "/api/cards/:id",
    {
      preHandler: requireRole(),
      schema: { params: ID_PARAMS, body: CARD_CHANGES_BODY },
    },
    async (request, reply) => {
      const account = currentAccount(request) as Account;
      const { revision, ...changes } = request.body;

      const current = findCard(db, request.params.id);
      if (!current) {
        return reply.code(404).send({ error: "Card not found" });
      }
      if (!checkShiftOpen(db, current.shiftId, reply)) {
        return reply;
      }
      const refusal = refuseChanges(account, current, changes);
      if (refusal) {
        return reply.code(refusal.code).send({ error: refusal.error });
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
      schema: { params: ID_PARAMS },
    },
    async (request, reply) => {
      const card = findCard(db, request.params.id);
      if (!card) {
        return reply.code(404).send({ error: "Card not found" });
      }
      if (!checkShiftOpen(db, card.shiftId, reply)) {
        return reply;
      }

      deleteCard(db, card.id);
      const { id: _id, ...details } = card;
      audit(request, "card.delete", { shiftId: card.shiftId, number: card.number, card: details });
      broadcast({ type: "card-deleted", shiftId: card.shiftId, cardId: card.id });
      return reply.code(204).send();
    },
  );
}
