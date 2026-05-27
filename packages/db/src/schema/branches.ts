import { pgTable, varchar, jsonb, uuid, boolean, index } from 'drizzle-orm/pg-core';
import { pkColumn, timestampColumns } from './_columns.js';
import { tenants } from './tenants.js';
import { businesses } from './businesses.js';

export const branches = pgTable('branches', {
  ...pkColumn(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  businessId: uuid('business_id').notNull().references(() => businesses.id),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  metadata: jsonb('metadata').notNull().default({}),
  ...timestampColumns(),
}, (table) => [
  index('idx_branches_tenant').on(table.tenantId),
  index('idx_branches_business').on(table.businessId),
  index('idx_branches_code').on(table.businessId, table.code),
]);
