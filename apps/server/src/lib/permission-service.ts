import { eq, and } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import { userRoles, roles, rolePermissions, permissions } from '@xtechs/db/schema';
import type { ResolvedPermission } from '@xtechs/shared';

/**
 * Resolve all permissions for a user in their current branch scope.
 *
 * If the user has the 'Admin' role in this branch, they automatically
 * get wildcard (* / *) allow permissions.
 */
export async function resolvePermissions(
  db: Database,
  userId: string,
  branchId: string
): Promise<ResolvedPermission[]> {
  // 1. Get all assigned roles in this branch
  const assignedRoles = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.branchId, branchId)
      )
    );

  const roleNames = assignedRoles.map((r) => r.name);

  // Admin bypass: Admin role has full wildcard access
  if (roleNames.includes('Admin')) {
    return [{ resource: '*', action: '*', effect: 'allow' }];
  }

  if (roleNames.length === 0) {
    return [];
  }

  // 2. Fetch all role permissions mapped to the user's roles
  const rolePerms = await db
    .select({
      resource: permissions.resource,
      action: permissions.action,
      effect: permissions.effect,
    })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.branchId, branchId)
      )
    );

  return rolePerms.map((rp) => ({
    resource: rp.resource,
    action: rp.action,
    effect: rp.effect as 'allow' | 'deny',
  }));
}

/**
 * Pattern match helper for resources and actions (supports wildcards like '*').
 */
export function matchPattern(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return value.startsWith(prefix);
  }
  return pattern === value;
}

/**
 * Core permission check function (pure function).
 * Deny overrides allow: if there's any matching deny rule, returns false.
 */
export function hasPermission(
  resolved: ResolvedPermission[],
  resource: string,
  action: string
): boolean {
  // 1. Check for explicit deny (deny overrides allow)
  const hasDeny = resolved.some(
    (p) =>
      p.effect === 'deny' &&
      matchPattern(p.resource, resource) &&
      matchPattern(p.action, action)
  );
  if (hasDeny) return false;

  // 2. Check for explicit allow
  return resolved.some(
    (p) =>
      p.effect === 'allow' &&
      matchPattern(p.resource, resource) &&
      matchPattern(p.action, action)
  );
}

/**
 * Check if a specific field on a resource is explicitly denied.
 */
export function isFieldDenied(
  resolved: ResolvedPermission[],
  resource: string,
  field: string,
  action: string
): boolean {
  return resolved.some(
    (p) =>
      p.effect === 'deny' &&
      matchPattern(p.resource, resource) &&
      (matchPattern(p.action, `${action}:${field}`) || matchPattern(p.action, '*'))
  );
}

/**
 * Enforces field masking on a single entity server-side based on permission rules.
 *
 * Rules:
 * - If general permission (e.g. 'read') is allowed, all fields are returned except those explicitly denied (e.g. 'read:grossAmount' -> deny).
 * - If general permission is denied, only fields explicitly allowed (e.g. 'read:displayName' -> allow) are returned.
 */
export function maskEntity<T extends Record<string, any>>(
  resolved: ResolvedPermission[],
  resource: string,
  entity: T,
  action: 'read' | 'update' = 'read'
): Partial<T> {
  const result: Record<string, any> = {};
  const hasGeneral = hasPermission(resolved, resource, action);

  for (const [key, value] of Object.entries(entity)) {
    const explicitDenied = isFieldDenied(resolved, resource, key, action);
    const explicitAllowed = hasPermission(resolved, resource, `${action}:${key}`);

    if (explicitAllowed || (hasGeneral && !explicitDenied)) {
      result[key] = value;
    }
  }

  return result as Partial<T>;
}

/**
 * Enforces field masking on a collection of entities.
 */
export function maskEntities<T extends Record<string, any>>(
  resolved: ResolvedPermission[],
  resource: string,
  entities: T[],
  action: 'read' | 'update' = 'read'
): Partial<T>[] {
  return entities.map((entity) => maskEntity(resolved, resource, entity, action));
}
