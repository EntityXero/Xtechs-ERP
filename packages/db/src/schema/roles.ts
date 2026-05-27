import { pgTable, varchar, text, uuid, index } from 'drizzle-orm/pg-core';
import { pkColumn, timestampColumns } from './_columns.js';
import { tenants } from './tenants.js';
import { businesses } from './businesses.js';
import { branches } from './branches.js';
import { users } from './users.js';

/**
 * Roles are branch-scoped: a user can have different roles in different branches.
 */
export const roles = pgTable('roles', {
  ...pkColumn(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  businessId: uuid('business_id').notNull().references(() => businesses.id),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  ...timestampColumns(),
}, (table) => [
  index('idx_roles_tenant').on(table.tenantId),
  index('idx_roles_business').on(table.businessId),
  index('idx_roles_name').on(table.businessId, table.name),
]);

/**
 * User-role assignment, scoped to a specific branch.
 * A user can have multiple roles per branch, and different roles across branches.
 */
export const userRoles = pgTable('user_roles', {
  ...pkColumn(),
  userId: uuid('user_id').notNull().references(() => users.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  ...timestampColumns(),
}, (table) => [
  index('idx_user_roles_user').on(table.userId),
  index('idx_user_roles_branch').on(table.branchId),
  index('idx_user_roles_composite').on(table.userId, table.roleId, table.branchId),
]);
