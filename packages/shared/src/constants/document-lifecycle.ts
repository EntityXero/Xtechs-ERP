/**
 * Document lifecycle states per ERP spec.
 * All business entities (invoices, POs, payments, etc.) follow this lifecycle.
 */
export const DOCUMENT_LIFECYCLE = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  POSTED: 'posted',
  ARCHIVED: 'archived',
  REVERSED: 'reversed',
} as const;

export type DocumentLifecycleState =
  (typeof DOCUMENT_LIFECYCLE)[keyof typeof DOCUMENT_LIFECYCLE];

export const DOCUMENT_LIFECYCLE_VALUES = Object.values(DOCUMENT_LIFECYCLE);

/**
 * Valid state transitions for documents.
 * Used by the workflow engine to validate transitions.
 */
export const DOCUMENT_TRANSITIONS: Record<DocumentLifecycleState, readonly DocumentLifecycleState[]> = {
  [DOCUMENT_LIFECYCLE.DRAFT]: [DOCUMENT_LIFECYCLE.PENDING_APPROVAL, DOCUMENT_LIFECYCLE.ARCHIVED],
  [DOCUMENT_LIFECYCLE.PENDING_APPROVAL]: [DOCUMENT_LIFECYCLE.APPROVED, DOCUMENT_LIFECYCLE.DRAFT],
  [DOCUMENT_LIFECYCLE.APPROVED]: [DOCUMENT_LIFECYCLE.POSTED, DOCUMENT_LIFECYCLE.DRAFT],
  [DOCUMENT_LIFECYCLE.POSTED]: [DOCUMENT_LIFECYCLE.REVERSED, DOCUMENT_LIFECYCLE.ARCHIVED],
  [DOCUMENT_LIFECYCLE.ARCHIVED]: [],
  [DOCUMENT_LIFECYCLE.REVERSED]: [DOCUMENT_LIFECYCLE.ARCHIVED],
} as const;
