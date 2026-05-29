import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError } from '../lib/errors.js';
import { SalesService } from '../lib/sales-service.js';
import {
  createQuotationSchema,
  createSalesOrderSchema,
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

export async function salesRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // QUOTATIONS
  // ==========================================

  fastify.post(
    '/api/v1/sales/quotations',
    { preHandler: [requirePermission('quotation', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createQuotationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid quotation payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const quotation = await SalesService.createQuotation(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(quotation);
    }
  );

  fastify.post(
    '/api/v1/sales/quotations/:id/post',
    { preHandler: [requirePermission('quotation', 'approve')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const posted = await SalesService.postQuotation(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(posted);
    }
  );

  // ==========================================
  // SALES ORDERS
  // ==========================================

  fastify.post(
    '/api/v1/sales/orders',
    { preHandler: [requirePermission('sales_order', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createSalesOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid sales order payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const salesOrder = await SalesService.createSalesOrder(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(salesOrder);
    }
  );

  fastify.post(
    '/api/v1/sales/orders/:id/post',
    { preHandler: [requirePermission('sales_order', 'approve')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const posted = await SalesService.postSalesOrder(
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
