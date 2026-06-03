import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { businesses, branches } from '@xtechs/db/schema';
import { createBusinessSchema, createBranchSchema } from '@xtechs/shared';
import { requirePermission } from '../hooks/require-permission.js';
import { ValidationError, ConflictError } from '../lib/errors.js';
import { logAudit } from '../lib/audit-service.js';

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

export async function tenantRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ─── GET /api/v1/businesses ──────────────────────────────────
  fastify.get(
    '/api/v1/businesses',
    { preHandler: [requirePermission('tenant', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.authContext!.scope;

      const allBusinesses = await db
        .select()
        .from(businesses)
        .where(eq(businesses.tenantId, tenantId));

      return reply.send(allBusinesses);
    }
  );

  // ─── POST /api/v1/businesses ─────────────────────────────────
  fastify.post(
    '/api/v1/businesses',
    { preHandler: [requirePermission('tenant', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.authContext!.scope;

      // Force tenantId from token
      const bodyPayload = { ...request.body as object, tenantId };
      const body = createBusinessSchema.safeParse(bodyPayload);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { name, legalName, metadata } = body.data;

      // Check if business already exists
      const [existing] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(and(eq(businesses.name, name), eq(businesses.tenantId, tenantId)))
        .limit(1);

      if (existing) {
        throw new ConflictError(`Business with name '${name}' already exists in this tenant`);
      }

      const [newBusiness] = await db
        .insert(businesses)
        .values({
          tenantId,
          name,
          legalName,
          metadata: metadata || {},
        })
        .returning();

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId,
        businessId: newBusiness!.id,
        branchId: request.authContext!.scope.branchId,
        entityType: 'business',
        entityId: newBusiness!.id,
        action: 'create',
        newValues: newBusiness,
        ipAddress: request.clientIp,
      });

      return reply.status(201).send(newBusiness);
    }
  );

  // ─── GET /api/v1/branches ────────────────────────────────────
  fastify.get(
    '/api/v1/branches',
    { preHandler: [requirePermission('tenant', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, businessId } = request.authContext!.scope;

      const allBranches = await db
        .select()
        .from(branches)
        .where(
          and(
            eq(branches.tenantId, tenantId),
            eq(branches.businessId, businessId)
          )
        );

      return reply.send(allBranches);
    }
  );

  // ─── POST /api/v1/branches ───────────────────────────────────
  fastify.post(
    '/api/v1/branches',
    { preHandler: [requirePermission('tenant', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, businessId } = request.authContext!.scope;

      // Force tenantId and businessId from token
      const bodyPayload = { ...request.body as object, tenantId, businessId };
      const body = createBranchSchema.safeParse(bodyPayload);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { name, code, isDefault, metadata } = body.data;

      // Check if branch name or code already exists in this business
      const [existingName] = await db
        .select({ id: branches.id })
        .from(branches)
        .where(
          and(
            eq(branches.businessId, businessId),
            eq(branches.name, name)
          )
        )
        .limit(1);

      if (existingName) {
        throw new ConflictError(`Branch with name '${name}' already exists in this business`);
      }

      const [existingCode] = await db
        .select({ id: branches.id })
        .from(branches)
        .where(
          and(
            eq(branches.businessId, businessId),
            eq(branches.code, code)
          )
        )
        .limit(1);

      if (existingCode) {
        throw new ConflictError(`Branch with code '${code}' already exists in this business`);
      }

      // If isDefault is true, unset default status of other branches in this business
      if (isDefault) {
        await db
          .update(branches)
          .set({ isDefault: false })
          .where(eq(branches.businessId, businessId));
      }

      const [newBranch] = await db
        .insert(branches)
        .values({
          tenantId,
          businessId,
          name,
          code,
          isDefault: isDefault || false,
          metadata: metadata || {},
        })
        .returning();

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId,
        businessId,
        branchId: newBranch!.id,
        entityType: 'branch',
        entityId: newBranch!.id,
        action: 'create',
        newValues: newBranch,
        ipAddress: request.clientIp,
      });

      return reply.status(201).send(newBranch);
    }
  );
}
