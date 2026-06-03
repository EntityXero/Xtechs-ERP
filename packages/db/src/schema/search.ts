import { pgTable, varchar, uuid, timestamp, jsonb, index, unique, customType } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns } from './_columns.js';

// Custom column type for PostgreSQL tsvector
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/**
 * Search Indexes Table.
 * Stores centralized searchable records for fast global search.
 */
export const searchIndexes = pgTable('search_indexes', {
  ...pkColumn(),
  ...tenantColumns(), // tenantId, businessId, branchId
  entityType: varchar('entity_type', { length: 100 }).notNull(), // e.g., 'document', 'audit_log', 'comment'
  entityId: uuid('entity_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: varchar('description', { length: 1000 }),
  urlPath: varchar('url_path', { length: 500 }).notNull(),
  documentVector: tsvector('document_vector').notNull(),
  metadata: jsonb('metadata').notNull().default({}), // Facets or permissions
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('idx_search_indexes_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_search_indexes_vector').using('gin', table.documentVector),
  unique('uq_search_indexes_entity').on(table.entityType, table.entityId),
]);
