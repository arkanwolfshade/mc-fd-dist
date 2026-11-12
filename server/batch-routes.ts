import type { FastifyInstance } from "fastify";
import {
  createReturnedBatch,
  deleteReturnedBatch,
  findReturnedBatchByClientId,
  findReturnedBatchShiftId,
  listReturnedBatches,
} from "./batches.js";
import { checkShiftOpen, ID_PARAMS, SHIFT_PARAMS } from "./card-routes.js";
import type { CardRouteContext } from "./card-routes.js";

export function registerBatchRoutes(app: FastifyInstance, context: CardRouteContext): void {
  const { db, requireRole, broadcast, audit } = context;
  const canEdit = requireRole("distribution", "admin");

  function broadcastBatches(shiftId: number): void {
    broadcast({ type: "batches", shiftId, returnedBatches: listReturnedBatches(db, shiftId) });
  }

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
      if (!checkShiftOpen(db, request.params.shiftId, reply)) {
        return reply;
      }
      const batch = createReturnedBatch(db, request.params.shiftId, request.body);
      audit(request, "returned.create", batch);
      broadcastBatches(batch.shiftId);
      return reply.code(201).send(batch);
    },
  );

  app.delete<{ Params: { id: number } }>(
    "/api/returned-batches/:id",
    { preHandler: canEdit, schema: { params: ID_PARAMS } },
    async (request, reply) => {
      const shiftId = findReturnedBatchShiftId(db, request.params.id);
      if (shiftId === null) {
        return reply.code(404).send({ error: "Batch not found" });
      }
      if (!checkShiftOpen(db, shiftId, reply)) {
        return reply;
      }
      deleteReturnedBatch(db, request.params.id);
      audit(request, "returned.delete", { shiftId, id: request.params.id });
      broadcastBatches(shiftId);
      return reply.code(204).send();
    },
  );
}
