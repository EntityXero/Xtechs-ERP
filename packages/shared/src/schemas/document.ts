import { z } from 'zod';
import { DOCUMENT_LIFECYCLE_VALUES } from '../constants/document-lifecycle.js';

export const createDocumentLineSchema = z.object({
  lineNumber: z.number().int().min(1),
  description: z.string().max(500).optional().nullable(),
  quantity: z.number().nonnegative().default(0),
  unitPrice: z.number().nonnegative().default(0),
  amount: z.number().nonnegative().default(0),
  data: z.record(z.any()).default({}),
});

export const createDocumentLinkSchema = z.object({
  targetDocId: z.string().uuid(),
  relationType: z.string().min(1).max(100),
});

export const createDocumentCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const createDocumentInputSchema = z.object({
  type: z.string().min(1).max(100),
  status: z.string().max(50).default('active'),
  workflowState: z.enum(DOCUMENT_LIFECYCLE_VALUES as [string, ...string[]]).default('draft'),
  data: z.record(z.any()).default({}),
  assignedTo: z.string().uuid().optional().nullable(),
  lines: z.array(createDocumentLineSchema).default([]),
  links: z.array(createDocumentLinkSchema).default([]),
});

export const updateDocumentInputSchema = z.object({
  status: z.string().max(50).optional(),
  workflowState: z.enum(DOCUMENT_LIFECYCLE_VALUES as [string, ...string[]]).optional(),
  data: z.record(z.any()).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  lines: z.array(createDocumentLineSchema).optional(),
  links: z.array(createDocumentLinkSchema).optional(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentInputSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentInputSchema>;
export type CreateDocumentLineInput = z.infer<typeof createDocumentLineSchema>;
export type CreateDocumentLinkInput = z.infer<typeof createDocumentLinkSchema>;
export type CreateDocumentCommentInput = z.infer<typeof createDocumentCommentSchema>;
