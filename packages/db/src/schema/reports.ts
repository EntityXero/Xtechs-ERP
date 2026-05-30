import { pgTable, varchar, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';

/**
 * Report Definitions Table.
 * Stores configuration details for metadata-driven reports.
 */
export const reportDefinitions = pgTable('report_definitions', {
  ...pkColumn(),
  ...tenantColumns(),
  code: varchar('code', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 255 }),
  type: varchar('type', { length: 50 }).notNull().default('custom'), // 'standard', 'custom'
  module: varchar('module', { length: 100 }).notNull(), // 'accounting', 'inventory', 'sales', 'purchasing', 'hr', 'audit'
  queryConfig: jsonb('query_config').notNull().default({}), // Structured metadata query configuration (Drizzle-friendly select mapping)
  filtersConfig: jsonb('filters_config').notNull().default([]), // Available filters structure
  columnsConfig: jsonb('columns_config').notNull().default([]), // Output columns schema and formatting details
  ...timestampColumns(),
}, (table) => [
  index('idx_report_definitions_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_report_definitions_code').on(table.code),
]);

/**
 * Report Executions Table.
 * Tracks async generation requests for large/heavy reports.
 */
export const reportExecutions = pgTable('report_executions', {
  ...pkColumn(),
  ...tenantColumns(),
  reportDefinitionId: uuid('report_definition_id').notNull().references(() => reportDefinitions.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  filtersApplied: jsonb('filters_applied').notNull().default({}), // Filters used in this execution
  resultUrl: varchar('result_url', { length: 255 }), // URL/filepath to the generated output file (CSV or printable HTML)
  errorDetails: varchar('error_details', { length: 1024 }), // Errors encountered during execution
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestampColumns(),
}, (table) => [
  index('idx_report_executions_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_report_executions_definition').on(table.reportDefinitionId),
]);
