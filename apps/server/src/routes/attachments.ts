import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { attachments } from '@xtechs/db/schema';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { AttachmentService } from '../lib/attachment-service.js';
import { getStorageProvider } from '../lib/storage/index.js';
import { uploadAttachmentSchema } from '@xtechs/shared';

const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

const entityParamsSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid('Invalid entity ID format'),
});

export async function attachmentRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // UPLOAD ATTACHMENT
  // ==========================================
  fastify.post(
    '/api/v1/attachments',
    { preHandler: [requirePermission('attachment', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Get multipart file stream
      const part = await request.file({
        limits: {
          fileSize: 25 * 1024 * 1024, // 25 MB max overall stream limit
        },
      });

      if (!part) {
        throw new ValidationError('No file uploaded in the request');
      }

      // Get parameters from query or fields
      const query = request.query as any;
      const entityType = query.entityType || (part.fields['entityType'] as any)?.value;
      const entityId = query.entityId || (part.fields['entityId'] as any)?.value;

      // Validate inputs
      const validated = uploadAttachmentSchema.safeParse({ entityType, entityId });
      if (!validated.success) {
        throw new ValidationError('Invalid attachment target details', {
          entityType: ['entityType is required and must be valid'],
          entityId: ['entityId is required and must be a valid UUID'],
        });
      }

      // Read buffer
      const buffer = await part.toBuffer();
      const scoped = createScopedDb(request.authContext!);

      const attachment = await AttachmentService.uploadAttachment(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        {
          fileName: part.filename,
          buffer,
          entityType: validated.data.entityType,
          entityId: validated.data.entityId,
        },
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(attachment);
    }
  );

  // ==========================================
  // GET ATTACHMENT METADATA
  // ==========================================
  fastify.get(
    '/api/v1/attachments/:id/metadata',
    { preHandler: [requirePermission('attachment', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);
      const attachment = await AttachmentService.getAttachment(db, scoped.auth.scope as any, id);
      return reply.send(attachment);
    }
  );

  // ==========================================
  // VIEW/STREAM ATTACHMENT
  // ==========================================
  fastify.get(
    '/api/v1/attachments/:id/view',
    { preHandler: [requirePermission('attachment', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);
      const { buffer, fileName, mimeType } = await AttachmentService.getAttachmentBuffer(
        db,
        scoped.auth.scope as any,
        id
      );

      reply.header('Content-Type', mimeType);
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      return reply.send(buffer);
    }
  );

  // ==========================================
  // GENERATE SIGNED DOWNLOAD LINK
  // ==========================================
  fastify.get(
    '/api/v1/attachments/:id/download-link',
    { preHandler: [requirePermission('attachment', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);
      const downloadUrl = await AttachmentService.getAttachmentDownloadUrl(
        db,
        scoped.auth.scope as any,
        id
      );
      return reply.send({ downloadUrl });
    }
  );

  // ==========================================
  // PUBLIC SIGNED DOWNLOAD ENDPOINT
  // ==========================================
  fastify.get(
    '/api/attachments/download',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { token?: string };
      if (!query.token) {
        throw new ValidationError('Token is missing');
      }

      const secret = process.env['JWT_SECRET'] || 'dev-secret-change-in-production';
      const secretKey = new TextEncoder().encode(secret);

      try {
        const { payload } = await jwtVerify(query.token, secretKey);
        const storagePath = payload.storagePath as string;

        if (!storagePath) {
          throw new ValidationError('Invalid token payload');
        }

        const provider = getStorageProvider();
        const buffer = await provider.get(storagePath);

        // Fetch details from db to set headers
        const [record] = await db
          .select()
          .from(attachments)
          .where(eq(attachments.storagePath, storagePath))
          .limit(1);

        if (record) {
          reply.header('Content-Type', record.mimeType);
          reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(record.fileName)}"`);
        } else {
          reply.header('Content-Type', 'application/octet-stream');
        }

        return reply.send(buffer);
      } catch (err: any) {
        throw new ValidationError('Invalid or expired download token');
      }
    }
  );

  // ==========================================
  // LIST ENTITY ATTACHMENTS
  // ==========================================
  fastify.get(
    '/api/v1/attachments/entity/:entityType/:entityId',
    { preHandler: [requirePermission('attachment', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { entityType, entityId } = entityParamsSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);

      const list = await AttachmentService.listEntityAttachments(
        db,
        scoped.auth.scope as any,
        entityType,
        entityId
      );

      return reply.send(list);
    }
  );

  // ==========================================
  // DELETE ATTACHMENT
  // ==========================================
  fastify.delete(
    '/api/v1/attachments/:id',
    { preHandler: [requirePermission('attachment', 'delete')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParamSchema.parse(request.params);
      const scoped = createScopedDb(request.authContext!);

      const result = await AttachmentService.deleteAttachment(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        id,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(result);
    }
  );
}
