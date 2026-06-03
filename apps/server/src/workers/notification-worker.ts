import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { createDb } from '@xtechs/db';
import { notifications, users } from '@xtechs/db/schema';
import { eq } from 'drizzle-orm';
import { resolveSmtpConfig, sendEmail } from '../lib/notifications/providers/email-provider.js';
import type { NotificationJobData } from '../lib/notifications/queue.js';

const databaseUrl = process.env['DATABASE_URL'] || 'postgresql://erp_dev:erp_dev_pass@localhost:5432/xtechs_erp';
const { db } = createDb(databaseUrl);

export const notificationsWorker = new Worker<NotificationJobData>(
  'notifications',
  async (job: Job<NotificationJobData>) => {
    const { notificationId, context } = job.data;
    console.log(`[NotificationWorker] Processing job for notification: ${notificationId}`);

    try {
      // 1. Fetch notification
      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notificationId));

      if (!notification) {
        throw new Error(`Notification not found: ${notificationId}`);
      }

      // If already processed (sent/read), skip
      if (notification.status === 'sent' || notification.status === 'read') {
        console.log(`[NotificationWorker] Notification ${notificationId} is already processed (${notification.status})`);
        return;
      }

      // 2. Dispatch based on channel
      if (notification.channel === 'in_app') {
        // In-app notifications are instantly available via DB, so we just set status to 'sent'
        await db
          .update(notifications)
          .set({ status: 'sent', updatedAt: new Date() })
          .where(eq(notifications.id, notificationId));
        
        console.log(`[NotificationWorker] In-app notification ${notificationId} set to sent`);
      } else if (notification.channel === 'email') {
        // Get user email
        const [recipient] = await db
          .select()
          .from(users)
          .where(eq(users.id, notification.userId));

        if (!recipient) {
          throw new Error(`Recipient user not found for ID: ${notification.userId}`);
        }

        // Resolve SMTP configuration
        const smtpConfig = await resolveSmtpConfig(db, context);
        if (!smtpConfig) {
          throw new Error('SMTP configuration is missing. Configure via environment variables or smtp_config metadata.');
        }

        // Send email
        await sendEmail(recipient.email, notification.subject, notification.body, smtpConfig);

        // Update status to sent
        await db
          .update(notifications)
          .set({ status: 'sent', updatedAt: new Date() })
          .where(eq(notifications.id, notificationId));

        console.log(`[NotificationWorker] Email notification ${notificationId} sent successfully to ${recipient.email}`);
      } else {
        // Other channels (SMS, WhatsApp) not implemented yet
        throw new Error(`Unsupported notification channel: ${notification.channel}`);
      }
    } catch (err: any) {
      console.error(`[NotificationWorker] Failed to process notification ${notificationId}:`, err.message);

      // Record error on notification
      try {
        await db
          .update(notifications)
          .set({
            status: 'failed',
            errorMessage: err.message || 'Unknown error occurred',
            updatedAt: new Date(),
          })
          .where(eq(notifications.id, notificationId));
      } catch (dbErr: any) {
        console.error(`[NotificationWorker] Failed to update error status on DB:`, dbErr.message);
      }

      throw err;
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 5,
  }
);

notificationsWorker.on('failed', (job, err) => {
  console.error(`[NotificationWorker] Job ${job?.id} failed:`, err.message);
});
