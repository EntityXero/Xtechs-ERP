import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError } from '../lib/errors.js';
import { PurchasingService } from '../lib/purchasing-service.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  createPurchaseOrderSchema,
} from '@xtechs/shared';

function flattenZodErrors(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'body';
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }
  return details;
}

const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export async function purchasingRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // SUPPLIERS
  // ==========================================

  fastify.post(
    '/api/v1/purchasing/suppliers',
    { preHandler: [requirePermission('supplier', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createSupplierSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid supplier payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const supplier = await PurchasingService.createSupplier(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(supplier);
    }
  );

  fastify.patch(
    '/api/v1/purchasing/suppliers/:id',
    { preHandler: [requirePermission('supplier', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const parsed = updateSupplierSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid supplier update payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const supplier = await PurchasingService.updateSupplier(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(supplier);
    }
  );

  // ==========================================
  // PURCHASE ORDERS
  // ==========================================

  fastify.post(
    '/api/v1/purchasing/orders',
    { preHandler: [requirePermission('purchase_order', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createPurchaseOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid purchase order payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const po = await PurchasingService.createPurchaseOrder(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(po);
    }
  );

  fastify.post(
    '/api/v1/purchasing/orders/:id/post',
    { preHandler: [requirePermission('purchase_order', 'approve')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const posted = await PurchasingService.postPurchaseOrder(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(posted);
    }
  );
}
