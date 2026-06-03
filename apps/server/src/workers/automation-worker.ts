import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { createDb } from '@xtechs/db';
import { automations, automationLogs } from '@xtechs/db/schema';
import { eq } from 'drizzle-orm';
import { evaluateConditions } from '../lib/workflow-service.js';
import { NotificationService } from '../lib/notification-service.js';
import { WorkflowService } from '../lib/workflow-service.js';
import type { AutomationJobData } from '../lib/automations/queue.js';

const databaseUrl = process.env['DATABASE_URL'] || 'postgresql://erp_dev:erp_dev_pass@localhost:5432/xtechs_erp';
const { db } = createDb(databaseUrl);

export const automationsWorker = new Worker<AutomationJobData>(
  'automations',
  async (job: Job<AutomationJobData>) => {
    const { automationId, entityType, entityId, payload, context } = job.data;
    console.log(`[AutomationWorker] Processing automation job: ${automationId} on ${entityType}:${entityId}`);

    try {
      // 1. Fetch automation rule
      const [automation] = await db
        .select()
        .from(automations)
        .where(eq(automations.id, automationId));

      if (!automation) {
        throw new Error(`Automation rule not found: ${automationId}`);
      }

      if (!automation.isActive) {
        console.log(`[AutomationWorker] Automation rule is inactive: ${automationId}`);
        return;
      }

      // 2. Evaluate conditions
      const conditionsMatch = evaluateConditions(payload || {}, automation.conditions as any);
      if (!conditionsMatch) {
        console.log(`[AutomationWorker] Conditions did not match for automation ${automationId}. Skipping execution.`);
        return;
      }

      // 3. Execute actions
      const actions = automation.actions as any[];
      for (const action of actions) {
        if (action.type === 'notification') {
          // Resolve recipient ID
          let recipientId = action.payload.userId;
          if (!recipientId && payload) {
            recipientId = payload.createdBy || payload.userId || payload.employeeId;
          }
          if (!recipientId) {
            recipientId = context.userId; // Fallback to current context user
          }

          if (!recipientId) {
            throw new Error('Could not resolve recipient userId for notification action');
          }

          console.log(`[AutomationWorker] Dispatching notification to user ${recipientId}`);
          await NotificationService.dispatchNotification(db, context, {
            userId: recipientId,
            channel: action.payload.channel,
            type: 'system_alert',
            subject: action.payload.subject,
            body: action.payload.body,
            actionLink: action.payload.actionLink,
          });
        } else if (action.type === 'workflow_transition') {
          // Resolve document ID from payload
          const documentIdField = action.payload.documentIdField || 'id';
          const docId = payload?.[documentIdField] || entityId;

          if (!docId) {
            throw new Error(`Could not resolve document ID using field "${documentIdField}" or entityId`);
          }

          console.log(`[AutomationWorker] Transitioning document ${docId} with transition "${action.payload.transition}"`);
          // Use context userId or system user (fallback)
          const executionUserId = context.userId || payload?.createdBy || '00000000-0000-0000-0000-000000000000';
          await WorkflowService.processTransition(
            db,
            context,
            executionUserId,
            docId,
            action.payload.transition
          );
        } else {
          throw new Error(`Unsupported action type: ${action.type}`);
        }
      }

      // 4. Log the success execution
      try {
        await db.insert(automationLogs).values({
          tenantId: context.tenantId,
          businessId: context.businessId,
          branchId: context.branchId,
          automationId,
          entityType: entityType || null,
          entityId: entityId || null,
          status: 'success',
        } as any);
      } catch (logErr: any) {
        console.error(`[AutomationWorker] Failed to write success to automation_logs:`, logErr.message);
      }
    } catch (err: any) {
      console.error(`[AutomationWorker] Error executing automation ${automationId}:`, err.message);
      
      // 5. Log the failure execution
      try {
        await db.insert(automationLogs).values({
          tenantId: context.tenantId,
          businessId: context.businessId,
          branchId: context.branchId,
          automationId,
          entityType: entityType || null,
          entityId: entityId || null,
          status: 'failed',
          errorMessage: err.message || 'Unknown error occurred',
        } as any);
      } catch (logErr: any) {
        console.error(`[AutomationWorker] Failed to write failure to automation_logs:`, logErr.message);
      }
      throw err;
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 5,
  }
);

automationsWorker.on('failed', (job, err) => {
  console.error(`[AutomationWorker] Job ${job?.id} failed:`, err.message);
});
