import { z } from 'zod';

export const LEAD_STATUSES = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  LOST: 'lost',
} as const;

export const LEAD_STATUS_VALUES = Object.values(LEAD_STATUSES);

export const OPPORTUNITY_STAGES = {
  PROSPECTING: 'prospecting',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
} as const;

export const OPPORTUNITY_STAGE_VALUES = Object.values(OPPORTUNITY_STAGES);

/**
 * Address Validation Schema
 */
export const createAddressSchema = z.object({
  parentType: z.enum(['customer', 'lead']),
  parentId: z.string().uuid(),
  addressType: z.enum(['billing', 'shipping', 'office']).default('billing'),
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  zip: z.string().min(1).max(20),
});

export const updateAddressSchema = z.object({
  addressType: z.enum(['billing', 'shipping', 'office']).optional(),
  addressLine1: z.string().min(1).max(255).optional(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  country: z.string().min(1).max(100).optional(),
  zip: z.string().min(1).max(20).optional(),
});

/**
 * Contact Validation Schema
 */
export const createContactSchema = z.object({
  parentType: z.enum(['customer', 'lead']),
  parentId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional().nullable(),
  isPrimary: z.coerce.date().optional().nullable(),
});

export const updateContactSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional().nullable(),
  isPrimary: z.coerce.date().optional().nullable(),
});

/**
 * Customer Validation Schema
 */
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

/**
 * Lead Validation Schema
 */
export const createLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  company: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional().nullable(),
  status: z.enum(LEAD_STATUS_VALUES as [string, ...string[]]).default('new'),
});

export const updateLeadSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  company: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional().nullable(),
  status: z.enum(LEAD_STATUS_VALUES as [string, ...string[]]).optional(),
});

/**
 * Opportunity Validation Schema
 */
export const createOpportunitySchema = z.object({
  leadId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(255),
  expectedValue: z.number().nonnegative().default(0),
  stage: z.enum(OPPORTUNITY_STAGE_VALUES as [string, ...string[]]).default('prospecting'),
  expectedCloseDate: z.coerce.date().optional().nullable(),
}).refine(data => data.leadId || data.customerId, {
  message: "Opportunity must be linked to either a Lead or a Customer",
  path: ["customerId"],
});

export const updateOpportunitySchema = z.object({
  leadId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(255).optional(),
  expectedValue: z.number().nonnegative().optional(),
  stage: z.enum(OPPORTUNITY_STAGE_VALUES as [string, ...string[]]).optional(),
  expectedCloseDate: z.coerce.date().optional().nullable(),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
