import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// Mock nodemailer globally before importing service/worker
import nodemailer from 'nodemailer';
const sentEmails: any[] = [];
(nodemailer as any).createTransport = () => {
  return {
    sendMail: async (options: any) => {
      sentEmails.push(options);
      return { messageId: 'mock-id' };
    }
  };
};

import { createDb } from './client.js';
import {
  tenants,
  businesses,
  branches,
  users,
  notifications,
  notificationPreferences,
  metadataDefs,
  metadataRevisions,
  auditLogs,
} from './schema/index.js';
import { NotificationService, SYSTEM_DEFAULTS } from '../../../apps/server/src/lib/notification-service.js';
import { notificationsWorker } from '../../../apps/server/src/workers/notification-worker.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../../../apps/server/src/lib/errors.js';
import { eq } from 'drizzle-orm';

// Helper to wait for a job to finish
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Notification Engine Validation Tests...');

  try {
    // 1. Clean up tables
    await db.delete(notifications);
    await db.delete(notificationPreferences);
    await db.delete(metadataRevisions);
    await db.delete(metadataDefs);
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
    const userB = '66666666-6666-6666-6666-666666666666';

    await db.insert(tenants).values({ id: tenantId, name: 'Notification Tenant', slug: 'notification-tenant' });
    await db.insert(businesses).values({ id: businessId, tenantId, name: 'Acme Alerts Inc', legalName: 'Acme Alerts Inc LTD' });
    await db.insert(branches).values({ id: branchA, tenantId, businessId, name: 'HQ', code: 'HQ', isDefault: true });
    await db.insert(branches).values({ id: branchB, tenantId, businessId, name: 'Sub', code: 'SUB', isDefault: false });
    await db.insert(users).values({ id: userA, tenantId, email: 'usera@acme.local', passwordHash: 'hashed', displayName: 'User A' });
    await db.insert(users).values({ id: userB, tenantId, email: 'userb@acme.local', passwordHash: 'hashed', displayName: 'User B' });

    console.log('Seeded base structural entities.');

    const contextHQ = { tenantId, businessId, branchId: branchA, tokenScope: 'branch' };
    const contextSUB = { tenantId, businessId, branchId: branchB, tokenScope: 'branch' };
    const contextAdmin = { tenantId, businessId, branchId: branchA, tokenScope: 'all-branches' };

    // ─── TEST 1: Preference overrides resolution & hierarchy ───────────────────
    console.log('\n▶ Test 1: Preference overrides resolution & hierarchy');

    // System Default Check
    const sysDefaultVal = await NotificationService.isNotificationEnabled(
      db,
      userA,
      tenantId,
      'workflow_approval',
      'email',
      contextHQ
    );
    console.log(`  ✓ System Default for workflow_approval/email is: ${sysDefaultVal}`);
    if (sysDefaultVal !== true) throw new Error('Expected true for workflow_approval email default');

    // Tenant-Wide Override Setting (metadata)
    // Create notification_settings metadata definition
    const [metaDef] = await db.insert(metadataDefs).values({
      key: 'notification_settings',
      type: 'notification',
      name: 'Notification settings',
      description: 'Tenant wide notification settings',
    }).returning();

    await db.insert(metadataRevisions).values({
      defId: metaDef.id,
      tenantId,
      version: 1,
      payload: {
        types: {
          workflow_approval: { email: false } // disable email for workflow_approval tenant-wide
        }
      }
    });

    const tenantVal = await NotificationService.isNotificationEnabled(
      db,
      userA,
      tenantId,
      'workflow_approval',
      'email',
      contextHQ
    );
    console.log(`  ✓ Tenant override disables email (resolved: ${tenantVal})`);
    if (tenantVal !== false) throw new Error('Expected false due to tenant override settings');

    // User Global Override Setting (across all tenants)
    await db.insert(notificationPreferences).values({
      userId: userA,
      tenantId: null, // Global user pref
      preferences: {
        types: {
          workflow_approval: { email: true } // User A globally overrides email to be true
        }
      }
    });

    const userGlobalVal = await NotificationService.isNotificationEnabled(
      db,
      userA,
      tenantId,
      'workflow_approval',
      'email',
      contextHQ
    );
    console.log(`  ✓ User global override enables email (resolved: ${userGlobalVal})`);
    if (userGlobalVal !== true) throw new Error('Expected true due to user global override preferences');

    // User Tenant-Specific Override Setting
    await db.insert(notificationPreferences).values({
      userId: userA,
      tenantId, // Tenant-specific user pref
      preferences: {
        types: {
          workflow_approval: { email: false } // User A overrides email to false specifically in this tenant
        }
      }
    });

    const userTenantVal = await NotificationService.isNotificationEnabled(
      db,
      userA,
      tenantId,
      'workflow_approval',
      'email',
      contextHQ
    );
    console.log(`  ✓ User tenant-specific override disables email (resolved: ${userTenantVal})`);
    if (userTenantVal !== false) throw new Error('Expected false due to user tenant-specific preferences');

    // ─── TEST 2: Dispatching & Queueing ───────────────────────────────────────
    console.log('\n▶ Test 2: Dispatching & Queueing');

    // User B has no preferences overridden (so defaults apply: workflow_approval/in_app should be enabled)
    const result = await NotificationService.dispatchNotification(
      db,
      contextHQ,
      {
        userId: userB,
        channel: 'in_app',
        type: 'workflow_approval',
        subject: 'Document Pending Approval',
        body: 'Please review and approve the sales order.',
        actionLink: '/sales-orders/123',
      }
    );

    console.log('  ✓ Dispatch succeeded:', result);
    if (!result.success || !result.notificationId) {
      throw new Error('Expected successful dispatch');
    }

    const [notificationRecord] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, result.notificationId));

    console.log(`    - Status: ${notificationRecord.status}`);
    console.log(`    - Channel: ${notificationRecord.channel}`);
    if (notificationRecord.status !== 'pending') {
      throw new Error(`Expected pending status, got ${notificationRecord.status}`);
    }

    // ─── TEST 3: Worker Processing ────────────────────────────────────────────
    console.log('\n▶ Test 3: Worker Processing (In-App)');

    // In-app notifications do not require external dispatching, just status update
    // We can simulate processing by invoking the worker job directly
    await notificationsWorker.processJob({
      id: 'job-1',
      name: 'notification-job',
      data: {
        notificationId: result.notificationId,
        context: contextHQ,
      },
    } as any);

    const [processedRecord] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, result.notificationId));

    console.log(`  ✓ After processing, status updated to: ${processedRecord.status}`);
    if (processedRecord.status !== 'sent') {
      throw new Error(`Expected sent status, got ${processedRecord.status}`);
    }

    // Now test email dispatching using the mocked nodemailer
    // Seed system default SMTP settings in env first
    process.env['SMTP_HOST'] = 'smtp.acme.local';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_FROM'] = 'erp@acme.local';

    const emailResult = await NotificationService.dispatchNotification(
      db,
      contextHQ,
      {
        userId: userB,
        channel: 'email',
        type: 'workflow_approval',
        subject: 'Email Notification Subject',
        body: 'Email Body Content',
      }
    );

    console.log('  ✓ Email notification dispatched:', emailResult);
    if (!emailResult.success || !emailResult.notificationId) {
      throw new Error('Expected successful email dispatch');
    }

    // Process email job
    await notificationsWorker.processJob({
      id: 'job-2',
      name: 'notification-job',
      data: {
        notificationId: emailResult.notificationId,
        context: contextHQ,
      },
    } as any);

    const [processedEmailRecord] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, emailResult.notificationId));

    console.log(`  ✓ After processing, email status updated to: ${processedEmailRecord.status}`);
    if (processedEmailRecord.status !== 'sent') {
      throw new Error(`Expected email sent status, got ${processedEmailRecord.status}`);
    }
    console.log(`    - Mocked SMTP sent emails count: ${sentEmails.length}`);
    if (sentEmails.length !== 1) {
      throw new Error(`Expected 1 sent email, got ${sentEmails.length}`);
    }
    console.log(`    - Email sent to: ${sentEmails[0].to}`);
    if (sentEmails[0].to !== 'userb@acme.local') {
      throw new Error(`Expected recipient userb@acme.local, got ${sentEmails[0].to}`);
    }

    // ─── TEST 4: Isolation & Access Control ──────────────────────────────────
    console.log('\n▶ Test 4: Isolation & Access Control');

    // Retrieve via HQ context (should succeed)
    const listHQ = await NotificationService.getUserInAppNotifications(db, contextHQ, userB);
    console.log(`  ✓ HQ context listed notifications (found: ${listHQ.length})`);
    if (listHQ.length !== 1) {
      throw new Error(`Expected 1 in-app notification in HQ listing, found ${listHQ.length}`);
    }

    // Retrieve via SUB context (should fail - branch isolation)
    const listSUB = await NotificationService.getUserInAppNotifications(db, contextSUB, userB);
    console.log(`  ✓ SUB context listed notifications (found: ${listSUB.length})`);
    if (listSUB.length !== 0) {
      throw new Error(`Expected 0 in-app notifications in SUB listing, found ${listSUB.length}`);
    }

    // Mark as read by User A (should fail - ownership check)
    try {
      await NotificationService.markAsRead(db, contextHQ, userA, result.notificationId);
      throw new Error('Allowed user to mark another user\'s notification as read');
    } catch (e: any) {
      if (e instanceof ForbiddenError) {
        console.log('  ✓ Successfully blocked reading another user\'s notification:', e.message);
      } else {
        throw e;
      }
    }

    // Mark as read under SUB context by User B (should fail - branch check)
    try {
      await NotificationService.markAsRead(db, contextSUB, userB, result.notificationId);
      throw new Error('Allowed user to mark notification as read under wrong branch context');
    } catch (e: any) {
      if (e instanceof ForbiddenError) {
        console.log('  ✓ Successfully blocked reading notification under wrong branch context:', e.message);
      } else {
        throw e;
      }
    }

    // Mark as read under HQ context by User B (should succeed)
    const updated = await NotificationService.markAsRead(db, contextHQ, userB, result.notificationId);
    console.log(`  ✓ Successfully marked notification as read. Status: ${updated.status}, Read At: ${updated.readAt}`);
    if (updated.status !== 'read' || !updated.readAt) {
      throw new Error('Expected status to be read and readAt to be populated');
    }

    console.log('\n🎉 ALL NOTIFICATION ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    // Close worker connection
    await notificationsWorker.close();
    await client.end();
  }
}

runTests();
