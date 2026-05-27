import type { DocumentLifecycleState } from '../constants/document-lifecycle.js';

/**
 * Base document interface.
 * All business entities (invoice, PO, payment, etc.) extend this.
 */
export interface BaseDocument {
  id: string;
  docType: string;
  docNumber: string | null;
  status: DocumentLifecycleState;
  workflowState: string | null;
  tenantId: string;
  businessId: string;
  branchId: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  requestId: string | null;
  tenantId: string;
  businessId: string;
  branchId: string;
  ipAddress: string | null;
  timestamp: Date;
}
