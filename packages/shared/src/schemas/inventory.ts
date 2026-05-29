import { z } from 'zod';

export const ITEM_TYPES = {
  INVENTORY: 'inventory',
  NON_INVENTORY: 'non_inventory',
  SERVICE: 'service',
} as const;

export const ITEM_TYPE_VALUES = Object.values(ITEM_TYPES);

export const VALUATION_METHODS = {
  MOVING_AVERAGE: 'moving_average',
  FIFO: 'fifo',
  STANDARD: 'standard',
} as const;

export const VALUATION_METHOD_VALUES = Object.values(VALUATION_METHODS);

export const STOCK_ENTRY_TYPES = {
  RECEIPT: 'stock_receipt',
  ISSUE: 'stock_issue',
  TRANSFER: 'stock_transfer',
} as const;

export const STOCK_ENTRY_TYPE_VALUES = Object.values(STOCK_ENTRY_TYPES);

/**
 * Warehouse Validation Schema
 */
export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(100),
  parentId: z.string().uuid().optional().nullable(),
  isGroup: z.boolean().default(false),
});

export const updateWarehouseSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().optional().nullable(),
  isGroup: z.boolean().optional(),
});

/**
 * Item Group Validation Schema
 */
export const createItemGroupSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional().nullable(),
});

export const updateItemGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().optional().nullable(),
});

/**
 * Item Validation Schema
 */
export const createItemSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  type: z.enum(ITEM_TYPE_VALUES as [string, ...string[]]),
  itemGroupId: z.string().uuid(),
  baseUom: z.string().min(1).max(50),
  valuationMethod: z.enum(VALUATION_METHOD_VALUES as [string, ...string[]]).default('moving_average'),
});

export const updateItemSchema = z.object({
  sku: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(255).optional(),
  type: z.enum(ITEM_TYPE_VALUES as [string, ...string[]]).optional(),
  itemGroupId: z.string().uuid().optional(),
  baseUom: z.string().min(1).max(50).optional(),
  valuationMethod: z.enum(VALUATION_METHOD_VALUES as [string, ...string[]]).optional(),
  isArchived: z.boolean().optional(),
});

/**
 * Item UOM Conversion Validation Schema
 */
export const createItemUomSchema = z.object({
  uom: z.string().min(1).max(50),
  conversionFactor: z.number().positive(),
});

/**
 * Batch Validation Schema
 */
export const createBatchSchema = z.object({
  itemId: z.string().uuid(),
  batchNo: z.string().min(1).max(100),
  expiryDate: z.coerce.date().optional().nullable(),
});

/**
 * Stock Entry Line Input Schema (for transaction creation)
 */
export const createStockEntryLineSchema = z.object({
  itemId: z.string().uuid(),
  sourceWarehouseId: z.string().uuid().optional().nullable(), // Null for receipts
  targetWarehouseId: z.string().uuid().optional().nullable(), // Null for issues
  batchId: z.string().uuid().optional().nullable(),
  qty: z.number().positive(),
  uom: z.string().min(1).max(50),
  conversionFactor: z.number().positive().default(1),
  valuationRate: z.number().nonnegative().optional().default(0), // Can be 0; computed for issues/transfers, provided for receipts
}).refine((data) => {
  // Line must have at least one warehouse
  return data.sourceWarehouseId || data.targetWarehouseId;
}, {
  message: "Stock line must have a source warehouse, target warehouse, or both",
  path: ["targetWarehouseId"],
});

/**
 * Stock Entry Input Schema
 */
export const createStockEntrySchema = z.object({
  type: z.enum(STOCK_ENTRY_TYPE_VALUES as [string, ...string[]]),
  postingDate: z.coerce.date(),
  description: z.string().max(1000).optional().default(''),
  lines: z.array(createStockEntryLineSchema).min(1, {
    message: "A stock entry must have at least 1 line",
  }),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateItemGroupInput = z.infer<typeof createItemGroupSchema>;
export type UpdateItemGroupInput = z.infer<typeof updateItemGroupSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CreateItemUomInput = z.infer<typeof createItemUomSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type CreateStockEntryLineInput = z.infer<typeof createStockEntryLineSchema>;
export type CreateStockEntryInput = z.infer<typeof createStockEntrySchema>;
