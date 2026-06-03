import { Queue } from 'bullmq';
import { redisConnection } from '../redis.js';
import type { ScopeContext } from '../metadata-service.js';

export interface NotificationJobData {
  notificationId: string;
  context: Required<ScopeContext>;
}

// Setup the main 'notifications' processing queue
// Cast connection as any to avoid ioredis version mismatch type errors in BullMQ
export const notificationsQueue = new Queue<NotificationJobData>('notifications', {
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
 * Queue a new notification job for async processing.
 */
export async function queueNotificationJob(data: NotificationJobData) {
  const job = await notificationsQueue.add('notification-job', data);
  return job;
}
