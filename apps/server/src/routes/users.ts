import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { users, userRoles, roles, branches } from '@xtechs/db/schema';
import { createUserSchema } from '@xtechs/shared';
import { requirePermission } from '../hooks/require-permission.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../lib/errors.js';
import { logAudit } from '../lib/audit-service.js';
import { hashPassword } from '../lib/auth.js';

const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

const userStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'archived']),
});

const assignUserRoleSchema = z.object({
  roleId: z.string().uuid(),
  branchId: z.string().uuid(),
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

export async function userRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ─── GET /api/v1/users ───────────────────────────────────────
  fastify.get(
    '/api/v1/users',
    { preHandler: [requirePermission('user', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.authContext!.scope;

      // Select users in this tenant
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          status: users.status,
          lastLoginAt: users.lastLoginAt,
          forcePasswordChange: users.forcePasswordChange,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.tenantId, tenantId));

      // For each user, fetch their branch/role mappings
      const userListWithRoles = await Promise.all(
        allUsers.map(async (u) => {
          const rolesMapping = await db
            .select({
              branchId: userRoles.branchId,
              branchName: branches.name,
              roleId: userRoles.roleId,
              roleName: roles.name,
            })
            .from(userRoles)
            .innerJoin(branches, eq(userRoles.branchId, branches.id))
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(eq(userRoles.userId, u.id));

          return {
            ...u,
            branches: rolesMapping,
          };
        })
      );

      return reply.send(userListWithRoles);
    }
  );

  // ─── POST /api/v1/users ──────────────────────────────────────
  fastify.post(
    '/api/v1/users',
    { preHandler: [requirePermission('user', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createUserSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { email, displayName, password, branchId, roleId, forcePasswordChange } = body.data;
      const { tenantId, businessId } = request.authContext!.scope;

      // Check if user already exists in this tenant
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), eq(users.tenantId, tenantId)))
        .limit(1);

      if (existing) {
        throw new ConflictError('A user with this email already exists in this tenant');
      }

      // Verify branch exists and belongs to correct tenant/business
      const [branch] = await db
        .select({ id: branches.id })
        .from(branches)
        .where(
          and(
            eq(branches.id, branchId),
            eq(branches.tenantId, tenantId),
            eq(branches.businessId, businessId)
          )
        )
        .limit(1);

      if (!branch) {
        throw new NotFoundError('Branch', branchId);
      }

      // Verify role exists
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
        throw new NotFoundError('Role', roleId);
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Insert User
      const [newUser] = await db
        .insert(users)
        .values({
          tenantId,
          email,
          passwordHash,
          displayName,
          status: 'active',
          forcePasswordChange: forcePasswordChange ?? true,
        })
        .returning();

      // Insert User-Role mapping
      await db
        .insert(userRoles)
        .values({
          userId: newUser!.id,
          roleId,
          branchId,
        });

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId,
        businessId,
        branchId: request.authContext!.scope.branchId,
        entityType: 'user',
        entityId: newUser!.id,
        action: 'create',
        newValues: {
          email,
          displayName,
          status: 'active',
          forcePasswordChange: forcePasswordChange ?? true,
          roles: [{ branchId, roleId }],
        },
        ipAddress: request.clientIp,
      });

      return reply.status(201).send({
        id: newUser!.id,
        email: newUser!.email,
        displayName: newUser!.displayName,
        status: newUser!.status,
        forcePasswordChange: newUser!.forcePasswordChange,
      });
    }
  );

  // ─── PATCH /api/v1/users/:id/status ──────────────────────────
  fastify.patch(
    '/api/v1/users/:id/status',
    { preHandler: [requirePermission('user', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = uuidParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const body = userStatusSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const userId = params.data.id;
      const { status } = body.data;
      const { tenantId, businessId } = request.authContext!.scope;

      // Find user in this tenant
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .limit(1);

      if (!user) {
        throw new NotFoundError('User', userId);
      }

      // Prevent user from suspending themselves
      if (user.id === request.authContext!.userId) {
        throw new ValidationError('You cannot change your own status');
      }

      const [updatedUser] = await db
        .update(users)
        .set({ status, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId,
        businessId,
        branchId: request.authContext!.scope.branchId,
        entityType: 'user',
        entityId: userId,
        action: 'update_status',
        oldValues: { status: user.status },
        newValues: { status },
        ipAddress: request.clientIp,
      });

      return reply.send({
        id: updatedUser!.id,
        status: updatedUser!.status,
      });
    }
  );

  // ─── POST /api/v1/users/:id/roles ────────────────────────────
  fastify.post(
    '/api/v1/users/:id/roles',
    { preHandler: [requirePermission('user', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = uuidParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const body = assignUserRoleSchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const userId = params.data.id;
      const { roleId, branchId } = body.data;
      const { tenantId, businessId } = request.authContext!.scope;

      // 1. Ensure user exists in this tenant
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .limit(1);

      if (!user) {
        throw new NotFoundError('User', userId);
      }

      // 2. Ensure role exists
      const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.id, roleId), eq(roles.businessId, businessId)))
        .limit(1);

      if (!role) {
        throw new NotFoundError('Role', roleId);
      }

      // 3. Ensure branch exists
      const [branch] = await db
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.id, branchId), eq(branches.businessId, businessId)))
        .limit(1);

      if (!branch) {
        throw new NotFoundError('Branch', branchId);
      }

      // 4. Check if relation already exists
      const [existing] = await db
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, roleId),
            eq(userRoles.branchId, branchId)
          )
        )
        .limit(1);

      if (existing) {
        return reply.send({ message: 'Role mapping already exists' });
      }

      // 5. Insert
      const [newMapping] = await db
        .insert(userRoles)
        .values({ userId, roleId, branchId })
        .returning();

      // Audit Log
      logAudit(db, {
        actorId: request.authContext!.userId,
        tenantId,
        businessId,
        branchId: request.authContext!.scope.branchId,
        entityType: 'user_role',
        entityId: newMapping!.id,
        action: 'assign',
        newValues: { userId, roleId, branchId },
        ipAddress: request.clientIp,
      });

      return reply.status(201).send(newMapping);
    }
  );
}
