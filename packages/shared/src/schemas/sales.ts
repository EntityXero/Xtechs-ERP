import { z } from 'zod';

/**
 * Quotation Line Validation Schema
 */
export const createQuotationLineSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  rate: z.number().positive(),
  discountPercentage: z.number().min(0).max(100).default(0),
});

/**
 * Quotation Validation Schema
 */
export const createQuotationSchema = z.object({
  customerId: z.string().uuid(),
  opportunityId: z.string().uuid().optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
  description: z.string().max(1000).optional().default(''),
  lines: z.array(createQuotationLineSchema).min(1, {
    message: "A quotation must have at least 1 line",
  }),
});

/**
 * Sales Order Line Validation Schema
 */
export const createSalesOrderLineSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  rate: z.number().positive(),
  discountPercentage: z.number().min(0).max(100).default(0),
});

/**
 * Sales Order Validation Schema
 */
export const createSalesOrderSchema = z.object({
  customerId: z.string().uuid(),
  warehouseId: z.string().uuid(), // Warehouse from where to reserve stock
  quotationId: z.string().uuid().optional().nullable(),
  deliveryDate: z.coerce.date().optional().nullable(),
  description: z.string().max(1000).optional().default(''),
  lines: z.array(createSalesOrderLineSchema).min(1, {
    message: "A sales order must have at least 1 line",
  }),
});

export type CreateQuotationLineInput = z.infer<typeof createQuotationLineSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type CreateSalesOrderLineInput = z.infer<typeof createSalesOrderLineSchema>;
export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
