import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError } from '../lib/errors.js';
import { AccountingService } from '../lib/accounting-service.js';
import {
  createCurrencySchema,
  createFiscalYearSchema,
  createAccountSchema,
  createJournalEntrySchema,
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

export async function accountingRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // CURRENCIES
  // ==========================================

  fastify.post(
    '/api/v1/accounting/currencies',
    { preHandler: [requirePermission('currency', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createCurrencySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid currency payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const currency = await AccountingService.createCurrency(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(currency);
    }
  );

  fastify.get(
    '/api/v1/accounting/currencies',
    { preHandler: [requirePermission('currency', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const list = await AccountingService.getCurrencies(db, scoped.auth.scope as any);
      return reply.send(list);
    }
  );

  // ==========================================
  // FISCAL YEARS
  // ==========================================

  fastify.post(
    '/api/v1/accounting/fiscal-years',
    { preHandler: [requirePermission('fiscal_year', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createFiscalYearSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid fiscal year payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const fy = await AccountingService.createFiscalYear(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(fy);
    }
  );

  fastify.get(
    '/api/v1/accounting/fiscal-years',
    { preHandler: [requirePermission('fiscal_year', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const list = await AccountingService.getFiscalYears(db, scoped.auth.scope as any);
      return reply.send(list);
    }
  );

  // ==========================================
  // ACCOUNTS
  // ==========================================

  fastify.post(
    '/api/v1/accounting/accounts',
    { preHandler: [requirePermission('account', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createAccountSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid account payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const account = await AccountingService.createAccount(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(account);
    }
  );

  fastify.get(
    '/api/v1/accounting/accounts',
    { preHandler: [requirePermission('account', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const list = await AccountingService.getAccounts(db, scoped.auth.scope as any);
      return reply.send(list);
    }
  );

  fastify.get(
    '/api/v1/accounting/accounts/:id/balance',
    { preHandler: [requirePermission('account', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const balance = await AccountingService.getAccountBalance(
        db,
        scoped.auth.scope as any,
        params.data.id
      );

      return reply.send(balance);
    }
  );

  // ==========================================
  // JOURNAL ENTRIES
  // ==========================================

  fastify.post(
    '/api/v1/accounting/journal-entries',
    { preHandler: [requirePermission('journal_entry', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createJournalEntrySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid journal entry payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const entry = await AccountingService.createJournalEntry(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(entry);
    }
  );

  fastify.get(
    '/api/v1/accounting/journal-entries',
    { preHandler: [requirePermission('journal_entry', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const list = await AccountingService.getJournalEntries(db, scoped.auth.scope as any);
      return reply.send(list);
    }
  );

  fastify.get(
    '/api/v1/accounting/journal-entries/:id',
    { preHandler: [requirePermission('journal_entry', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const entry = await AccountingService.getJournalEntryWithLines(
        db,
        scoped.auth.scope as any,
        params.data.id
      );

      return reply.send(entry);
    }
  );

  fastify.post(
    '/api/v1/accounting/journal-entries/:id/post',
    { preHandler: [requirePermission('journal_entry', 'approve')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const posted = await AccountingService.postJournalEntry(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(posted);
    }
  );

  fastify.post(
    '/api/v1/accounting/journal-entries/:id/reverse',
    { preHandler: [requirePermission('journal_entry', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid path parameters', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const reversed = await AccountingService.reverseJournalEntry(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        params.data.id,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.send(reversed);
    }
  );
}
