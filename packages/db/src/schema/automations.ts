import { pgTable, varchar, uuid, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns, ownerColumns } from './_columns.js';

/**
 * Automations Table.
 * Stores metadata-driven rules for executing events and scheduled tasks.
 */
export const automations = pgTable('automations', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  isActive: boolean('is_active').notNull().default(true),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(), // 'event' | 'schedule'
  triggerConfig: jsonb('trigger_config').notNull().default({}), // e.g. { event: 'document_created' } or { cron: '0 9 * * *' }
  conditions: jsonb('conditions').notNull().default([]), // Array of conditional rules
  actions: jsonb('actions').notNull().default([]), // Array of action rules
  nextRunAt: timestamp('next_run_at', { withTimezone: true }), // For scheduled items
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ownerColumns(),
  ...timestampColumns(),
}, (table) => [
  index('idx_automations_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_automations_trigger').on(table.triggerType, table.isActive),
  index('idx_automations_next_run').on(table.nextRunAt),
]);

/**
 * Automation Logs Table.
 * Records the execution history of all automations.
 */
export const automationLogs = pgTable('automation_logs', {
  ...pkColumn(),
  ...tenantColumns(),
  automationId: uuid('automation_id').notNull().references(() => automations.id),
  entityType: varchar('entity_type', { length: 100 }), // Context entity, e.g., 'document'
  entityId: uuid('entity_id'), // ID of context entity
  status: varchar('status', { length: 50 }).notNull(), // 'success' | 'failed'
  errorMessage: varchar('error_message', { length: 1000 }),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
  ...timestampColumns(),
}, (table) => [
  index('idx_automation_logs_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_automation_logs_automation').on(table.automationId),
]);
