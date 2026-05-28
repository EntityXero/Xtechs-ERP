import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import {
  permissions,
  roles,
  rolePermissions,
} from '@xtechs/db/schema';
import {
  createPermissionSchema,
  createRoleSchema,
  assignPermissionSchema,
} from '@xtechs/shared';
import { requirePermission } from '../hooks/require-permission.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../lib/errors.js';
import { logAudit } from '../lib/audit-service.js';

const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

const rolePermissionParamsSchema = z.object({
  id: z.string().uuid('Invalid Role ID format'),
  permissionId: z.string().uuid('Invalid Permission ID format'),
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

export async function permissionRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ─── GET /api/v1/permissions ───────────────────────────────
  fastify.get(
    '/api/v1/permissions',
    { preHandler: [requirePermission('permission', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const allPermissions = await db.select().from(permissions);
      return reply.send(allPermissions);
    }
  );

  // ─── POST /api/v1/permissions ──────────────────────────────
  fastify.post(
    '/api/v1/permissions',
    { preHandler: [requirePermission('permission', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createPermissionSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { resource, action, effect, description } = body.data;

      // Prevent duplicate definitions
      const [existing] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(
          and(
            eq(permissions.resource, resource),
            eq(permissions.action, action),
            eq(permissions.effect, effect)
          )
        )
        .limit(1);

      if (existing) {
        throw new ConflictError(
          `Permission '${resource}:${action}' with effect '${effect}' already exists`
        );
      }

      const [newPermission] = await db
        .insert(permissions)
        .values({
          resource,
          action,
          effect,
          description,
        })
        .returning();

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId: request.authContext!.scope.tenantId,
        businessId: request.authContext!.scope.businessId,
        branchId: request.authContext!.scope.branchId,
        entityType: 'permission',
        entityId: newPermission!.id,
        action: 'create',
        newValues: newPermission,
        ipAddress: request.clientIp,
      });

      return reply.status(201).send(newPermission);
    }
  );

  // ─── GET /api/v1/roles ─────────────────────────────────────
  fastify.get(
    '/api/v1/roles',
    { preHandler: [requirePermission('role', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, businessId } = request.authContext!.scope;

      const businessRoles = await db
        .select()
        .from(roles)
        .where(
          and(
            eq(roles.tenantId, tenantId),
            eq(roles.businessId, businessId)
          )
        );

      return reply.send(businessRoles);
    }
  );

  // ─── POST /api/v1/roles ────────────────────────────────────
  fastify.post(
    '/api/v1/roles',
    { preHandler: [requirePermission('role', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createRoleSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { name, description } = body.data;
      const { tenantId, businessId } = request.authContext!.scope;

      // Prevent duplicate role name in the same business
      const [existing] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.businessId, businessId),
            eq(roles.name, name)
          )
        )
        .limit(1);

      if (existing) {
        throw new ConflictError(`Role '${name}' already exists in this business`);
      }

      const [newRole] = await db
        .insert(roles)
        .values({
          tenantId,
          businessId,
          name,
          description,
        })
        .returning();

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId,
        businessId,
        branchId: request.authContext!.scope.branchId,
        entityType: 'role',
        entityId: newRole!.id,
        action: 'create',
        newValues: newRole,
        ipAddress: request.clientIp,
      });

      return reply.status(201).send(newRole);
    }
  );

  // ─── GET /api/v1/roles/:id/permissions ──────────────────────
  fastify.get(
    '/api/v1/roles/:id/permissions',
    { preHandler: [requirePermission('role', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = uuidParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const roleId = params.data.id;
      const { tenantId, businessId } = request.authContext!.scope;

      // Ensure the role exists and belongs to the business scope
      const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.id, roleId),
            eq(roles.tenantId, tenantId),
            eq(roles.businessId, businessId)
          )
        )
        .limit(1);

      if (!role) {
        throw new NotFoundError('role', roleId);
      }

      // Fetch all assigned permissions
      const rolePerms = await db
        .select({
          id: permissions.id,
          resource: permissions.resource,
          action: permissions.action,
          effect: permissions.effect,
          description: permissions.description,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, roleId));

      return reply.send(rolePerms);
    }
  );

  // ─── POST /api/v1/roles/:id/permissions ─────────────────────
  fastify.post(
    '/api/v1/roles/:id/permissions',
    { preHandler: [requirePermission('role', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = uuidParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const body = assignPermissionSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const roleId = params.data.id;
      const { permissionId } = body.data;
      const { tenantId, businessId } = request.authContext!.scope;

      // 1. Ensure the role exists and is scoped correctly
      const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.id, roleId),
            eq(roles.tenantId, tenantId),
            eq(roles.businessId, businessId)
          )
        )
        .limit(1);

      if (!role) {
        throw new NotFoundError('role', roleId);
      }

      // 2. Ensure permission exists
      const [perm] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.id, permissionId))
        .limit(1);

      if (!perm) {
        throw new NotFoundError('permission', permissionId);
      }

      // 3. Prevent duplicate mapping (idempotent)
      const [existingMapping] = await db
        .select({ id: rolePermissions.id })
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.permissionId, permissionId)
          )
        )
        .limit(1);

      if (existingMapping) {
        return reply.status(200).send({ message: 'Permission already assigned to this role' });
      }

      // 4. Assign permission
      const [newAssignment] = await db
        .insert(rolePermissions)
        .values({
          roleId,
          permissionId,
        })
        .returning();

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId,
        businessId,
        branchId: request.authContext!.scope.branchId,
        entityType: 'role_permission',
        entityId: newAssignment!.id,
        action: 'assign',
        newValues: { roleId, permissionId },
        ipAddress: request.clientIp,
      });

      return reply.status(200).send(newAssignment);
    }
  );

  // ─── DELETE /api/v1/roles/:id/permissions/:permissionId ────
  fastify.delete(
    '/api/v1/roles/:id/permissions/:permissionId',
    { preHandler: [requirePermission('role', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = rolePermissionParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const { id: roleId, permissionId } = params.data;
      const { tenantId, businessId } = request.authContext!.scope;

      // 1. Ensure the role exists and is scoped correctly
      const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.id, roleId),
            eq(roles.tenantId, tenantId),
            eq(roles.businessId, businessId)
          )
        )
        .limit(1);

      if (!role) {
        throw new NotFoundError('role', roleId);
      }

      // 2. Find and delete the mapping
      const [existingMapping] = await db
        .select({ id: rolePermissions.id })
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.permissionId, permissionId)
          )
        )
        .limit(1);

      if (!existingMapping) {
        throw new NotFoundError(
          'role permission mapping',
          `role: ${roleId}, permission: ${permissionId}`
        );
      }

      await db
        .delete(rolePermissions)
        .where(eq(rolePermissions.id, existingMapping.id));

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId,
        businessId,
        branchId: request.authContext!.scope.branchId,
        entityType: 'role_permission',
        entityId: existingMapping.id,
        action: 'revoke',
        oldValues: { roleId, permissionId },
        ipAddress: request.clientIp,
      });

      return reply.status(200).send({ message: 'Permission revoked from role successfully' });
    }
  );
}
