import { uuid, timestamp } from 'drizzle-orm/pg-core';

/**
 * UUID v4 primary key column.
 * All tables use UUID PKs per ERP spec — no auto-increment integers.
 */
export function pkColumn() {
  return {
    id: uuid('id').primaryKey().defaultRandom(),
  };
}

/**
 * Tenant isolation columns.
 * EVERY runtime entity must carry these three IDs for branch-level isolation.
 * Indexed for query performance on tenant-scoped queries.
 */
export function tenantColumns() {
  return {
    tenantId: uuid('tenant_id').notNull(),
    businessId: uuid('business_id').notNull(),
    branchId: uuid('branch_id').notNull(),
  };
}

/**
 * Standard timestamp columns with automatic defaults.
 */
export function timestampColumns() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  };
}

/**
 * Ownership tracking columns — who created/last modified this record.
 * References the users table (enforced at app level, not FK, to avoid circular deps during bootstrap).
 */
export function ownerColumns() {
  return {
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  };
}
