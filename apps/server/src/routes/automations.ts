import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { AutomationService } from '../lib/automation-service.js';

const idParamSchema = z.object({
  id: z.string().uuid('Invalid automation ID format'),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function automationRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // GET ALL AUTOMATIONS
  // ==========================================
  fastify.get(
    '/api/v1/automations',
    { preHandler: [requirePermission('automation', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const list = await AutomationService.getAutomations(db, scoped.auth.scope as any);
      return reply.send(list);
    }
  );

  // ==========================================
  // GET AUTOMATION BY ID
  // ==========================================
  fastify.get(
    '/api/v1/automations/:id',
    { preHandler: [requirePermission('automation', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);
      const auto = await AutomationService.getAutomationById(db, scoped.auth.scope as any, id);
      return reply.send(auto);
    }
  );

  // ==========================================
  // CREATE AUTOMATION RULE
  // ==========================================
  fastify.post(
    '/api/v1/automations',
    { preHandler: [requirePermission('automation', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const auto = await AutomationService.createAutomation(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        request.body
      );
      return reply.status(201).send(auto);
    }
  );

  // ==========================================
  // UPDATE AUTOMATION RULE
  // ==========================================
  fastify.put(
    '/api/v1/automations/:id',
    { preHandler: [requirePermission('automation', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);
      const updated = await AutomationService.updateAutomation(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        id,
        request.body
      );
      return reply.send(updated);
    }
  );

  // ==========================================
  // DELETE AUTOMATION RULE
  // ==========================================
  fastify.delete(
    '/api/v1/automations/:id',
    { preHandler: [requirePermission('automation', 'delete')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);
      const result = await AutomationService.deleteAutomation(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        id
      );
      return reply.send(result);
    }
  );

  // ==========================================
  // GET AUTOMATION EXECUTION LOGS
  // ==========================================
  fastify.get(
    '/api/v1/automations/:id/logs',
    { preHandler: [requirePermission('automation', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const { limit, offset } = listQuerySchema.parse(request.query);
      const scoped = createScopedDb(request.authContext!);
      const logs = await AutomationService.getAutomationLogs(
        db,
        scoped.auth.scope as any,
        id,
        { limit, offset }
      );
      return reply.send(logs);
    }
  );
}
