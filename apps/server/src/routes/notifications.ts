import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError } from '../lib/errors.js';
import { NotificationService } from '../lib/notification-service.js';
import { updateNotificationPreferencesSchema } from '@xtechs/shared';

const idParamSchema = z.object({
  id: z.string().uuid('Invalid notification ID format'),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const getPrefsQuerySchema = z.object({
  tenantId: z.string().uuid().optional().nullable(),
});

export async function notificationRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // GET RECENT IN-APP NOTIFICATIONS
  // ==========================================
  fastify.get(
    '/api/v1/notifications/in-app',
    { preHandler: [requirePermission('notification', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { limit, offset } = listQuerySchema.parse(request.query);
      const scoped = createScopedDb(request.authContext!);

      const list = await NotificationService.getUserInAppNotifications(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        { limit, offset }
      );

      return reply.send(list);
    }
  );

  // ==========================================
  // MARK IN-APP NOTIFICATION AS READ
  // ==========================================
  fastify.patch(
    '/api/v1/notifications/:id/read',
    { preHandler: [requirePermission('notification', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);

      const updated = await NotificationService.markAsRead(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        id
      );

      return reply.send(updated);
    }
  );

  // ==========================================
  // GET NOTIFICATION PREFERENCES
  // ==========================================
  fastify.get(
    '/api/v1/notifications/preferences',
    { preHandler: [requirePermission('notification', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = getPrefsQuerySchema.parse(request.query);
      const scoped = createScopedDb(request.authContext!);

      // If no tenantId provided, fetch preferences for the current tenant scope
      const targetTenantId = tenantId !== undefined ? tenantId : scoped.auth.scope.tenantId;

      const prefs = await NotificationService.getUserPreferences(
        db,
        scoped.auth.userId,
        targetTenantId
      );

      return reply.send(prefs);
    }
  );

  // ==========================================
  // UPDATE NOTIFICATION PREFERENCES
  // ==========================================
  fastify.put(
    '/api/v1/notifications/preferences',
    { preHandler: [requirePermission('notification', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      
      const validated = updateNotificationPreferencesSchema.safeParse(request.body);
      if (!validated.success) {
        throw new ValidationError('Invalid request body structure', validated.error.flatten().fieldErrors);
      }

      const targetTenantId = validated.data.tenantId !== undefined ? validated.data.tenantId : scoped.auth.scope.tenantId;

      const updated = await NotificationService.updateUserPreferences(
        db,
        scoped.auth.userId,
        targetTenantId,
        validated.data.preferences
      );

      return reply.send(updated);
    }
  );
}
