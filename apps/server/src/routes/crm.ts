import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError } from '../lib/errors.js';
import { CrmService } from '../lib/crm-service.js';
import {
  createAddressSchema,
  createContactSchema,
  createCustomerSchema,
  updateCustomerSchema,
  createLeadSchema,
  createOpportunitySchema,
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

const updateLeadStatusSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'lost']),
});

const convertLeadSchema = z.object({
  title: z.string().min(1).max(255),
  expectedValue: z.number().nonnegative(),
});

const updateOppStageSchema = z.object({
  stage: z.enum(['prospecting', 'proposal', 'negotiation', 'won', 'lost']),
});

export async function crmRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // ADDRESSES
  // ==========================================

  fastify.post(
    '/api/v1/crm/addresses',
    { preHandler: [requirePermission('address', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createAddressSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid address payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const address = await CrmService.createAddress(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(address);
    }
  );

  // ==========================================
  // CONTACTS
  // ==========================================

  fastify.post(
    '/api/v1/crm/contacts',
    { preHandler: [requirePermission('contact', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createContactSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid contact payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const contact = await CrmService.createContact(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(contact);
    }
  );

  // ==========================================
  // CUSTOMERS
  // ==========================================

  fastify.post(
    '/api/v1/crm/customers',
    { preHandler: [requirePermission('customer', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createCustomerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid customer payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const customer = await CrmService.createCustomer(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(customer);
    }
  );

  fastify.patch(
    '/api/v1/crm/customers/:id',
    { preHandler: [requirePermission('customer', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const parsed = updateCustomerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid customer update payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const customer = await CrmService.updateCustomer(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(customer);
    }
  );

  // ==========================================
  // LEADS
  // ==========================================

  fastify.post(
    '/api/v1/crm/leads',
    { preHandler: [requirePermission('lead', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createLeadSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid lead payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const lead = await CrmService.createLead(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(lead);
    }
  );

  fastify.patch(
    '/api/v1/crm/leads/:id/status',
    { preHandler: [requirePermission('lead', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const parsed = updateLeadStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid status transition payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const lead = await CrmService.updateLeadStatus(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        parsed.data.status,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(lead);
    }
  );

  fastify.post(
    '/api/v1/crm/leads/:id/convert',
    { preHandler: [requirePermission('lead', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const parsed = convertLeadSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid convert payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const conversion = await CrmService.convertLeadToOpportunity(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        parsed.data.title,
        parsed.data.expectedValue,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(conversion);
    }
  );

  // ==========================================
  // OPPORTUNITIES
  // ==========================================

  fastify.post(
    '/api/v1/crm/opportunities',
    { preHandler: [requirePermission('opportunity', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createOpportunitySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid opportunity payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const opportunity = await CrmService.createOpportunity(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(opportunity);
    }
  );

  fastify.patch(
    '/api/v1/crm/opportunities/:id/stage',
    { preHandler: [requirePermission('opportunity', 'update')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameter ID', flattenZodErrors(params.error));
      }

      const parsed = updateOppStageSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid stage transition payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const opportunity = await CrmService.updateOpportunityStage(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        parsed.data.stage,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(opportunity);
    }
  );
}
