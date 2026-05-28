import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, or, desc } from 'drizzle-orm';
import { workflowApprovals, workflowDelegations, userRoles, roles } from '@xtechs/db/schema';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError, UnauthorizedError } from '../lib/errors.js';
import { WorkflowService } from '../lib/workflow-service.js';

const approveRejectBodySchema = z.object({
  comments: z.string().max(2000).optional(),
});

const delegateBodySchema = z.object({
  targetUserId: z.string().uuid(),
});

const delegationRuleBodySchema = z.object({
  delegatorId: z.string().uuid(),
  delegateeId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
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

export async function workflowRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ─── GET /api/v1/workflows/approvals/pending ─────────────
  fastify.get(
    '/api/v1/workflows/approvals/pending',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { authContext } = request;
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const { userId, scope } = authContext;
      const branchId = scope.branchId;

      const scoped = createScopedDb(authContext);

      // 1. Fetch user's assigned roles in this branch
      const userRoleRecords = await db
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.branchId, branchId)
          )
        );
      
      const userRoleNames = userRoleRecords.map((ur) => ur.name);

      // 2. Fetch all pending/delegated/escalated approvals in branch scope
      const approvalsList = await db
        .select()
        .from(workflowApprovals)
        .where(
          and(
            or(
              eq(workflowApprovals.status, 'pending'),
              eq(workflowApprovals.status, 'delegated'),
              eq(workflowApprovals.status, 'escalated')
            ),
            scoped.filters(workflowApprovals)
          )
        )
        .orderBy(desc(workflowApprovals.createdAt));

      // 3. Filter by what user is authorized to approve
      const userApprovals = approvalsList.filter((app) => {
        if (app.assignedUserId) {
          return app.assignedUserId === userId || app.delegatedTo === userId;
        }
        if (app.requiredRole) {
          return userRoleNames.includes(app.requiredRole);
        }
        return false;
      });

      return reply.send(userApprovals);
    }
  );

  // ─── POST /api/v1/workflows/approvals/:id/approve ────────
  fastify.post(
    '/api/v1/workflows/approvals/:id/approve',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { authContext } = request;
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid approval ID', flattenZodErrors(params.error));
      }

      const body = approveRejectBodySchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { id } = params.data;
      const { comments } = body.data;
      const { scope, userId } = authContext;

      const approval = await WorkflowService.approveRequest(
        db,
        scope as Required<typeof scope>,
        userId,
        id,
        comments,
        {
          requestId: request.id,
          ipAddress: request.clientIp,
        }
      );

      return reply.send(approval);
    }
  );

  // ─── POST /api/v1/workflows/approvals/:id/reject ─────────
  fastify.post(
    '/api/v1/workflows/approvals/:id/reject',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { authContext } = request;
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid approval ID', flattenZodErrors(params.error));
      }

      const body = approveRejectBodySchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { id } = params.data;
      const { comments } = body.data;
      const { scope, userId } = authContext;

      const approval = await WorkflowService.rejectRequest(
        db,
        scope as Required<typeof scope>,
        userId,
        id,
        comments,
        {
          requestId: request.id,
          ipAddress: request.clientIp,
        }
      );

      return reply.send(approval);
    }
  );

  // ─── POST /api/v1/workflows/approvals/:id/delegate ───────
  fastify.post(
    '/api/v1/workflows/approvals/:id/delegate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { authContext } = request;
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid approval ID', flattenZodErrors(params.error));
      }

      const body = delegateBodySchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { id } = params.data;
      const { targetUserId } = body.data;
      const { scope, userId } = authContext;

      const approval = await WorkflowService.delegateApproval(
        db,
        scope as Required<typeof scope>,
        userId,
        id,
        targetUserId
      );

      return reply.send(approval);
    }
  );

  // ─── POST /api/v1/workflows/delegations ─────────────────
  fastify.post(
    '/api/v1/workflows/delegations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { authContext } = request;
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const body = delegationRuleBodySchema.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError('Validation failed', flattenZodErrors(body.error));
      }

      const { scope, userId } = authContext;

      const rule = await WorkflowService.createDelegationRule(
        db,
        scope as Required<typeof scope>,
        userId,
        {
          delegatorId: body.data.delegatorId,
          delegateeId: body.data.delegateeId,
          startDate: new Date(body.data.startDate),
          endDate: new Date(body.data.endDate),
        }
      );

      return reply.status(201).send(rule);
    }
  );

  // ─── POST /api/v1/workflows/escalate ────────────────────
  fastify.post(
    '/api/v1/workflows/escalate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { authContext } = request;
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const result = await WorkflowService.escalatePastDueApprovals(db);
      return reply.send(result);
    }
  );
}
