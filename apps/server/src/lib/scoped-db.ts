import { eq, and, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { AuthContext } from '@xtechs/shared';

/**
 * Scoped DB query helper.
 *
 * Creates tenant/business/branch filter conditions from the authenticated
 * user's context. This enforces branch isolation at the infrastructure level —
 * routes physically cannot query outside their scope.
 *
 * Lightweight: no DB connection, no allocations — just returns drizzle
 * SQL conditions that routes pass to `.where()`.
 *
 * Usage:
 * ```ts
 * const scoped = createScopedDb(request.authContext!);
 * const rows = await db.select().from(invoices).where(scoped.filters(invoices));
 * ```
 */

export interface ScopedTableColumns {
  tenantId: PgColumn;
  businessId: PgColumn;
  branchId: PgColumn;
}

export interface ScopedDb {
  /** Returns drizzle AND conditions for tenant/business/branch filtering */
  filters: (table: ScopedTableColumns) => SQL;

  /** Returns audit metadata for logging mutations */
  auditMeta: () => AuditMeta;

  /** The raw auth context */
  auth: AuthContext;
}

export interface AuditMeta {
  actorId: string;
  tenantId: string;
  businessId: string;
  branchId: string;
}

/**
 * Create a scoped DB helper from the request's auth context.
 *
 * @param authContext - The authenticated user's context (from request.authContext)
 * @returns ScopedDb with filter and audit helpers
 */
export function createScopedDb(authContext: AuthContext): ScopedDb {
  const { scope, tokenScope, userId } = authContext;

  return {
    filters(table: ScopedTableColumns): SQL {
      if (tokenScope === 'all-branches') {
        // Admin: filter by tenant + business only (see all branches)
        return and(
          eq(table.tenantId, scope.tenantId),
          eq(table.businessId, scope.businessId),
        )!;
      }

      // Regular user: filter by tenant + business + branch
      return and(
        eq(table.tenantId, scope.tenantId),
        eq(table.businessId, scope.businessId),
        eq(table.branchId, scope.branchId),
      )!;
    },

    auditMeta(): AuditMeta {
      return {
        actorId: userId,
        tenantId: scope.tenantId,
        businessId: scope.businessId,
        branchId: scope.branchId,
      };
    },

    auth: authContext,
  };
}
