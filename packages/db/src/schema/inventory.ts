import { pgTable, varchar, uuid, timestamp, boolean, decimal, index, unique } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';
import { documents } from './documents.js';

/**
 * Warehouses Table.
 * Hierarchical locations within branches.
 */
export const warehouses = pgTable('warehouses', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(), // e.g. 'WH-MAIN', 'WH-SEC'
  parentId: uuid('parent_id').references((): AnyPgColumn => warehouses.id, { onDelete: 'cascade' }),
  isGroup: boolean('is_group').notNull().default(false), // Group warehouses can have children, but no direct transactions
  ...timestampColumns(),
}, (table) => [
  index('idx_warehouses_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_warehouses_parent').on(table.parentId),
  unique('uq_warehouses_code').on(table.tenantId, table.businessId, table.branchId, table.code),
]);

/**
 * Item Groups Table.
 * Category tree for items.
 */
export const itemGroups = pgTable('item_groups', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 255 }).notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => itemGroups.id, { onDelete: 'cascade' }),
  ...timestampColumns(),
}, (table) => [
  index('idx_item_groups_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_item_groups_parent').on(table.parentId),
  unique('uq_item_groups_name').on(table.tenantId, table.businessId, table.branchId, table.name),
]);

/**
 * Items Table.
 * Item Master representing products, materials, or services.
 */
export const items = pgTable('items', {
  ...pkColumn(),
  ...tenantColumns(),
  sku: varchar('sku', { length: 100 }).notNull(), // Unique product identifier
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'inventory', 'non_inventory', 'service'
  itemGroupId: uuid('item_group_id').notNull().references(() => itemGroups.id),
  baseUom: varchar('base_uom', { length: 50 }).notNull(), // Mandatory base UOM, e.g. 'Each', 'Kg'
  valuationMethod: varchar('valuation_method', { length: 50 }).notNull().default('moving_average'), // 'moving_average', 'fifo', 'standard'
  isArchived: boolean('is_archived').notNull().default(false),
  ...timestampColumns(),
}, (table) => [
  index('idx_items_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_items_item_group').on(table.itemGroupId),
  unique('uq_items_sku').on(table.tenantId, table.businessId, table.branchId, table.sku),
]);

/**
 * Item UOMs Table.
 * Supports multi-UOM conversions back to the base UOM.
 */
export const itemUoms = pgTable('item_uoms', {
  ...pkColumn(),
  ...tenantColumns(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  uom: varchar('uom', { length: 50 }).notNull(), // e.g. 'Box'
  conversionFactor: decimal('conversion_factor', { precision: 18, scale: 6 }).notNull().default('1.000000'), // e.g. 1 Box = 10 Each -> conversionFactor = 10
  ...timestampColumns(),
}, (table) => [
  index('idx_item_uoms_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_item_uoms_item').on(table.itemId),
  unique('uq_item_uoms_composite').on(table.tenantId, table.businessId, table.branchId, table.itemId, table.uom),
]);

/**
 * Batches Table.
 * Tracked lots or production batches for specific items with expiry capability.
 */
export const batches = pgTable('batches', {
  ...pkColumn(),
  ...tenantColumns(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  batchNo: varchar('batch_no', { length: 100 }).notNull(),
  expiryDate: timestamp('expiry_date', { withTimezone: true }),
  ...timestampColumns(),
}, (table) => [
  index('idx_batches_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_batches_item').on(table.itemId),
  unique('uq_batches_no').on(table.tenantId, table.businessId, table.branchId, table.itemId, table.batchNo),
]);

/**
 * Stock Ledger Table.
 * Double-entry-style immutable, append-only record of all stock moves.
 */
export const stockLedger = pgTable('stock_ledger', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id), // Link to Document engine
  itemId: uuid('item_id').notNull().references(() => items.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  batchId: uuid('batch_id').references(() => batches.id), // Optional batch association
  postingDate: timestamp('posting_date', { withTimezone: true }).notNull(),
  
  // Transaction quantities and rates
  qty: decimal('qty', { precision: 18, scale: 4 }).notNull(), // Negative for issues/outward, positive for receipts/inward (Base UOM qty)
  uom: varchar('uom', { length: 50 }).notNull(), // Transaction UOM at time of posting
  conversionFactor: decimal('conversion_factor', { precision: 18, scale: 6 }).notNull().default('1.000000'), // Conversion factor to base UOM
  
  // Valuation in Base Currency
  valuationRate: decimal('valuation_rate', { precision: 18, scale: 4 }).notNull(), // Rate per unit in base currency
  totalValue: decimal('total_value', { precision: 18, scale: 4 }).notNull(), // totalValue = qty * valuationRate (negative for outward)
  ...timestampColumns(),
}, (table) => [
  index('idx_stock_ledger_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_stock_ledger_item_wh').on(table.itemId, table.warehouseId),
  index('idx_stock_ledger_batch').on(table.batchId),
  index('idx_stock_ledger_posting').on(table.postingDate),
]);

/**
 * Stock Balances Table.
 * Transactional cache snapshot for fast reads and availability checks.
 * Enforces per-warehouse valuation and average cost.
 */
export const stockBalances = pgTable('stock_balances', {
  ...pkColumn(),
  ...tenantColumns(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  batchId: uuid('batch_id').references(() => batches.id), // Optional batch level tracking
  
  qty: decimal('qty', { precision: 18, scale: 4 }).notNull().default('0.0000'), // Aggregate Quantity in Base UOM
  valuationRate: decimal('valuation_rate', { precision: 18, scale: 4 }).notNull().default('0.0000'), // Moving average cost per unit in base currency at this warehouse/batch
  totalValue: decimal('total_value', { precision: 18, scale: 4 }).notNull().default('0.0000'), // Base currency total value (qty * valuationRate)
  ...timestampColumns(),
}, (table) => [
  index('idx_stock_balances_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_stock_balances_item_wh').on(table.itemId, table.warehouseId),
  index('idx_stock_balances_batch').on(table.batchId),
  // Unique index per item, warehouse, and batch (for snapshot updates)
  unique('uq_stock_balances_composite').on(table.tenantId, table.businessId, table.branchId, table.itemId, table.warehouseId, table.batchId),
]);
