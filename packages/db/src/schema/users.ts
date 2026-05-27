import { pgTable, varchar, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { pkColumn, timestampColumns } from './_columns.js';
import { tenants } from './tenants.js';

export const users = pgTable('users', {
  ...pkColumn(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  email: varchar('email', { length: 320 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestampColumns(),
}, (table) => [
  index('idx_users_tenant').on(table.tenantId),
  index('idx_users_email').on(table.tenantId, table.email),
  index('idx_users_status').on(table.status),
]);
