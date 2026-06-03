import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// Mock BullMQ Queue and services globally before importing service/worker
import { automationsQueue } from '../../../apps/server/src/lib/automations/queue.js';
const queuedJobs: any[] = [];
(automationsQueue as any).add = async (name: string, data: any) => {
  queuedJobs.push(data);
  return { id: 'mock-job-id' };
};

import { NotificationService } from '../../../apps/server/src/lib/notification-service.js';
const dispatchedNotifications: any[] = [];
NotificationService.dispatchNotification = async (dbInstance: any, context: any, params: any) => {
  dispatchedNotifications.push({ context, params });
  return { success: true, notificationId: 'mock-notification-id' };
};

import { WorkflowService } from '../../../apps/server/src/lib/workflow-service.js';
const processedTransitions: any[] = [];
WorkflowService.processTransition = async (dbInstance: any, context: any, userId: string, documentId: string, transition: string) => {
  processedTransitions.push({ context, userId, documentId, transition });
  // Simulate returning transitioned doc header
  return {
    id: documentId,
    tenantId: context.tenantId,
    businessId: context.businessId,
    branchId: context.branchId,
    type: 'invoice',
    workflowState: 'approved',
  } as any;
};

const createMockJob = (data: any, id: string = 'mock-job-id') => ({
  id,
  name: 'automation-job',
  data,
  moveToCompleted: async () => {},
  moveToFailed: async () => {},
  isActive: () => false,
  isCompleted: () => false,
  isFailed: () => false,
} as any);

import { createDb } from './client.js';
import {
  tenants,
  businesses,
  branches,
  users,
  automations,
  automationLogs,
  auditLogs,
} from './schema/index.js';
import { AutomationService } from '../../../apps/server/src/lib/automation-service.js';
import { automationsWorker } from '../../../apps/server/src/workers/automation-worker.js';
import { pollScheduledAutomations } from '../../../apps/server/src/lib/automations/scheduler.js';
import { eventBus } from '../../../apps/server/src/lib/automations/event-bus.js';
import { eq } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Automation Engine Validation Tests...');

  try {
    // 1. Clean up tables
    const { notifications, notificationPreferences } = await import('./schema/index.js');
    await db.delete(automationLogs);
    await db.delete(automations);
    await db.delete(notifications);
    await db.delete(notificationPreferences);
    await db.delete(auditLogs);
    await db.delete(users);
    await db.delete(branches);
    await db.delete(businesses);
    await db.delete(tenants);

    console.log('Cleaned up tables.');

    // 2. Setup Context Structures
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const businessId = '22222222-2222-2222-2222-222222222222';
    const branchA = '33333333-3333-3333-3333-333333333333';
    const branchB = '44444444-4444-4444-4444-444444444444';
    const userA = '55555555-5555-5555-5555-555555555555';

    await db.insert(tenants).values({ id: tenantId, name: 'Automation Tenant', slug: 'automation-tenant' });
    await db.insert(businesses).values({ id: businessId, tenantId, name: 'Acme Automate Inc', legalName: 'Acme Automate Inc LTD' });
    await db.insert(branches).values({ id: branchA, tenantId, businessId, name: 'HQ', code: 'HQ', isDefault: true });
    await db.insert(branches).values({ id: branchB, tenantId, businessId, name: 'Sub', code: 'SUB', isDefault: false });
    await db.insert(users).values({ id: userA, tenantId, email: 'usera@acme.local', passwordHash: 'hashed', displayName: 'User A' });

    console.log('Seeded base structural entities.');

    const contextHQ = { tenantId, businessId, branchId: branchA, tokenScope: 'branch', userId: userA };
    const contextSUB = { tenantId, businessId, branchId: branchB, tokenScope: 'branch', userId: userA };

    // Initialize Event Listeners
    AutomationService.init(db);

    // ─── TEST 1: Creating Automation Rule Metadata ───────────────────
    console.log('\n▶ Test 1: Creating Automation Rule Metadata');

    const ruleData = {
      name: 'High Value Invoice Alert',
      description: 'Notify creator when invoice is created with amount > 5000',
      isActive: true,
      triggerType: 'event',
      triggerConfig: { type: 'event', event: 'document_created' },
      conditions: [
        { field: 'data.amount', operator: 'gt', value: 5000 },
        { field: 'type', operator: 'eq', value: 'invoice' }
      ],
      actions: [
        {
          type: 'notification',
          payload: {
            channel: 'in_app',
            subject: 'High Value Invoice Created',
            body: 'A high value invoice ({documentNumber}) has been created.'
          }
        }
      ]
    };

    const newRule = await AutomationService.createAutomation(db, contextHQ, userA, ruleData);
    console.log(`  ✓ Rule created: ${newRule.id} ("${newRule.name}")`);
    if (newRule.triggerType !== 'event' || newRule.conditions.length !== 2) {
      throw new Error('Expected created rule to match input properties');
    }

    // ─── TEST 2: Event-driven Trigger & Condition Matching ───────────
    console.log('\n▶ Test 2: Event-driven Trigger & Condition Matching');

    // Scenario A: Document created matches trigger but FAILS conditions (amount = 2500)
    console.log('  Scenario A: Document created (amount = 2500, conditions mismatch)');
    const lowValueDoc = {
      id: '99999999-9999-9999-9999-999999999991',
      type: 'invoice',
      documentNumber: 'INV-001',
      data: { amount: 2500 },
      createdBy: userA,
    };

    queuedJobs.length = 0; // Reset
    eventBus.emit('document_created', lowValueDoc, contextHQ);
    
    // Allow event loop ticks for async handlers
    await new Promise((r) => setTimeout(r, 50));
    
    console.log(`    - Queued jobs count: ${queuedJobs.length}`);
    if (queuedJobs.length !== 1) {
      throw new Error('Expected triggerEvent to enqueue the job regardless of conditions (worker evaluates conditions)');
    }

    // Process job using worker
    console.log('    - Processing low value job in worker...');
    dispatchedNotifications.length = 0;
    await automationsWorker.processJob(createMockJob(queuedJobs[0], 'job-1'));

    console.log(`    - Dispatched notifications count: ${dispatchedNotifications.length}`);
    if (dispatchedNotifications.length !== 0) {
      throw new Error('Worker should NOT execute action if conditions mismatch');
    }

    // Check execution logs: should be empty since execution skips before logger, or logs skip.
    // Wait, in our implementation, if conditions do not match, we log or log-skip?
    // Let's check `automation-worker.ts`:
    // "const conditionsMatch = evaluateConditions(payload || {}, automation.conditions as any);"
    // "if (!conditionsMatch) { console.log(...); return; }"
    // It returns early without writing logs, which is fine, or we can check logs.
    const logsA = await AutomationService.getAutomationLogs(db, contextHQ, newRule.id);
    console.log(`    - Execution logs count: ${logsA.length}`);
    if (logsA.length !== 0) {
      throw new Error('Expected 0 logs for condition mismatch execution');
    }

    // Scenario B: Document created matches trigger and PASSES conditions (amount = 7500)
    console.log('  Scenario B: Document created (amount = 7500, conditions match)');
    const highValueDoc = {
      id: '99999999-9999-9999-9999-999999999992',
      type: 'invoice',
      documentNumber: 'INV-002',
      data: { amount: 7500 },
      createdBy: userA,
    };

    queuedJobs.length = 0;
    eventBus.emit('document_created', highValueDoc, contextHQ);
    await new Promise((r) => setTimeout(r, 50));

    console.log(`    - Processing high value job in worker...`);
    dispatchedNotifications.length = 0;
    await automationsWorker.processJob(createMockJob(queuedJobs[0], 'job-2'));

    console.log(`    - Dispatched notifications count: ${dispatchedNotifications.length}`);
    if (dispatchedNotifications.length !== 1) {
      throw new Error('Expected 1 notification to be dispatched');
    }
    console.log(`    - Dispatched subject: ${dispatchedNotifications[0].params.subject}`);
    if (dispatchedNotifications[0].params.userId !== userA) {
      throw new Error('Expected resolved recipient to be userA (creator)');
    }

    const logsB = await AutomationService.getAutomationLogs(db, contextHQ, newRule.id);
    console.log(`    - Execution logs count: ${logsB.length}`);
    if (logsB.length !== 1) {
      throw new Error('Expected 1 success log for matched execution');
    }
    if (logsB[0].status !== 'success') {
      throw new Error('Expected log status to be success');
    }

    // ─── TEST 3: Workflow Transition Action ───────────────────────────
    console.log('\n▶ Test 3: Workflow Transition Action');

    const transitionRuleData = {
      name: 'Auto-Submit Clean Invoices',
      description: 'Auto-submit invoice if amount is under 1000',
      isActive: true,
      triggerType: 'event',
      triggerConfig: { type: 'event', event: 'document_created' },
      conditions: [
        { field: 'data.amount', operator: 'lt', value: 1000 },
        { field: 'type', operator: 'eq', value: 'invoice' }
      ],
      actions: [
        {
          type: 'workflow_transition',
          payload: {
            transition: 'submit',
            documentIdField: 'id'
          }
        }
      ]
    };

    const transitionRule = await AutomationService.createAutomation(db, contextHQ, userA, transitionRuleData);
    
    const smallDoc = {
      id: '99999999-9999-9999-9999-999999999993',
      type: 'invoice',
      data: { amount: 500 },
      createdBy: userA,
    };

    queuedJobs.length = 0;
    eventBus.emit('document_created', smallDoc, contextHQ);
    await new Promise((r) => setTimeout(r, 50));

    processedTransitions.length = 0;
    // We will process the enqueued job which corresponds to the second automation
    // queuedJobs will have jobs for both highValueInvoiceAlert (condition mismatch) and Auto-Submit Clean Invoices (matches)
    for (const jobData of queuedJobs) {
      await automationsWorker.processJob(createMockJob(jobData, 'job-transition'));
    }

    console.log(`  ✓ Processed workflow transitions count: ${processedTransitions.length}`);
    if (processedTransitions.length !== 1) {
      throw new Error('Expected exactly 1 workflow transition action execution');
    }
    if (processedTransitions[0].transition !== 'submit' || processedTransitions[0].documentId !== smallDoc.id) {
      throw new Error('Transition parameters do not match configuration');
    }

    // ─── TEST 4: Scheduled DB Polling Scheduler ───────────────────────
    console.log('\n▶ Test 4: Scheduled DB Polling Scheduler');

    const scheduledRuleData = {
      name: 'Daily Reminder',
      description: 'Run everyday at 9:00 AM',
      isActive: true,
      triggerType: 'schedule',
      triggerConfig: { type: 'schedule', cron: '0 9 * * *' },
      actions: [
        {
          type: 'notification',
          payload: {
            channel: 'email',
            subject: 'Daily digest',
            body: 'Here is your daily digest.'
          }
        }
      ]
    };

    const scheduledRule = await AutomationService.createAutomation(db, contextHQ, userA, scheduledRuleData);
    console.log(`  ✓ Scheduled rule nextRunAt initially computed: ${scheduledRule.nextRunAt?.toISOString()}`);
    if (!scheduledRule.nextRunAt) {
      throw new Error('Expected nextRunAt to be populated for scheduled automation');
    }

    // Set nextRunAt to the past to simulate it being due
    const pastTime = new Date(Date.now() - 10000);
    await db
      .update(automations)
      .set({ nextRunAt: pastTime })
      .where(eq(automations.id, scheduledRule.id));

    queuedJobs.length = 0;
    // Execute poller
    await pollScheduledAutomations(db);

    console.log(`  ✓ Poller executed. Queued scheduled jobs count: ${queuedJobs.length}`);
    if (queuedJobs.length !== 1) {
      throw new Error('Expected 1 job to be queued by poller');
    }
    if (queuedJobs[0].automationId !== scheduledRule.id) {
      throw new Error('Queued job is not for the scheduled rule');
    }

    // Verify nextRunAt has updated in the DB
    const [updatedScheduledRule] = await db
      .select()
      .from(automations)
      .where(eq(automations.id, scheduledRule.id));

    console.log(`  ✓ Updated nextRunAt: ${updatedScheduledRule.nextRunAt?.toISOString()}`);
    if (!updatedScheduledRule.nextRunAt || updatedScheduledRule.nextRunAt.getTime() <= pastTime.getTime()) {
      throw new Error('Expected nextRunAt to be updated to a future occurrence');
    }
    if (!updatedScheduledRule.lastRunAt) {
      throw new Error('Expected lastRunAt to be set to execution time');
    }

    // ─── TEST 5: Isolation & Scope Enforcements ──────────────────────
    console.log('\n▶ Test 5: Isolation & Scope Enforcements');

    // Trigger document_created event under SUB context. 
    // High Value Invoice Alert is in HQ context. It should NOT be matched or triggered under SUB context.
    queuedJobs.length = 0;
    eventBus.emit('document_created', highValueDoc, contextSUB);
    await new Promise((r) => setTimeout(r, 50));

    console.log(`  ✓ Event triggered in SUB context enqueued: ${queuedJobs.length} jobs`);
    if (queuedJobs.length !== 0) {
      throw new Error('HQ automations should not trigger for SUB context events');
    }

    console.log('\n🎉 ALL AUTOMATION ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await automationsWorker.close();
    await client.end();
  }
}

runTests();
