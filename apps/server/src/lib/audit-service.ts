import { auditLogs } from '@xtechs/db/schema';
import type { Database } from '@xtechs/db';
import { and, eq, gte, lte, desc, sql, type SQL } from 'drizzle-orm';
import { Readable } from 'stream';

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

export interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  branchId?: string;
  actorId?: string;
  entityType?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Query audit logs with security scope enforcement, filters, and pagination.
 */
export async function queryAuditLogs(
  db: Database,
  scopeCondition: SQL,
  options: AuditQueryOptions = {}
): Promise<{ logs: any[]; total: number }> {
  const limit = Math.min(options.limit ?? 50, 100);
  const offset = options.offset ?? 0;

  const conditions: SQL[] = [scopeCondition];

  if (options.branchId) {
    conditions.push(eq(auditLogs.branchId, options.branchId));
  }
  if (options.actorId) {
    conditions.push(eq(auditLogs.actorId, options.actorId));
  }
  if (options.entityType) {
    conditions.push(eq(auditLogs.entityType, options.entityType));
  }
  if (options.action) {
    conditions.push(eq(auditLogs.action, options.action));
  }
  if (options.startDate) {
    conditions.push(gte(auditLogs.timestamp, new Date(options.startDate)));
  }
  if (options.endDate) {
    conditions.push(lte(auditLogs.timestamp, new Date(options.endDate)));
  }

  const whereClause = and(...conditions);

  // Retrieve total count for pagination
  const [countRes] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(whereClause);

  const total = countRes?.count ?? 0;

  const logs = await db
    .select()
    .from(auditLogs)
    .where(whereClause)
    .orderBy(desc(auditLogs.timestamp))
    .limit(limit)
    .offset(offset);

  return { logs, total };
}

/**
 * Fetch the sequential audit trail for a specific entity.
 */
export async function getEntityTimeline(
  db: Database,
  scopeCondition: SQL,
  entityType: string,
  entityId: string
): Promise<any[]> {
  const conditions = [
    scopeCondition,
    eq(auditLogs.entityType, entityType),
    eq(auditLogs.entityId, entityId),
  ];

  return db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.timestamp));
}

/**
 * Escape CSV fields according to standard RFC 4180 rules.
 */
function escapeCsv(val: string): string {
  if (!val) return '';
  const escaped = val.replace(/"/g, '""');
  if (
    escaped.includes(',') ||
    escaped.includes('\n') ||
    escaped.includes('\r') ||
    escaped.includes('"')
  ) {
    return `"${escaped}"`;
  }
  return escaped;
}

/**
 * Streams a set of audit logs into a CSV format.
 */
export function streamAuditLogsCsv(logs: any[]): Readable {
  const stream = new Readable({
    read() {}, // No-op, we push manually
  });

  const headers = [
    'id',
    'timestamp',
    'entity_type',
    'entity_id',
    'action',
    'actor_id',
    'request_id',
    'ip_address',
    'old_values',
    'new_values',
  ];

  stream.push(headers.join(',') + '\r\n');

  for (const log of logs) {
    const row = [
      log.id,
      log.timestamp?.toISOString() ?? '',
      escapeCsv(log.entityType),
      log.entityId,
      escapeCsv(log.action),
      log.actorId,
      log.requestId ?? '',
      escapeCsv(log.ipAddress ?? ''),
      escapeCsv(log.oldValues ? JSON.stringify(log.oldValues) : ''),
      escapeCsv(log.newValues ? JSON.stringify(log.newValues) : ''),
    ];
    stream.push(row.join(',') + '\r\n');
  }

  stream.push(null); // End of stream
  return stream;
}
