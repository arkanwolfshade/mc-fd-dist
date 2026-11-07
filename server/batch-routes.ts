import type { FastifyInstance, FastifyReply } from "fastify";
import {
  PARTNERS,
  createPartnerBatch,
  createReturnedBatch,
  deleteBatch,
  findBatchShiftId,
  findPartnerBatchByClientId,
  findReturnedBatchByClientId,
  listPartnerBatches,
  listReturnedBatches,
} from "./batches.js";
import type { BatchTable, Partner } from "./batches.js";
import type { CardRouteContext } from "./card-routes.js";
import { findShift } from "./cards.js";

const SHIFT_PARAMS = { type: "object", properties: { shiftId: { type: "integer" } } } as const;
const ID_PARAMS = { type: "object", properties: { id: { type: "integer" } } } as const;

export function registerBatchRoutes(app: FastifyInstance, context: CardRouteContext): void {
  const { db, requireRole, broadcast } = context;
  const canEdit = requireRole("distribution", "admin");

  function broadcastBatches(shiftId: number): void {
    broadcast({
      type: "batches",
      shiftId,
      partnerBatches: listPartnerBatches(db, shiftId),
      returnedBatches: listReturnedBatches(db, shiftId),
    });
  }

  // Sends the error reply and returns false unless the shift accepts changes.
  function checkShiftOpen(shiftId: number, reply: FastifyReply): boolean {
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

  app.post<{
    Params: { shiftId: number };
    Body: { clientId: string; partner: Partner; familyCount: number; weight: number };
  }>(
    "/api/shifts/:shiftId/partner-batches",
    {
      preHandler: canEdit,
      schema: {
        params: SHIFT_PARAMS,
        body: {
          type: "object",
          required: ["clientId", "partner", "familyCount", "weight"],
          properties: {
            clientId: { type: "string", minLength: 1, maxLength: 100 },
            partner: { type: "string", enum: PARTNERS },
            familyCount: { type: "integer", minimum: 1 },
            weight: { type: "number", minimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const retried = findPartnerBatchByClientId(db, request.body.clientId);
      if (retried) {
        return reply.code(200).send(retried);
      }
      if (!checkShiftOpen(request.params.shiftId, reply)) {
        return reply;
      }
      const batch = createPartnerBatch(db, request.params.shiftId, request.body);
      broadcastBatches(batch.shiftId);
      return reply.code(201).send(batch);
    },
  );

  app.post<{ Params: { shiftId: number }; Body: { clientId: string; weight: number } }>(
    "/api/shifts/:shiftId/returned-batches",
    {
      preHandler: canEdit,
      schema: {
        params: SHIFT_PARAMS,
        body: {
          type: "object",
          required: ["clientId", "weight"],
          properties: {
            clientId: { type: "string", minLength: 1, maxLength: 100 },
            weight: { type: "number", exclusiveMinimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const retried = findReturnedBatchByClientId(db, request.body.clientId);
      if (retried) {
        return reply.code(200).send(retried);
      }
      if (!checkShiftOpen(request.params.shiftId, reply)) {
        return reply;
      }
      const batch = createReturnedBatch(db, request.params.shiftId, request.body);
      broadcastBatches(batch.shiftId);
      return reply.code(201).send(batch);
    },
  );

  const deleteRoutes: [string, BatchTable][] = [
    ["/api/partner-batches/:id", "partner_batch"],
    ["/api/returned-batches/:id", "returned_batch"],
  ];
  for (const [url, table] of deleteRoutes) {
    app.delete<{ Params: { id: number } }>(
      url,
      { preHandler: canEdit, schema: { params: ID_PARAMS } },
      async (request, reply) => {
        const shiftId = findBatchShiftId(db, table, request.params.id);
        if (shiftId === null) {
          return reply.code(404).send({ error: "Batch not found" });
        }
        if (!checkShiftOpen(shiftId, reply)) {
          return reply;
        }
        deleteBatch(db, table, request.params.id);
        broadcastBatches(shiftId);
        return reply.code(204).send();
      },
    );
  }
}
