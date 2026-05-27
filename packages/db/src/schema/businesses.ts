import { pgTable, varchar, jsonb, uuid, index } from 'drizzle-orm/pg-core';
import { pkColumn, timestampColumns } from './_columns.js';
import { tenants } from './tenants.js';

export const businesses = pgTable('businesses', {
  ...pkColumn(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  legalName: varchar('legal_name', { length: 500 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  metadata: jsonb('metadata').notNull().default({}),
  ...timestampColumns(),
}, (table) => [
  index('idx_businesses_tenant').on(table.tenantId),
  index('idx_businesses_status').on(table.status),
]);
