import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../hooks/require-permission.js';
import { createScopedDb } from '../lib/scoped-db.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors.js';
import { ReportingService } from '../lib/reporting-service.js';
import {
  createReportDefinitionSchema,
  executeReportRequestSchema,
  type QueryConfig,
} from '@xtechs/shared';
import { reportDefinitions, reportExecutions } from '@xtechs/db/schema';
import { eq, and } from 'drizzle-orm';
import { queueReportJob } from '../lib/reporting-queue.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '../../../../data/reports');

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

export async function reportsRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // REPORT DEFINITIONS
  // ==========================================

  fastify.post(
    '/api/v1/reports/definitions',
    { preHandler: [requirePermission('report_definition', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createReportDefinitionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid report definition payload', flattenZodErrors(parsed.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const definition = await ReportingService.createReportDefinition(
        db,
        scoped.auth.scope as any,
        scoped.auth.userId,
        parsed.data,
        { requestId: request.id, ipAddress: request.ip }
      );

      return reply.status(201).send(definition);
    }
  );

  fastify.get(
    '/api/v1/reports/definitions',
    { preHandler: [requirePermission('report_definition', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const scoped = createScopedDb(request.authContext!);
      const definitions = await ReportingService.listReportDefinitions(db, scoped.auth.scope as any);
      return reply.send(definitions);
    }
  );

  // ==========================================
  // REPORT EXECUTION (SYNCHRONOUS)
  // ==========================================

  fastify.post(
    '/api/v1/reports/execute/sync',
    { preHandler: [requirePermission('report_execution', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = executeReportRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid report execution request', flattenZodErrors(parsed.error));
      }

      const { reportCode, filters, outputFormat } = parsed.data;
      const scoped = createScopedDb(request.authContext!);
      const scope = scoped.auth.scope as any;

      // 1. Resolve if standard or custom definition
      let definition = await db
        .select()
        .from(reportDefinitions)
        .where(
          and(
            eq(reportDefinitions.code, reportCode),
            eq(reportDefinitions.tenantId, scope.tenantId),
            eq(reportDefinitions.businessId, scope.businessId),
            eq(reportDefinitions.branchId, scope.branchId)
          )
        )
        .then(rows => rows[0]);

      let columns: any[] = [];
      let rows: any[] = [];
      let reportName = reportCode;

      if (definition) {
        // Custom report definition
        rows = await ReportingService.executeCustomReport(
          db,
          scope,
          definition.queryConfig as QueryConfig,
          filters
        );
        columns = (definition.columnsConfig as any[]) || [];
        reportName = definition.name;
      } else {
        // Standard report execution
        try {
          const result = await ReportingService.executeStandardReport(db, scope, reportCode, filters);
          columns = result.columns;
          rows = result.rows;
        } catch (err: any) {
          throw new ValidationError(err.message);
        }
      }

      // 2. Format output
      if (outputFormat === 'csv') {
        const csv = ReportingService.convertToCSV(columns, rows);
        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="${reportCode}.csv"`)
          .send(csv);
      } else if (outputFormat === 'html') {
        const html = ReportingService.convertToHTML(reportName, columns, rows);
        return reply.header('Content-Type', 'text/html').send(html);
      }

      return reply.send({ columns, rows });
    }
  );

  // ==========================================
  // REPORT EXECUTION (ASYNCHRONOUS)
  // ==========================================

  fastify.post(
    '/api/v1/reports/execute/async',
    { preHandler: [requirePermission('report_execution', 'create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = executeReportRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid report execution request', flattenZodErrors(parsed.error));
      }

      const { reportCode, filters, outputFormat } = parsed.data;
      const scoped = createScopedDb(request.authContext!);
      const scope = scoped.auth.scope as any;

      // 1. Verify/find report definition
      let definition = await db
        .select()
        .from(reportDefinitions)
        .where(
          and(
            eq(reportDefinitions.code, reportCode),
            eq(reportDefinitions.tenantId, scope.tenantId),
            eq(reportDefinitions.businessId, scope.businessId),
            eq(reportDefinitions.branchId, scope.branchId)
          )
        )
        .then(rows => rows[0]);

      let defId = definition?.id;

      if (!definition) {
        // If standard, create an internal default definition first so we can reference it
        const [newDef] = await db
          .insert(reportDefinitions)
          .values({
            tenantId: scope.tenantId!,
            businessId: scope.businessId!,
            branchId: scope.branchId!,
            code: reportCode,
            name: reportCode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            type: 'standard',
            module: 'accounting',
            queryConfig: {},
            filtersConfig: [],
            columnsConfig: [],
          })
          .returning();
        
        if (!newDef) {
          throw new ValidationError('Failed to auto-create standard report definition');
        }
        defId = newDef.id;
      }

      // 2. Create the execution log entry
      const [execution] = await db
        .insert(reportExecutions)
        .values({
          tenantId: scope.tenantId!,
          businessId: scope.businessId!,
          branchId: scope.branchId!,
          reportDefinitionId: defId!,
          status: 'pending',
          filtersApplied: filters || {},
        })
        .returning();

      if (!execution) {
        throw new ValidationError('Failed to queue report execution');
      }

      // 3. Add background job to BullMQ queue
      await queueReportJob({
        executionId: execution.id,
        reportCode,
        filters,
        context: scope,
        outputFormat,
      });

      return reply.status(202).send(execution);
    }
  );

  fastify.get(
    '/api/v1/reports/executions/:id',
    { preHandler: [requirePermission('report_execution', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid execution ID', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const scope = scoped.auth.scope as any;

      const [execution] = await db
        .select()
        .from(reportExecutions)
        .where(
          and(
            eq(reportExecutions.id, params.data.id),
            eq(reportExecutions.tenantId, scope.tenantId),
            eq(reportExecutions.businessId, scope.businessId),
            eq(reportExecutions.branchId, scope.branchId)
          )
        );

      if (!execution) {
        throw new NotFoundError('ReportExecution', params.data.id);
      }

      return reply.send(execution);
    }
  );

  fastify.get(
    '/api/v1/reports/executions/:id/download',
    { preHandler: [requirePermission('report_execution', 'read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ValidationError('Invalid execution ID', flattenZodErrors(params.error));
      }

      const scoped = createScopedDb(request.authContext!);
      const scope = scoped.auth.scope as any;

      const [execution] = await db
        .select()
        .from(reportExecutions)
        .where(
          and(
            eq(reportExecutions.id, params.data.id),
            eq(reportExecutions.tenantId, scope.tenantId),
            eq(reportExecutions.businessId, scope.businessId),
            eq(reportExecutions.branchId, scope.branchId)
          )
        );

      if (!execution) {
        throw new NotFoundError('ReportExecution', params.data.id);
      }

      if (execution.status !== 'completed' || !execution.resultUrl) {
        throw new ValidationError(`Report execution status is ${execution.status}, not ready for download`);
      }

      // Read output file safely
      const fileName = path.basename(execution.resultUrl);
      const filePath = path.join(REPORTS_DIR, fileName);

      try {
        const fileContent = await fs.readFile(filePath);
        const ext = path.extname(fileName);
        let contentType = 'application/octet-stream';
        if (ext === '.csv') contentType = 'text/csv';
        if (ext === '.html') contentType = 'text/html';

        return reply
          .header('Content-Type', contentType)
          .header('Content-Disposition', `attachment; filename="${fileName}"`)
          .send(fileContent);
      } catch (err: any) {
        throw new ValidationError(`Failed to read report output file: ${err.message}`);
      }
    }
  );
}
