import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { auditLogs } from '@xtechs/db/schema';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError } from '../lib/errors.js';
import {
  queryAuditLogs,
  getEntityTimeline,
  streamAuditLogsCsv,
} from '../lib/audit-service.js';

const dateStringSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Invalid ISO 8601 date format',
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().nonnegative().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  branchId: z.string().uuid('Invalid branchId format').optional(),
  actorId: z.string().uuid('Invalid actorId format').optional(),
  entityType: z.string().max(100).optional(),
  action: z.string().max(50).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

const entityTimelineParamsSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().uuid('Invalid entityId format'),
});

function flattenZodErrors(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'query';
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }
  return details;
}

export async function auditRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ─── GET /api/v1/audit ──────────────────────────────────────
  fastify.get(
    '/api/v1/audit',
    { preHandler: [requirePermission('audit', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = auditQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new ValidationError('Invalid query parameters', flattenZodErrors(query.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const scopeCondition = scoped.filters(auditLogs);

      const result = await queryAuditLogs(db, scopeCondition, query.data);

      return reply.send(result);
    }
  );

  // ─── GET /api/v1/audit/entity/:entityType/:entityId ──────────
  fastify.get(
    '/api/v1/audit/entity/:entityType/:entityId',
    { preHandler: [requirePermission('audit', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = entityTimelineParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const { entityType, entityId } = params.data;

      const scoped = createScopedDb(request.authContext!);
      const scopeCondition = scoped.filters(auditLogs);

      const timeline = await getEntityTimeline(db, scopeCondition, entityType, entityId);

      return reply.send(timeline);
    }
  );

  // ─── GET /api/v1/audit/export ───────────────────────────────
  fastify.get(
    '/api/v1/audit/export',
    { preHandler: [requirePermission('audit', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = auditQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new ValidationError('Invalid query parameters', flattenZodErrors(query.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const scopeCondition = scoped.filters(auditLogs);

      // Streaming small exports synchronously. Force a max threshold limit of 1000 items.
      const queryOptions = {
        ...query.data,
        limit: 1000,
        offset: 0,
      };

      const { logs } = await queryAuditLogs(db, scopeCondition, queryOptions);
      const csvStream = streamAuditLogsCsv(logs);

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      
      return reply.send(csvStream);
    }
  );
}
