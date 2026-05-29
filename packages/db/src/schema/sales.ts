import { pgTable, varchar, uuid, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';
import { documents } from './documents.js';
import { customers, opportunities } from './crm.js';
import { items } from './inventory.js';
import { warehouses } from './inventory.js';

/**
 * Quotations Table.
 * Documents generated during sales proposals.
 */
export const quotations = pgTable('quotations', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  totalAmount: decimal('total_amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  ...timestampColumns(),
}, (table) => [
  index('idx_quotations_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_quotations_document').on(table.documentId),
  index('idx_quotations_customer').on(table.customerId),
]);

/**
 * Quotation Lines Table.
 */
export const quotationLines = pgTable('quotation_lines', {
  ...pkColumn(),
  ...tenantColumns(),
  quotationId: uuid('quotation_id').notNull().references(() => quotations.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id),
  qty: decimal('qty', { precision: 18, scale: 4 }).notNull(),
  rate: decimal('rate', { precision: 18, scale: 4 }).notNull(),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).notNull().default('0.00'), // Simple manual discount percentage
  amount: decimal('amount', { precision: 18, scale: 4 }).notNull(), // amount = (qty * rate) * (1 - discountPercentage/100)
  ...timestampColumns(),
}, (table) => [
  index('idx_quotation_lines_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_quotation_lines_quotation').on(table.quotationId),
]);

/**
 * Sales Orders Table.
 * Committed sales orders that request/reserve stock.
 */
export const salesOrders = pgTable('sales_orders', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id), // Where to reserve stock from
  quotationId: uuid('quotation_id').references(() => quotations.id, { onDelete: 'set null' }),
  deliveryDate: timestamp('delivery_date', { withTimezone: true }),
  totalAmount: decimal('total_amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  ...timestampColumns(),
}, (table) => [
  index('idx_sales_orders_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_sales_orders_document').on(table.documentId),
  index('idx_sales_orders_customer').on(table.customerId),
  index('idx_sales_orders_warehouse').on(table.warehouseId),
]);

/**
 * Sales Order Lines Table.
 */
export const salesOrderLines = pgTable('sales_order_lines', {
  ...pkColumn(),
  ...tenantColumns(),
  salesOrderId: uuid('sales_order_id').notNull().references(() => salesOrders.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id),
  qty: decimal('qty', { precision: 18, scale: 4 }).notNull(),
  rate: decimal('rate', { precision: 18, scale: 4 }).notNull(),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).notNull().default('0.00'),
  amount: decimal('amount', { precision: 18, scale: 4 }).notNull(),
  ...timestampColumns(),
}, (table) => [
  index('idx_sales_order_lines_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_sales_order_lines_order').on(table.salesOrderId),
]);
