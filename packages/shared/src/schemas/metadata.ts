import { z } from 'zod';

export const metadataTypes = [
  'form',
  'field',
  'workflow',
  'layout',
  'numbering',
  'report',
  'dashboard',
  'notification',
  'permission'
] as const;

export const createMetadataDefSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'Key must be alphanumeric and lowercase with underscores'),
  type: z.enum(metadataTypes),
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
});

/**
 * Form field validator.
 * Fields can have an optional $ref linking to a shared field definition (to avoid circular dependencies/re-definition).
 */
export const formFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    'text', 'textarea', 'number', 'currency', 'boolean',
    'date', 'datetime', 'select', 'multi-select', 'relation',
    'formula', 'image', 'pdf', 'attachment', 'table'
  ]),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(), // For 'select' / 'multi-select'
  defaultValue: z.any().optional(),
  $ref: z.string().optional(), // Reference to another metadata (field definition)
});

export const formSectionSchema = z.object({
  title: z.string().min(1),
  columns: z.number().int().min(1).max(12).default(2),
  fields: z.array(formFieldSchema),
});

export const formDefPayloadSchema = z.object({
  sections: z.array(formSectionSchema),
  $ref: z.string().optional(), // In case a form extends another form
});

export const declarativeConditionSchema = z.object({
  field: z.string().min(1), // e.g. 'data.amount', 'createdBy'
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
  value: z.any(),
});

export const workflowTransitionSchema = z.object({
  event: z.string().min(1),
  to: z.string().min(1),
  conditions: z.array(declarativeConditionSchema).optional(),
  approvals: z.object({
    roles: z.array(z.string()).optional(),
    users: z.array(z.string().uuid()).optional(),
    requiredCount: z.number().int().min(1).default(1),
    escalationHours: z.number().int().min(1).optional(),
    escalateToRole: z.string().optional(),
  }).optional(),
});

export const workflowStateSchema = z.object({
  label: z.string().min(1),
  transitions: z.array(workflowTransitionSchema).optional(),
  isEndState: z.boolean().default(false),
});

export const workflowDefPayloadSchema = z.object({
  initialState: z.string().min(1),
  states: z.record(z.string(), workflowStateSchema),
  $ref: z.string().optional(),
});

/**
 * General revision payload schema.
 * The payload is parsed using a specific schema depending on the metadata type.
 */
export const createMetadataRevisionSchema = z.object({
  tenantId: z.string().uuid().nullable().optional(),
  businessId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  payload: z.record(z.any()),
});

export type CreateMetadataDefInput = z.infer<typeof createMetadataDefSchema>;
export type CreateMetadataRevisionInput = z.infer<typeof createMetadataRevisionSchema>;
export type FormDefPayload = z.infer<typeof formDefPayloadSchema>;
export type WorkflowDefPayload = z.infer<typeof workflowDefPayloadSchema>;
