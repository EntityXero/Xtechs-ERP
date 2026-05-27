import { pgTable, varchar, jsonb, index } from 'drizzle-orm/pg-core';
import { pkColumn, timestampColumns } from './_columns.js';

export const tenants = pgTable('tenants', {
  ...pkColumn(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  metadata: jsonb('metadata').notNull().default({}),
  ...timestampColumns(),
}, (table) => [
  index('idx_tenants_slug').on(table.slug),
  index('idx_tenants_status').on(table.status),
]);
