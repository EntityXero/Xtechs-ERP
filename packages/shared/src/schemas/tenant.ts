import { z } from 'zod';

const statusSchema = z.enum(['active', 'suspended', 'archived']);

export const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const createBusinessSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  legalName: z.string().max(500).nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const createBranchSchema = z.object({
  tenantId: z.string().uuid(),
  businessId: z.string().uuid(),
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/, 'Branch code must be uppercase alphanumeric with hyphens'),
  isDefault: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
