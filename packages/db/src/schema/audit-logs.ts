import { pgTable, varchar, uuid, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Immutable, append-only audit log.
 * NEVER update or delete rows in this table.
 *
 * Every mutation in the ERP must produce an audit log entry with:
 * - Who did it (actor_id)
 * - What changed (entity_type, entity_id, action, old_values, new_values)
 * - Where (tenant_id, business_id, branch_id)
 * - Context (request_id, ip_address, timestamp)
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  actorId: uuid('actor_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  requestId: uuid('request_id'),
  tenantId: uuid('tenant_id').notNull(),
  businessId: uuid('business_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_entity').on(table.entityType, table.entityId),
  index('idx_audit_actor').on(table.actorId),
  index('idx_audit_tenant').on(table.tenantId),
  index('idx_audit_branch').on(table.branchId),
  index('idx_audit_timestamp').on(table.timestamp),
  index('idx_audit_request').on(table.requestId),
]);
