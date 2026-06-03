import { pgTable, varchar, uuid, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';

/**
 * Attachments Table.
 * Tracks uploaded files (e.g. PDFs, images) linked to any system entity.
 */
export const attachments = pgTable('attachments', {
  ...pkColumn(),
  ...tenantColumns(),
  entityType: varchar('entity_type', { length: 100 }).notNull(), // e.g. 'sales_order', 'employee', 'item'
  entityId: uuid('entity_id').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(), // size in bytes
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  storageProvider: varchar('storage_provider', { length: 50 }).notNull().default('local'), // 'local', 's3'
  storagePath: varchar('storage_path', { length: 512 }).notNull(), // path/key in storage provider
  sha256Checksum: varchar('sha256_checksum', { length: 64 }).notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestampColumns(),
}, (table) => [
  index('idx_attachments_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_attachments_entity').on(table.entityType, table.entityId),
]);
