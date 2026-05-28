import { auditLogs } from '@xtechs/db/schema';
import type { Database } from '@xtechs/db';

/**
 * Entity-level audit logging service.
 *
 * Every data mutation in the ERP must call this to create an immutable
 * audit entry. Each entry records:
 * - WHO did it (actorId)
 * - WHAT changed (entityType, entityId, action, old/new values)
 * - WHERE (tenantId, businessId, branchId)
 * - CONTEXT (requestId, ipAddress, timestamp)
 *
 * This provides a complete, per-entity history trail that is:
 * - Append-only (never updated or deleted)
 * - Branch-isolated (scoped to tenant/business/branch)
 * - Correlation-friendly (requestId links to HTTP request)
 *
 * Usage:
 * ```ts
 * await logAudit(db, {
 *   entityType: 'user',
 *   entityId: user.id,
 *   action: 'create',
 *   newValues: { email: user.email },
 *   ...scoped.auditMeta(),
 *   requestId: request.id,
 *   ipAddress: request.ip,
 * });
 * ```
 */

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'approve'
  | 'reject'
  | 'transition'
  | 'register'
  | 'assign'
  | 'revoke';

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  requestId?: string;
  tenantId: string;
  businessId: string;
  branchId: string;
  ipAddress?: string;
}

/**
 * Log an immutable audit entry.
 *
 * This function NEVER throws — audit failures are logged to stderr
 * but do not block the request. This ensures audit logging doesn't
 * degrade the user experience on low-end hardware.
 */
export async function logAudit(db: Database, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId,
      oldValues: entry.oldValues ?? null,
      newValues: entry.newValues ?? null,
      requestId: entry.requestId,
      tenantId: entry.tenantId,
      businessId: entry.businessId,
      branchId: entry.branchId,
      ipAddress: entry.ipAddress,
    });
  } catch (error) {
    // Never let audit failures break the request.
    // Log to stderr for monitoring — production should alert on these.
    console.error('[AUDIT] Failed to write audit log:', error);
  }
}
