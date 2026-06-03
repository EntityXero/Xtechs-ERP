import { Queue } from 'bullmq';
import { redisConnection } from '../redis.js';
import type { ScopeContext } from '../metadata-service.js';

export interface SearchJobData {
  action: 'index' | 'delete';
  entityType: string;
  entityId: string;
  title?: string;
  description?: string;
  urlPath?: string;
  rawText?: string;
  metadata?: any;
  context: Required<ScopeContext>;
}

export const searchQueue = new Queue<SearchJobData>('search-indexing', {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

/**
 * Queue a search indexing task.
 */
export async function queueSearchJob(data: SearchJobData) {
  return await searchQueue.add('search-index-job', data);
}
