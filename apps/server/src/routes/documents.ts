import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { documents } from '@xtechs/db/schema';
import {
  createDocumentInputSchema,
  updateDocumentInputSchema,
  createDocumentCommentSchema,
} from '@xtechs/shared';
import { resolvePermissions, hasPermission } from '../lib/permission-service.js';
import { createScopedDb } from '../lib/scoped-db.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
} from '../lib/errors.js';
import { DocumentService } from '../lib/document-service.js';

const typeParamSchema = z.object({
  type: z.string().min(1).max(100),
});

const typeIdParamSchema = z.object({
  type: z.string().min(1).max(100),
  id: z.string().uuid(),
});

const transitionBodySchema = z.object({
  event: z.string().min(1).max(100),
});

const attachmentBodySchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
  storagePath: z.string().min(1).max(1000),
});

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

/**
 * Enforces dynamic permission checking per document type (e.g. document:invoice -> read)
 */
async function enforceDocumentPermission(
  request: FastifyRequest,
  type: string,
  action: string
) {
  const { authContext } = request;
  if (!authContext) {
    throw new UnauthorizedError('Authentication required');
  }

  if (!authContext.permissions) {
    authContext.permissions = await resolvePermissions(
      request.server.db,
      authContext.userId,
      authContext.scope.branchId
    );
  }

  // Check specific resource permission 'document:invoice' or generic fallback 'document'
  const permitted =
    hasPermission(authContext.permissions, `document:${type}`, action) ||
    hasPermission(authContext.permissions, `document:${type}`, '*') ||
    hasPermission(authContext.permissions, 'document', action) ||
    hasPermission(authContext.permissions, 'document', '*');

  if (!permitted) {
    throw new ForbiddenError(`You do not have permission to ${action} document:${type}`);
  }
}

export async function documentRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ─── GET /api/v1/documents/:type ──────────────────────────
  fastify.get(
    '/api/v1/documents/:type',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = typeParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid type parameter', flattenZodErrors(params.error));
      }

      const { type } = params.data;
      await enforceDocumentPermission(request, type, 'read');

      const scoped = createScopedDb(request.authContext!);

      // Fetch headers, ordered by newest first
      const docs = await db
        .select()
        .from(documents)
        .where(and(eq(documents.type, type), scoped.filters(documents)))
        .orderBy(desc(documents.createdAt));

      return reply.send(docs);
    }
  );

  // ─── POST /api/v1/documents/:type ─────────────────────────
  fastify.post(
    '/api/v1/documents/:type',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = typeParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid type parameter', flattenZodErrors(params.error));
      }

      const { type } = params.data;
      await enforceDocumentPermission(request, type, 'create');

      const body = createDocumentInputSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      if (body.data.type !== type) {
        throw new ValidationError(`Document type in payload ('${body.data.type}') must match URL parameter ('${type}')`);
      }

      const { scope, userId } = request.authContext!;
      const newDoc = await DocumentService.createDocument(
        db,
        scope as Required<typeof scope>,
        userId,
        body.data,
        {
          requestId: request.id,
          ipAddress: request.clientIp,
        }
      );

      return reply.status(201).send(newDoc);
    }
  );

  // ─── GET /api/v1/documents/:type/:id ──────────────────────
  fastify.get(
    '/api/v1/documents/:type/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = typeIdParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const { type, id } = params.data;
      await enforceDocumentPermission(request, type, 'read');

      const { scope } = request.authContext!;
      const doc = await DocumentService.getDocumentDetails(
        db,
        scope as Required<typeof scope>,
        id
      );

      if (doc.type !== type) {
        throw new NotFoundError(`Document with type '${type}'`, id);
      }

      return reply.send(doc);
    }
  );

  // ─── PATCH /api/v1/documents/:type/:id ────────────────────
  fastify.patch(
    '/api/v1/documents/:type/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = typeIdParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const { type, id } = params.data;
      await enforceDocumentPermission(request, type, 'update');

      const body = updateDocumentInputSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { scope, userId } = request.authContext!;
      const updated = await DocumentService.updateDocument(
        db,
        scope as Required<typeof scope>,
        userId,
        id,
        body.data,
        {
          requestId: request.id,
          ipAddress: request.clientIp,
        }
      );

      return reply.send(updated);
    }
  );

  // ─── POST /api/v1/documents/:type/:id/transition ──────────
  fastify.post(
    '/api/v1/documents/:type/:id/transition',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = typeIdParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const body = transitionBodySchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { type, id } = params.data;
      const { event } = body.data;

      // Transitions represent an update/mutation in document lifecycle
      await enforceDocumentPermission(request, type, 'update');

      const { scope, userId } = request.authContext!;
      const transitioned = await DocumentService.transitionDocument(
        db,
        scope as Required<typeof scope>,
        userId,
        id,
        event,
        {
          requestId: request.id,
          ipAddress: request.clientIp,
        }
      );

      return reply.send(transitioned);
    }
  );

  // ─── POST /api/v1/documents/:type/:id/comments ────────────
  fastify.post(
    '/api/v1/documents/:type/:id/comments',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = typeIdParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const { type, id } = params.data;
      await enforceDocumentPermission(request, type, 'update');

      const body = createDocumentCommentSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { scope, userId } = request.authContext!;
      const comment = await DocumentService.addComment(
        db,
        scope as Required<typeof scope>,
        userId,
        id,
        body.data.content
      );

      return reply.status(201).send(comment);
    }
  );

  // ─── POST /api/v1/documents/:type/:id/attachments ─────────
  fastify.post(
    '/api/v1/documents/:type/:id/attachments',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = typeIdParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const { type, id } = params.data;
      await enforceDocumentPermission(request, type, 'update');

      const body = attachmentBodySchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { scope, userId } = request.authContext!;
      const attachment = await DocumentService.addAttachment(
        db,
        scope as Required<typeof scope>,
        userId,
        id,
        body.data
      );

      return reply.status(201).send(attachment);
    }
  );
}
