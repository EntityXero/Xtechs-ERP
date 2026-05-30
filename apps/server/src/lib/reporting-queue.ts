import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';
import type { ScopeContext } from './metadata-service.js';

export interface ReportJobData {
  executionId: string;
  reportCode: string;
  filters: Record<string, any>;
  context: Required<ScopeContext>;
  outputFormat: 'json' | 'csv' | 'html';
}

// Setup the main 'reports' processing queue
// Cast connection as any to avoid ioredis version mismatch type errors in BullMQ
export const reportsQueue = new Queue<ReportJobData>('reports', {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

/**
 * Queue a new report execution job for async processing.
 */
export async function queueReportJob(data: ReportJobData) {
  // Use static name to satisfy BullMQ typings, the specific execution ID is in data payload
  const job = await reportsQueue.add('report-job', data);
  return job;
}
