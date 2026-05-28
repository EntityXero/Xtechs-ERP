import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { TenantScope } from '@xtechs/shared';

// ─── Fastify type augmentation ───────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    tenantScope: TenantScope | null;
  }
}

// ─── Plugin ──────────────────────────────────────────────────

/**
 * Tenant context plugin.
 * Extracts tenant_id, business_id, branch_id from the authenticated user's
 * auth context and attaches them to `request.tenantScope`.
 *
 * Runs after the auth plugin — if no authContext exists (public route),
 * tenantScope remains null.
 *
 * Every DB query in the ERP must scope to these IDs for branch isolation.
 */
async function tenantContextPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('tenantScope', null);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    if (!request.authContext) return;

    request.tenantScope = {
      tenantId: request.authContext.scope.tenantId,
      businessId: request.authContext.scope.businessId,
      branchId: request.authContext.scope.branchId,
    };
  });
}

export default fp(tenantContextPlugin, {
  name: 'tenant-context',
  dependencies: ['auth'],
});
