import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { resolvePermissions, hasPermission } from '../lib/permission-service.js';

/**
 * Fastify preHandler hook factory to enforce deny-by-default permissions.
 *
 * Resolves the user's permissions on the first check and attaches them to the request
 * context to prevent redundant DB queries on subsequent checks or route handlers.
 *
 * Enforces:
 * - Deny-by-default (no auth context -> UnauthorizedError; no matching permission -> ForbiddenError)
 * - Deny overrides allow (handled inside permission service)
 */
export function requirePermission(resource: string, action: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const { authContext } = request;

    if (!authContext) {
      throw new UnauthorizedError('Authentication required to access this resource');
    }

    // Lazy-resolve and cache permissions on the request context
    if (!authContext.permissions) {
      const db = request.server.db;
      authContext.permissions = await resolvePermissions(
        db,
        authContext.userId,
        authContext.scope.branchId
      );
    }

    const permitted = hasPermission(authContext.permissions, resource, action);
    if (!permitted) {
      throw new ForbiddenError(`You do not have permission to ${action} ${resource}`);
    }
  };
}
