import { pgTable, varchar, uuid, integer, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { pkColumn, timestampColumns } from './_columns.js';

/**
 * Metadata Definitions define the "type" and identity of metadata config objects.
 * Types include: 'form', 'field', 'workflow', 'layout', 'numbering', 'report', 'dashboard', 'notification', 'permission'
 */
export const metadataDefs = pgTable('metadata_defs', {
  ...pkColumn(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  type: varchar('type', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  ...timestampColumns(),
}, (table) => [
  index('idx_metadata_defs_key').on(table.key),
  index('idx_metadata_defs_type').on(table.type),
]);

/**
 * Metadata Revisions store the actual JSON configs per scope.
 * This table is strictly append-only to guarantee an immutable history.
 * Custom scoping is enforced via nullable tenant_id, business_id, branch_id:
 * - tenant_id is null, business_id is null, branch_id is null => Global metadata
 * - tenant_id set, business_id/branch_id null => Tenant-scoped metadata
 * - tenant_id & business_id set, branch_id null => Business-scoped metadata
 * - tenant_id & business_id & branch_id set => Branch-scoped metadata
 */
export const metadataRevisions = pgTable('metadata_revisions', {
  ...pkColumn(),
  defId: uuid('def_id').notNull().references(() => metadataDefs.id),
  tenantId: uuid('tenant_id'),
  businessId: uuid('business_id'),
  branchId: uuid('branch_id'),
  version: integer('version').notNull(),
  payload: jsonb('payload').notNull(),
  createdBy: uuid('created_by'),
  ...timestampColumns(),
}, (table) => [
  index('idx_metadata_revs_def_scope').on(table.defId, table.tenantId, table.businessId, table.branchId),
  index('idx_metadata_revs_lookup').on(table.defId, table.tenantId, table.businessId, table.branchId, table.version),
]);

/**
 * Tracks dependency relationships between metadata items.
 * Used to construct an acyclic graph of dependencies and prevent circular references.
 * e.g., if Form A references Form B, then Form A (source) -> Form B (target).
 */
export const metadataDependencies = pgTable('metadata_dependencies', {
  ...pkColumn(),
  sourceDefId: uuid('source_def_id').notNull().references(() => metadataDefs.id),
  targetDefId: uuid('target_def_id').notNull().references(() => metadataDefs.id),
  ...timestampColumns(),
}, (table) => [
  index('idx_metadata_deps_source').on(table.sourceDefId),
  index('idx_metadata_deps_target').on(table.targetDefId),
  unique('uq_metadata_deps_composite').on(table.sourceDefId, table.targetDefId),
]);
