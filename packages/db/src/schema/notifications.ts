import { pgTable, varchar, uuid, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';
import { users } from './users.js';
import { tenants } from './tenants.js';

/**
 * Notifications Table.
 * Tracks all dispatched or pending notifications (In-App, Email, SMS, WhatsApp) and their status.
 */
export const notifications = pgTable('notifications', {
  ...pkColumn(),
  ...tenantColumns(),
  userId: uuid('user_id').notNull().references(() => users.id),
  channel: varchar('channel', { length: 50 }).notNull(), // 'in_app' | 'email' | 'sms' | 'whatsapp'
  type: varchar('type', { length: 100 }).notNull(), // e.g. 'workflow_approval', 'workflow_status', 'system_alert'
  subject: varchar('subject', { length: 255 }).notNull(),
  body: varchar('body', { length: 4000 }).notNull(),
  actionLink: varchar('action_link', { length: 512 }),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'sent', 'failed', 'read'
  errorMessage: varchar('error_message', { length: 1000 }),
  readAt: timestamp('read_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestampColumns(),
}, (table) => [
  index('idx_notifications_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_notifications_user_status').on(table.userId, table.status, table.createdAt),
]);

/**
 * Notification Preferences Table.
 * Stores user-level override settings for notifications.
 * Can be global (tenantId IS NULL) or tenant-specific (tenantId set).
 */
export const notificationPreferences = pgTable('notification_preferences', {
  ...pkColumn(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  preferences: jsonb('preferences').notNull().default({}),
  ...timestampColumns(),
}, (table) => [
  index('idx_notification_prefs_user_tenant').on(table.userId, table.tenantId),
]);
