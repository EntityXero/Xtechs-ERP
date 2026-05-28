import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { metadataDefs, metadataRevisions } from '@xtechs/db/schema';
import {
  createMetadataDefSchema,
  createMetadataRevisionSchema
} from '@xtechs/shared';
import { requirePermission } from '../hooks/require-permission.js';
import { hasPermission } from '../lib/permission-service.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError
} from '../lib/errors.js';
import {
  resolveMetadata,
  createMetadataDefinition,
  createMetadataRevision
} from '../lib/metadata-service.js';
import { logAudit } from '../lib/audit-service.js';

const keyParamSchema = z.object({
  key: z.string().min(1).max(100),
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

export async function metadataRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ─── GET /api/v1/metadata/defs ──────────────────────────────
  fastify.get(
    '/api/v1/metadata/defs',
    { preHandler: [requirePermission('metadata', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const allDefs = await db.select().from(metadataDefs);
      return reply.send(allDefs);
    }
  );

  // ─── POST /api/v1/metadata/defs ─────────────────────────────
  fastify.post(
    '/api/v1/metadata/defs',
    { preHandler: [requirePermission('metadata', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createMetadataDefSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const newDef = await createMetadataDefinition(db, body.data);

      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId: request.authContext!.scope.tenantId,
        businessId: request.authContext!.scope.businessId,
        branchId: request.authContext!.scope.branchId,
        entityType: 'metadata_def',
        entityId: newDef.id,
        action: 'create',
        newValues: newDef,
        ipAddress: request.clientIp,
      });

      return reply.status(201).send(newDef);
    }
  );

  // ─── GET /api/v1/metadata/defs/:key ─────────────────────────
  fastify.get(
    '/api/v1/metadata/defs/:key',
    { preHandler: [requirePermission('metadata', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = keyParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const { key } = params.data;
      const { scope } = request.authContext!;

      const resolved = await resolveMetadata(db, key, scope);
      if (!resolved) {
        throw new NotFoundError('metadata definition', key);
      }

      return reply.send(resolved);
    }
  );

  // ─── POST /api/v1/metadata/defs/:key/revisions ──────────────
  fastify.post(
    '/api/v1/metadata/defs/:key/revisions',
    { preHandler: [requirePermission('metadata', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = keyParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const body = createMetadataRevisionSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { key } = params.data;
      const { tenantId, businessId, branchId, payload } = body.data;

      // Access control: Ensure user is authorized for the target scope
      const isSuperAdmin = hasPermission(request.authContext!.permissions || [], '*', '*');
      const userScope = request.authContext!.scope;

      if (!isSuperAdmin) {
        // Non-super-admins cannot write Global revisions
        if (!tenantId && !businessId && !branchId) {
          throw new ForbiddenError('Only system administrators can publish Global metadata revisions');
        }
        // Non-super-admins must match their current context
        if (tenantId && tenantId !== userScope.tenantId) {
          throw new ForbiddenError('Tenant scope mismatch');
        }
        if (businessId && businessId !== userScope.businessId) {
          throw new ForbiddenError('Business scope mismatch');
        }
        if (branchId && branchId !== userScope.branchId) {
          throw new ForbiddenError('Branch scope mismatch');
        }
      }

      const newRevision = await createMetadataRevision(db, key, {
        tenantId,
        businessId,
        branchId,
        payload,
        createdBy: request.authContext!.userId,
      });

      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId: tenantId || userScope.tenantId,
        businessId: businessId || userScope.businessId,
        branchId: branchId || userScope.branchId,
        entityType: 'metadata_revision',
        entityId: newRevision.id,
        action: 'create',
        newValues: newRevision,
        ipAddress: request.clientIp,
      });

      return reply.status(201).send(newRevision);
    }
  );

  // ─── GET /api/v1/metadata/defs/:key/revisions ───────────────
  fastify.get(
    '/api/v1/metadata/defs/:key/revisions',
    { preHandler: [requirePermission('metadata', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = keyParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const { key } = params.data;

      // Find definition
      const defs = await db.select().from(metadataDefs).where(eq(metadataDefs.key, key)).limit(1);
      const def = defs[0];
      if (!def) {
        throw new NotFoundError('metadata definition', key);
      }


      // Fetch all revisions for this def, sorted by version desc
      const revisions = await db.select()
        .from(metadataRevisions)
        .where(eq(metadataRevisions.defId, def.id))
        .orderBy(metadataRevisions.version);

      return reply.send(revisions);
    }
  );
}
