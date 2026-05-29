import { pgTable, varchar, uuid, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';
import { documents } from './documents.js';
import { items, warehouses } from './inventory.js';

/**
 * Suppliers Table.
 * Master data representing vendors we procure from.
 */
export const suppliers = pgTable('suppliers', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'inactive'
  ...timestampColumns(),
}, (table) => [
  index('idx_suppliers_scope').on(table.tenantId, table.businessId, table.branchId),
]);

/**
 * Purchase Orders Table.
 * Transactional document generated during procurement.
 */
export const purchaseOrders = pgTable('purchase_orders', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id), // Target warehouse for incoming stock
  deliveryDate: timestamp('delivery_date', { withTimezone: true }),
  totalAmount: decimal('total_amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  ...timestampColumns(),
}, (table) => [
  index('idx_purchase_orders_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_purchase_orders_document').on(table.documentId),
  index('idx_purchase_orders_supplier').on(table.supplierId),
  index('idx_purchase_orders_warehouse').on(table.warehouseId),
]);

/**
 * Purchase Order Lines Table.
 */
export const purchaseOrderLines = pgTable('purchase_order_lines', {
  ...pkColumn(),
  ...tenantColumns(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id),
  supplierItemCode: varchar('supplier_item_code', { length: 100 }), // Supplier SKU/ref code for supplier item reference
  qty: decimal('qty', { precision: 18, scale: 4 }).notNull(),
  rate: decimal('rate', { precision: 18, scale: 4 }).notNull(),
  discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).notNull().default('0.00'),
  amount: decimal('amount', { precision: 18, scale: 4 }).notNull(),
  ...timestampColumns(),
}, (table) => [
  index('idx_purchase_order_lines_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_purchase_order_lines_order').on(table.purchaseOrderId),
]);
