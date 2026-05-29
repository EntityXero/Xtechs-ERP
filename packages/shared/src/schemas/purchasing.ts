import { z } from 'zod';

/**
 * Supplier Validation Schema
 */
export const createSupplierSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

/**
 * Purchase Order Line Validation Schema
 */
export const createPurchaseOrderLineSchema = z.object({
  itemId: z.string().uuid(),
  supplierItemCode: z.string().max(100).optional().nullable(), // Supplier item reference
  qty: z.number().positive(),
  rate: z.number().positive(),
  discountPercentage: z.number().min(0).max(100).default(0),
});

/**
 * Purchase Order Validation Schema
 */
export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(), // Target warehouse for incoming stock
  deliveryDate: z.coerce.date().optional().nullable(),
  description: z.string().max(1000).optional().default(''),
  lines: z.array(createPurchaseOrderLineSchema).min(1, {
    message: "A purchase order must have at least 1 line",
  }),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type CreatePurchaseOrderLineInput = z.infer<typeof createPurchaseOrderLineSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
