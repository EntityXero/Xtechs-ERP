import { Queue } from 'bullmq';
import { redisConnection } from '../redis.js';
import type { ScopeContext } from '../metadata-service.js';

export interface AutomationJobData {
  automationId: string;
  entityType?: string;
  entityId?: string;
  payload?: any;
  context: Required<ScopeContext> & { userId?: string };
}

export const automationsQueue = new Queue<AutomationJobData>('automations', {
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
 * Queue a new automation execution job.
 */
export async function queueAutomationJob(data: AutomationJobData) {
  return await automationsQueue.add('automation-job', data);
}
