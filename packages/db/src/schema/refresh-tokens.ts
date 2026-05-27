import { pgTable, varchar, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { pkColumn } from './_columns.js';
import { users } from './users.js';
import { tenants } from './tenants.js';
import { businesses } from './businesses.js';
import { branches } from './branches.js';

/**
 * Refresh tokens for JWT token rotation.
 * Each login generates a refresh token stored here.
 * On refresh, the old token is revoked and a new one is issued.
 * On logout, the token is revoked (revoked_at set).
 */
export const refreshTokens = pgTable('refresh_tokens', {
  ...pkColumn(),
  userId: uuid('user_id').notNull().references(() => users.id),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  businessId: uuid('business_id').notNull().references(() => businesses.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_refresh_tokens_token').on(table.token),
  index('idx_refresh_tokens_user').on(table.userId),
  index('idx_refresh_tokens_expires').on(table.expiresAt),
]);
