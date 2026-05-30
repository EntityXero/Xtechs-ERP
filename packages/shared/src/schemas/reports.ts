import { z } from 'zod';

/**
 * Zod validation schema for metadata-driven custom query configuration.
 */
export const queryConfigSchema = z.object({
  tableName: z.string().min(1),
  select: z.array(z.string()).min(1),
  where: z.array(
    z.object({
      column: z.string().min(1),
      operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'between']),
      value: z.any(),
    })
  ).optional().default([]),
  groupBy: z.array(z.string()).optional().default([]),
  orderBy: z.array(
    z.object({
      column: z.string().min(1),
      direction: z.enum(['asc', 'desc']).default('asc'),
    })
  ).optional().default([]),
  limit: z.number().int().positive().max(10000).optional(),
});

export const createReportDefinitionSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().max(255).optional().nullable(),
  type: z.enum(['standard', 'custom']).default('custom'),
  module: z.enum(['accounting', 'inventory', 'sales', 'purchasing', 'hr', 'audit']),
  queryConfig: queryConfigSchema.optional().default({ tableName: '', select: [] }),
  filtersConfig: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
      options: z.array(z.string()).optional(), // Optional dropdown values
      required: z.boolean().default(false),
    })
  ).optional().default([]),
  columnsConfig: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      type: z.enum(['text', 'number', 'currency', 'date', 'boolean']),
      formatter: z.string().optional(), // 'currencySymbol', 'percentage', etc.
    })
  ).optional().default([]),
});

export const updateReportDefinitionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(255).optional().nullable(),
  queryConfig: queryConfigSchema.optional(),
  filtersConfig: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
      options: z.array(z.string()).optional(),
      required: z.boolean().default(false),
    })
  ).optional(),
  columnsConfig: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      type: z.enum(['text', 'number', 'currency', 'date', 'boolean']),
      formatter: z.string().optional(),
    })
  ).optional(),
});

/**
 * Report Execution / Query Request validation.
 */
export const executeReportRequestSchema = z.object({
  reportCode: z.string().min(1),
  filters: z.record(z.any()).optional().default({}),
  outputFormat: z.enum(['json', 'csv', 'html']).default('json'),
});

export type QueryConfig = z.infer<typeof queryConfigSchema>;
export type CreateReportDefinitionInput = z.infer<typeof createReportDefinitionSchema>;
export type UpdateReportDefinitionInput = z.infer<typeof updateReportDefinitionSchema>;
export type ExecuteReportRequestInput = z.infer<typeof executeReportRequestSchema>;
