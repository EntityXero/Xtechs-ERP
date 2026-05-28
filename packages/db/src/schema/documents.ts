import { pgTable, varchar, jsonb, uuid, integer, decimal, index, unique } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns, ownerColumns } from './_columns.js';
import { users } from './users.js';

/**
 * Base Documents table.
 * Acts as the polymorphic root for all business entities in the ERP (Invoice, PO, Customer, Supplier, etc.).
 */
export const documents = pgTable('documents', {
  ...pkColumn(),
  ...tenantColumns(),
  type: varchar('type', { length: 100 }).notNull(), // 'invoice', 'customer', 'payment', etc.
  documentNumber: varchar('document_number', { length: 100 }), // e.g., 'INV-2026-0001'
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'archived', 'reversed'
  workflowState: varchar('workflow_state', { length: 50 }).notNull().default('draft'), // 'draft', 'pending_approval', 'approved', 'posted'
  data: jsonb('data').notNull().default({}), // Dynamic fields validated by the form metadata schema
  assignedTo: uuid('assigned_to'), // Scoped ownership/assignment reference
  ...ownerColumns(),
  ...timestampColumns(),
}, (table) => [
  index('idx_documents_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_documents_type_status').on(table.type, table.status),
  index('idx_documents_number').on(table.tenantId, table.businessId, table.documentNumber),
  index('idx_documents_assigned').on(table.assignedTo),
]);

/**
 * Polymorphic Document Lines.
 * Hybrid approach: relational fields for standard transaction quantities/prices
 * and JSONB for dynamic custom fields per line.
 */
export const documentLines = pgTable('document_lines', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  lineNumber: integer('line_number').notNull(),
  description: varchar('description', { length: 500 }),
  quantity: decimal('quantity', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  unitPrice: decimal('unit_price', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  amount: decimal('amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  data: jsonb('data').notNull().default({}), // Custom metadata/fields for the specific line type
  ...timestampColumns(),
}, (table) => [
  index('idx_doc_lines_document').on(table.documentId),
  index('idx_doc_lines_scope').on(table.tenantId, table.businessId, table.branchId),
]);

/**
 * Document Links table.
 * Explicit relational relationships between documents (e.g. Invoice -> Customer).
 */
export const documentLinks = pgTable('document_links', {
  ...pkColumn(),
  ...tenantColumns(),
  sourceDocId: uuid('source_doc_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  targetDocId: uuid('target_doc_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  relationType: varchar('relation_type', { length: 100 }).notNull(), // 'invoice_customer', 'payment_invoice'
  ...timestampColumns(),
}, (table) => [
  index('idx_doc_links_source').on(table.sourceDocId),
  index('idx_doc_links_target').on(table.targetDocId),
  unique('uq_doc_links_composite').on(table.sourceDocId, table.targetDocId, table.relationType),
]);

/**
 * Numbering Engine Sequences.
 * Handles lockable counters for sequential number generation.
 */
export const documentSequences = pgTable('document_sequences', {
  ...pkColumn(),
  ...tenantColumns(),
  type: varchar('type', { length: 100 }).notNull(), // 'invoice', 'payment', etc.
  prefix: varchar('prefix', { length: 100 }).notNull(), // e.g. 'INV-2026-'
  currentValue: integer('current_value').notNull().default(0),
  ...timestampColumns(),
}, (table) => [
  unique('uq_doc_sequences_prefix').on(table.tenantId, table.businessId, table.branchId, table.type, table.prefix),
]);

/**
 * Document Comments.
 */
export const documentComments = pgTable('document_comments', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id),
  content: varchar('content', { length: 2000 }).notNull(),
  ...timestampColumns(),
}, (table) => [
  index('idx_doc_comments_document').on(table.documentId),
]);

/**
 * Document Human-Readable Activities/Audit Timeline.
 */
export const documentActivities = pgTable('document_activities', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  activityType: varchar('activity_type', { length: 100 }).notNull(), // e.g. 'created', 'status_changed', 'commented'
  description: varchar('description', { length: 1000 }).notNull(),
  ...timestampColumns(),
}, (table) => [
  index('idx_doc_activities_document').on(table.documentId),
]);

/**
 * Document Attachments.
 */
export const documentAttachments = pgTable('document_attachments', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  uploaderId: uuid('uploader_id').notNull().references(() => users.id),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  storagePath: varchar('storage_path', { length: 1000 }).notNull(),
  ...timestampColumns(),
}, (table) => [
  index('idx_doc_attachments_document').on(table.documentId),
]);
