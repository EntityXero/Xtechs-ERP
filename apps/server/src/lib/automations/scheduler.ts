import cronParser from 'cron-parser';
import { eq, and, or, lte, isNull, sql } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import { automations } from '@xtechs/db/schema';
import { queueAutomationJob } from './queue.js';

// ESM compatibility resolver for cron-parser
const cpResolver = (cronParser as any).parseExpression
  ? cronParser
  : ((cronParser as any).default?.parseExpression ? (cronParser as any).default : cronParser);

console.log('DEBUG [scheduler.ts] cronParser is:', cronParser, 'cpResolver is:', cpResolver);

const parseCron = (expression: string, options?: any) => {
  if (typeof cpResolver.parseExpression === 'function') {
    return cpResolver.parseExpression(expression, options);
  }
  if (typeof cpResolver.parse === 'function') {
    return cpResolver.parse(expression, options);
  }
  // Fallback to direct import parse method if wrapped
  if (typeof (cronParser as any).default?.parse === 'function') {
    return (cronParser as any).default.parse(expression, options);
  }
  throw new Error('cron-parser does not expose parse or parseExpression function');
};

/**
 * Polls the PostgreSQL database for active scheduled automations that are due.
 * Uses SELECT FOR UPDATE SKIP LOCKED to prevent multiple server instances from double-queueing.
 */
export async function pollScheduledAutomations(db: Database) {
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // 1. Lock and fetch due automations
      // Drizzle doesn't support "FOR UPDATE SKIP LOCKED" natively in all syntax easily,
      // so we use raw SQL to ensure precise locking behavior.
      const dueAutomations = await tx.execute(
        sql`
          SELECT id, tenant_id as "tenant_id", business_id as "business_id", branch_id as "branch_id", name, trigger_config as "trigger_config", created_by as "created_by" 
          FROM automations 
          WHERE is_active = true 
            AND trigger_type = 'schedule'
            AND (next_run_at <= ${now.toISOString()} OR next_run_at IS NULL)
            AND deleted_at IS NULL
          FOR UPDATE SKIP LOCKED
        `
      );

      const rows = Array.isArray(dueAutomations) ? dueAutomations : ((dueAutomations as any)?.rows || []);
      for (const row of rows as any[]) {
        const triggerConfig = row.trigger_config;
        const cronExpr = triggerConfig?.cron;

        if (!cronExpr) {
          console.warn(`[Scheduler] Automation ${row.id} is missing cron expression.`);
          // Deactivate it to avoid infinite looping
          await tx
            .update(automations)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(automations.id, row.id));
          continue;
        }

        try {
          // 2. Queue the job
          await queueAutomationJob({
            automationId: row.id,
            entityType: 'scheduler',
            entityId: row.id,
            payload: { triggeredAt: now },
            context: {
              tenantId: row.tenant_id,
              businessId: row.business_id,
              branchId: row.branch_id,
              userId: row.created_by || '00000000-0000-0000-0000-000000000000',
            },
          });

          // 3. Compute next run time
          const interval = parseCron(cronExpr, { currentDate: now });
          const nextRunAt = interval.next().toDate();

          // 4. Update next_run_at and last_run_at in DB
          await tx
            .update(automations)
            .set({
              lastRunAt: now,
              nextRunAt,
              updatedAt: new Date(),
            })
            .where(eq(automations.id, row.id));

          console.log(`[Scheduler] Queued automation ${row.id} ("${row.name}"). Next run: ${nextRunAt.toISOString()}`);
        } catch (err: any) {
          console.error(`[Scheduler] Failed to process scheduled automation ${row.id}:`, err.message);
          // Update next_run_at anyway to prevent getting stuck in a loop
          try {
            const interval = parseCron(cronExpr, { currentDate: now });
            const nextRunAt = interval.next().toDate();
            await tx
              .update(automations)
              .set({
                nextRunAt,
                updatedAt: new Date(),
              })
              .where(eq(automations.id, row.id));
          } catch (recurErr: any) {
            console.error(`[Scheduler] Critical: Failed to calculate fallback nextRunAt for ${row.id}:`, recurErr.message);
          }
        }
      }
    });
  } catch (err: any) {
    console.error(`[Scheduler] Transaction error during polling:`, err.message);
  }
}

/**
 * Utility to calculate initial nextRunAt time for an automation when it's created or updated.
 */
export function calculateNextRunAt(cronExpr: string, fromDate: Date = new Date()): Date {
  const interval = parseCron(cronExpr, { currentDate: fromDate });
  return interval.next().toDate();
}
