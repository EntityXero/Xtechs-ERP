import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { createDb } from '@xtechs/db';
import { SearchService } from '../lib/search-service.js';
import type { SearchJobData } from '../lib/search/queue.js';

const databaseUrl = process.env['DATABASE_URL'] || 'postgresql://erp_dev:erp_dev_pass@localhost:5432/xtechs_erp';
const { db } = createDb(databaseUrl);

export const searchWorker = new Worker<SearchJobData>(
  'search-indexing',
  async (job: Job<SearchJobData>) => {
    const { action, entityType, entityId, title, description, urlPath, rawText, metadata, context } = job.data;
    console.log(`[SearchWorker] Processing search indexing job: ${action} on ${entityType}:${entityId}`);

    try {
      if (action === 'index') {
        if (!title || !urlPath) {
          throw new Error('Title and urlPath are required for indexing');
        }
        await SearchService.upsertIndex(
          db,
          entityType,
          entityId,
          title,
          description || null,
          urlPath,
          rawText || '',
          context,
          metadata || {}
        );
        console.log(`[SearchWorker] Successfully indexed ${entityType}:${entityId}`);
      } else if (action === 'delete') {
        await SearchService.removeIndex(db, entityType, entityId);
        console.log(`[SearchWorker] Successfully removed index for ${entityType}:${entityId}`);
      } else {
        throw new Error(`Unsupported search action: ${action}`);
      }
    } catch (err: any) {
      console.error(`[SearchWorker] Error processing search job ${job.id}:`, err.message);
      throw err;
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 5,
  }
);

searchWorker.on('failed', (job, err) => {
  console.error(`[SearchWorker] Job ${job?.id} failed:`, err.message);
});
