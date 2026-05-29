import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError } from '../lib/errors.js';
import { HrService } from '../lib/hr-service.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  createDesignationSchema,
  updateDesignationSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  createLeaveRequestSchema,
} from '@xtechs/shared';

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

const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export async function hrRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // DEPARTMENTS
  // ==========================================

  fastify.post(
    '/api/v1/hr/departments',
    { preHandler: [requirePermission('department', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createDepartmentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid department payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const dept = await HrService.createDepartment(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(dept);
    }
  );

  // ==========================================
  // DESIGNATIONS
  // ==========================================

  fastify.post(
    '/api/v1/hr/designations',
    { preHandler: [requirePermission('designation', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createDesignationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid designation payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const designation = await HrService.createDesignation(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(designation);
    }
  );

  // ==========================================
  // EMPLOYEES
  // ==========================================

  fastify.post(
    '/api/v1/hr/employees',
    { preHandler: [requirePermission('employee', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createEmployeeSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid employee payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const employee = await HrService.createEmployee(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(employee);
    }
  );

  fastify.patch(
    '/api/v1/hr/employees/:id',
    { preHandler: [requirePermission('employee', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const parsed = updateEmployeeSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid employee update payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const employee = await HrService.updateEmployee(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(employee);
    }
  );

  // ==========================================
  // LEAVE REQUESTS
  // ==========================================

  fastify.post(
    '/api/v1/hr/leaves',
    { preHandler: [requirePermission('leave_request', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createLeaveRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid leave request payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const leaveRequest = await HrService.createLeaveRequest(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(leaveRequest);
    }
  );

  fastify.post(
    '/api/v1/hr/leaves/:id/post',
    { preHandler: [requirePermission('leave_request', 'approve')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const posted = await HrService.postLeaveRequest(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(posted);
    }
  );
}
