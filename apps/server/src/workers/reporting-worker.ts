import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { createDb } from '@xtechs/db';
import { reportExecutions, reportDefinitions } from '@xtechs/db/schema';
import { eq } from 'drizzle-orm';
import { ReportingService } from '../lib/reporting-service.js';
import type { ReportJobData } from '../lib/reporting-queue.js';
import type { QueryConfig } from '@xtechs/shared';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve data/reports folder path inside root workspace
const REPORTS_DIR = path.resolve(__dirname, '../../../../data/reports');

const databaseUrl = process.env['DATABASE_URL'] || 'postgresql://erp_dev:erp_dev_pass@localhost:5432/xtechs_erp';
const { db } = createDb(databaseUrl);

export const reportsWorker = new Worker<ReportJobData>(
  'reports',
  async (job: Job<ReportJobData>) => {
    const { executionId, reportCode, filters, context, outputFormat } = job.data;
    console.log(`[Worker] Started processing report execution: ${executionId} (code: ${reportCode})`);

    try {
      // 1. Update status to 'processing'
      await db
        .update(reportExecutions)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(reportExecutions.id, executionId));

      // 2. Fetch report execution to verify details
      const [execution] = await db
        .select()
        .from(reportExecutions)
        .where(eq(reportExecutions.id, executionId));

      if (!execution) {
        throw new Error(`Report execution not found: ${executionId}`);
      }

      const [definition] = await db
        .select()
        .from(reportDefinitions)
        .where(eq(reportDefinitions.id, execution.reportDefinitionId));

      if (!definition) {
        throw new Error(`Report definition not found for execution: ${executionId}`);
      }

      // 3. Execute report logic
      let columns: any[] = [];
      let rows: any[] = [];
      let reportName = definition.name;

      if (definition.type === 'standard') {
        const result = await ReportingService.executeStandardReport(db, context, reportCode, filters);
        columns = result.columns;
        rows = result.rows;
      } else {
        // Custom query execution
        rows = await ReportingService.executeCustomReport(
          db,
          context,
          definition.queryConfig as QueryConfig,
          filters
        );
        columns = (definition.columnsConfig as any[]) || [];
      }

      // 4. Generate formatted output
      let outputContent = '';
      if (outputFormat === 'csv') {
        outputContent = ReportingService.convertToCSV(columns, rows);
      } else if (outputFormat === 'html') {
        outputContent = ReportingService.convertToHTML(reportName, columns, rows);
      } else {
        outputContent = JSON.stringify(rows, null, 2);
      }

      // 5. Ensure folder exists and write file
      await fs.mkdir(REPORTS_DIR, { recursive: true });
      const fileName = `${reportCode}_${executionId}.${outputFormat}`;
      const filePath = path.join(REPORTS_DIR, fileName);
      await fs.writeFile(filePath, outputContent, 'utf-8');

      // Relative web path for downloading/viewing
      const resultUrl = `/data/reports/${fileName}`;

      // 6. Update execution status to 'completed'
      await db
        .update(reportExecutions)
        .set({
          status: 'completed',
          resultUrl,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reportExecutions.id, executionId));

      console.log(`[Worker] Successfully completed report execution: ${executionId}`);
    } catch (err: any) {
      console.error(`[Worker] Failed report execution: ${executionId}. Error:`, err.message);

      // Update execution status to 'failed'
      await db
        .update(reportExecutions)
        .set({
          status: 'failed',
          errorDetails: err.message || 'Unknown error occurred',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reportExecutions.id, executionId));

      throw err;
    }
  },
  {
    connection: redisConnection as any, // Cast connection option as any to avoid ioredis version type issues
    concurrency: 2,
  }
);

reportsWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});
