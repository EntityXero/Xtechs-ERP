import { pgTable, varchar, uuid, timestamp, decimal, index, unique } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';

/**
 * Addresses Table.
 * Supports polymorphic linkage to Customers, Leads, etc.
 * Polymorphic link columns: parentType ('customer', 'lead', etc.) and parentId.
 */
export const addresses = pgTable('addresses', {
  ...pkColumn(),
  ...tenantColumns(),
  parentType: varchar('parent_type', { length: 50 }).notNull(), // 'customer', 'lead'
  parentId: uuid('parent_id').notNull(),
  addressType: varchar('address_type', { length: 50 }).notNull().default('billing'), // 'billing', 'shipping', 'office'
  addressLine1: varchar('address_line1', { length: 255 }).notNull(),
  addressLine2: varchar('address_line2', { length: 255 }),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  country: varchar('country', { length: 100 }).notNull(),
  zip: varchar('zip', { length: 20 }).notNull(),
  ...timestampColumns(),
}, (table) => [
  index('idx_addresses_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_addresses_parent').on(table.parentType, table.parentId),
]);

/**
 * Contacts Table.
 * Supports polymorphic linkage to Customers, Leads, etc.
 */
export const contacts = pgTable('contacts', {
  ...pkColumn(),
  ...tenantColumns(),
  parentType: varchar('parent_type', { length: 50 }).notNull(), // 'customer', 'lead'
  parentId: uuid('parent_id').notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  isPrimary: timestamp('is_primary', { withTimezone: true }), // Null or timestamp for sorting/ranking primary contact
  ...timestampColumns(),
}, (table) => [
  index('idx_contacts_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_contacts_parent').on(table.parentType, table.parentId),
]);

/**
 * Customers Table.
 * Master data (not full workflow documents, simple active/inactive status).
 */
export const customers = pgTable('customers', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'inactive'
  ...timestampColumns(),
}, (table) => [
  index('idx_customers_scope').on(table.tenantId, table.businessId, table.branchId),
  unique('uq_customers_email').on(table.tenantId, table.businessId, table.branchId, table.email),
]);

/**
 * Leads Table.
 * Workflow-enabled lifecycle entity.
 */
export const leads = pgTable('leads', {
  ...pkColumn(),
  ...tenantColumns(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  company: varchar('company', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  status: varchar('status', { length: 50 }).notNull().default('new'), // 'new', 'contacted', 'qualified', 'lost'
  ...timestampColumns(),
}, (table) => [
  index('idx_leads_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_leads_status').on(table.status),
]);

/**
 * Opportunities Table.
 * Linked to a Lead or Customer.
 */
export const opportunities = pgTable('opportunities', {
  ...pkColumn(),
  ...tenantColumns(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  expectedValue: decimal('expected_value', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  stage: varchar('stage', { length: 50 }).notNull().default('prospecting'), // 'prospecting', 'proposal', 'negotiation', 'won', 'lost'
  expectedCloseDate: timestamp('expected_close_date', { withTimezone: true }),
  ...timestampColumns(),
}, (table) => [
  index('idx_opportunities_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_opportunities_lead').on(table.leadId),
  index('idx_opportunities_customer').on(table.customerId),
]);
