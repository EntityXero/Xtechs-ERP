import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError } from '../lib/errors.js';
import { InventoryService } from '../lib/inventory-service.js';
import {
  createWarehouseSchema,
  createItemGroupSchema,
  createItemSchema,
  createItemUomSchema,
  createBatchSchema,
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

const itemIdParamSchema = z.object({
  itemId: z.string().uuid('Invalid Item ID format'),
});

const getBalancesQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
});

export async function inventoryRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // WAREHOUSES
  // ==========================================

  fastify.post(
    '/api/v1/inventory/warehouses',
    { preHandler: [requirePermission('warehouse', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createWarehouseSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid warehouse payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const wh = await InventoryService.createWarehouse(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(wh);
    }
  );

  fastify.get(
    '/api/v1/inventory/warehouses',
    { preHandler: [requirePermission('warehouse', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const list = await InventoryService.getWarehouses(db, scoped.auth.scope as any);
      return reply.send(list);
    }
  );

  // ==========================================
  // ITEM GROUPS
  // ==========================================

  fastify.post(
    '/api/v1/inventory/item-groups',
    { preHandler: [requirePermission('item', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createItemGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid item group payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const ig = await InventoryService.createItemGroup(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(ig);
    }
  );

  // ==========================================
  // ITEMS
  // ==========================================

  fastify.post(
    '/api/v1/inventory/items',
    { preHandler: [requirePermission('item', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createItemSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid item payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const item = await InventoryService.createItem(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(item);
    }
  );

  fastify.get(
    '/api/v1/inventory/items',
    { preHandler: [requirePermission('item', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const list = await InventoryService.getItems(db, scoped.auth.scope as any);
      return reply.send(list);
    }
  );

  fastify.post(
    '/api/v1/inventory/items/:itemId/uoms',
    { preHandler: [requirePermission('item', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = itemIdParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid item ID in path', flattenZodErrors(params.error));
      }

      const parsed = createItemUomSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid UOM payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const uom = await InventoryService.createItemUom(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.itemId,
        parsed.data.uom,
        parsed.data.conversionFactor,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(uom);
    }
  );

  // ==========================================
  // BATCHES
  // ==========================================

  fastify.post(
    '/api/v1/inventory/batches',
    { preHandler: [requirePermission('batch', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createBatchSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid batch payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const batch = await InventoryService.createBatch(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(batch);
    }
  );

  // ==========================================
  // STOCK ENTRIES (POST & REVERSE)
  // ==========================================

  fastify.post(
    '/api/v1/inventory/stock-entries/:id/post',
    { preHandler: [requirePermission('stock_ledger', 'approve')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const posted = await InventoryService.postStockEntry(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(posted);
    }
  );

  fastify.post(
    '/api/v1/inventory/stock-entries/:id/reverse',
    { preHandler: [requirePermission('stock_ledger', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const reversed = await InventoryService.reverseStockEntry(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(reversed);
    }
  );

  // ==========================================
  // BALANCES / QUANTITY QUERY
  // ==========================================

  fastify.get(
    '/api/v1/inventory/balances',
    { preHandler: [requirePermission('stock_ledger', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsedQuery = getBalancesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        throw new ValidationError('Invalid query parameters', flattenZodErrors(parsedQuery.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const list = await InventoryService.getStockBalances(
        db,
        scoped.auth.scope as any,
        parsedQuery.data
      );

      return reply.send(list);
    }
  );
}
