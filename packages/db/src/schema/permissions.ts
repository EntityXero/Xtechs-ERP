import { pgTable, varchar, uuid, index } from 'drizzle-orm/pg-core';
import { pkColumn, timestampColumns } from './_columns.js';
import { roles } from './roles.js';

/**
 * Permissions follow a resource/action/effect model.
 * deny-by-default: users have NO access unless explicitly granted.
 *
 * resource: what entity type (e.g., 'document', 'user', 'branch')
 * action: what operation (e.g., 'create', 'read', 'update', 'delete', 'approve')
 * effect: 'allow' or 'deny' (deny takes precedence over allow)
 */
export const permissions = pgTable('permissions', {
  ...pkColumn(),
  resource: varchar('resource', { length: 100 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  effect: varchar('effect', { length: 10 }).notNull().default('allow'),
  description: varchar('description', { length: 500 }),
  ...timestampColumns(),
}, (table) => [
  index('idx_permissions_resource_action').on(table.resource, table.action),
]);

/**
 * Maps permissions to roles.
 * A role can have many permissions, a permission can belong to many roles.
 */
export const rolePermissions = pgTable('role_permissions', {
  ...pkColumn(),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
  ...timestampColumns(),
}, (table) => [
  index('idx_role_permissions_role').on(table.roleId),
  index('idx_role_permissions_composite').on(table.roleId, table.permissionId),
]);
