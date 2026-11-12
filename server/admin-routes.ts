import type { FastifyInstance } from "fastify";
import {
  AccountExistsError,
  changePassword,
  createAccount,
  deleteAccount,
  findAccountByUsername,
  listAccounts,
} from "./accounts.js";
import type { Account } from "./accounts.js";
import { listAudit } from "./audit.js";
import { listReturnedBatches } from "./batches.js";
import type { CardRouteContext } from "./card-routes.js";
import { listCards, listShiftsBetween } from "./cards.js";
import { toCsv } from "./csv.js";
import { arrivalLabel } from "./rules.js";
import { setShiftStatus } from "./shift-closing.js";
import { deleteAccountSessions } from "./sessions.js";
import { shiftSummary } from "./summary.js";

const AUDIT_LIMIT = 200;

const SHIFT_PARAMS = { type: "object", properties: { id: { type: "integer" } } } as const;
const USERNAME_PARAMS = { type: "object", properties: { username: { type: "string" } } } as const;
const PASSWORD_SCHEMA = { type: "string", minLength: 10, maxLength: 200 } as const;
const RANGE_QUERY = {
  type: "object",
  required: ["from", "to"],
  properties: {
    from: { type: "string", format: "date" },
    to: { type: "string", format: "date" },
  },
} as const;

type RangeQuery = { Querystring: { from: string; to: string } };

export function registerAdminRoutes(app: FastifyInstance, context: CardRouteContext): void {
  const { db, currentAccount, requireRole, broadcast, closeEndedSockets, audit } = context;
  const adminOnly = requireRole("admin");

  function shiftsInRange(from: string, to: string) {
    return listShiftsBetween(db, from, to).map((shift) => {
      const cards = listCards(db, shift.id);
      const returnedBatches = listReturnedBatches(db, shift.id);
      return {
        ...shift,
        cards,
        returnedBatches,
        summary: shiftSummary(cards, returnedBatches),
      };
    });
  }

  app.post<{ Params: { id: number } }>(
    "/api/shifts/:id/close",
    { preHandler: requireRole("distribution", "admin"), schema: { params: SHIFT_PARAMS } },
    async (request, reply) => {
      const shift = setShiftStatus(db, request.params.id, "closed");
      if (!shift) {
        return reply.code(404).send({ error: "Shift not found" });
      }
      audit(request, "shift.close", { date: shift.date });
      broadcast({ type: "shift", shift });
      return shift;
    },
  );

  app.post<{ Params: { id: number } }>(
    "/api/admin/shifts/:id/reopen",
    { preHandler: adminOnly, schema: { params: SHIFT_PARAMS } },
    async (request, reply) => {
      const shift = setShiftStatus(db, request.params.id, "open");
      if (!shift) {
        return reply.code(404).send({ error: "Shift not found" });
      }
      audit(request, "shift.reopen", { date: shift.date });
      broadcast({ type: "shift", shift });
      return shift;
    },
  );

  const rangeRoute = { preHandler: adminOnly, schema: { querystring: RANGE_QUERY } };

  app.get<RangeQuery>("/api/admin/reports/totals", rangeRoute, async (request, reply) => {
    const { from, to } = request.query;
    if (from > to) {
      return reply.code(400).send({ error: "The start date must not be after the end date" });
    }
    const shifts = shiftsInRange(from, to);
    return {
      shifts: shifts.map(({ id, date, status, summary }) => ({ id, date, status, summary })),
      totals: shiftSummary(
        shifts.flatMap((shift) => shift.cards),
        shifts.flatMap((shift) => shift.returnedBatches),
      ),
    };
  });

  app.get<RangeQuery>("/api/admin/reports/shifts.csv", rangeRoute, async (request, reply) => {
    const { from, to } = request.query;
    const rows = shiftsInRange(from, to).map(({ date, status, summary }) => [
      date,
      status,
      summary.families.total,
      summary.families.cards,
      summary.families.partners,
      summary.families.left,
      summary.weight.total,
      summary.weight.cards,
      summary.weight.partners,
      summary.returnedWeight,
      summary.netWeight,
      summary.tefapBags,
      summary.seniorBoxes,
      summary.cheese,
      summary.distributedWithoutWeight,
    ]);
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="shifts-${from}-to-${to}.csv"`)
      .send(
        toCsv(
          [
            "date",
            "status",
            "families_total",
            "families_cards",
            "families_partners",
            "families_left",
            "weight_total",
            "weight_cards",
            "weight_partners",
            "returned_weight",
            "net_weight",
            "tefap_bags",
            "senior_boxes",
            "cheese",
            "distributed_without_weight",
          ],
          rows,
        ),
      );
  });

  app.get<RangeQuery>("/api/admin/reports/cards.csv", rangeRoute, async (request, reply) => {
    const { from, to } = request.query;
    const rows = shiftsInRange(from, to).flatMap((shift) =>
      shift.cards.map((card) => [
        shift.date,
        card.number,
        card.familySize,
        arrivalLabel(card.arrivalMethod),
        card.seniorBox,
        card.cheese,
        card.tefapBags,
        card.tefapOverride,
        card.status,
        card.loads[0],
        card.loads[1],
        card.loads[2],
        card.totalWeight,
        card.other,
        card.extrasAdded,
        card.extrasNote,
        card.intakeInitials,
      ]),
    );
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="cards-${from}-to-${to}.csv"`)
      .send(
        toCsv(
          [
            "date",
            "card_number",
            "family_size",
            "arrival_method",
            "senior_box",
            "cheese",
            "tefap_bags",
            "tefap_override",
            "status",
            "cart_1",
            "cart_2",
            "cart_3",
            "total_weight",
            "other",
            "extras_added",
            "extras_note",
            "intake_initials",
          ],
          rows,
        ),
      );
  });

  app.get("/api/admin/accounts", { preHandler: adminOnly }, async () => {
    return listAccounts(db);
  });

  app.post<{ Body: { username: string; password: string } }>(
    "/api/admin/accounts",
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string", minLength: 1, maxLength: 100 },
            password: PASSWORD_SCHEMA,
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      try {
        await createAccount(db, { username, password, role: "admin" });
      } catch (error) {
        if (error instanceof AccountExistsError) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
      audit(request, "account.create", { username, role: "admin" });
      return reply.code(201).send({ username, role: "admin" });
    },
  );

  app.put<{ Params: { username: string }; Body: { password: string } }>(
    "/api/admin/accounts/:username/password",
    {
      preHandler: adminOnly,
      schema: {
        params: USERNAME_PARAMS,
        body: { type: "object", required: ["password"], properties: { password: PASSWORD_SCHEMA } },
      },
    },
    async (request, reply) => {
      const target = findAccountByUsername(db, request.params.username);
      if (!target) {
        return reply.code(404).send({ error: "Account not found" });
      }
      await changePassword(db, target.id, request.body.password);
      // Recorded first, because admins changing their own password end their session.
      audit(request, "account.password", { username: target.username });
      // A leaked shared password must stop working everywhere. See ADR 0007.
      deleteAccountSessions(db, target.id);
      closeEndedSockets();
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { username: string } }>(
    "/api/admin/accounts/:username",
    { preHandler: adminOnly, schema: { params: USERNAME_PARAMS } },
    async (request, reply) => {
      const actor = currentAccount(request) as Account;
      const target = findAccountByUsername(db, request.params.username);
      if (!target) {
        return reply.code(404).send({ error: "Account not found" });
      }
      if (target.id === actor.id) {
        return reply.code(409).send({ error: "You cannot remove your own account" });
      }
      if (target.role !== "admin") {
        return reply.code(409).send({ error: "Station logins cannot be removed" });
      }
      deleteAccount(db, target.id);
      closeEndedSockets();
      audit(request, "account.delete", { username: target.username });
      return reply.code(204).send();
    },
  );

  app.get("/api/admin/audit", { preHandler: adminOnly }, async () => listAudit(db, AUDIT_LIMIT));
}
