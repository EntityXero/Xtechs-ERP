import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Tenant context plugin.
 * Extracts tenant_id, business_id, branch_id from the authenticated user's context
 * and makes them available on the request for query scoping.
 *
 * This enforces branch isolation at the request level — every DB query
 * should scope to these IDs.
 *
 * Currently a skeleton — depends on auth plugin being implemented first.
 */
async function tenantContextPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('tenantScope', null);

  // TODO: Phase 1 — extract tenant scope from auth context
  // fastify.addHook('onRequest', async (request) => {
  //   if (!request.authContext) return;
  //   request.tenantScope = {
  //     tenantId: request.authContext.scope.tenantId,
  //     businessId: request.authContext.scope.businessId,
  //     branchId: request.authContext.scope.branchId,
  //   };
  // });
}

export default fp(tenantContextPlugin, {
  name: 'tenant-context',
  dependencies: ['auth'],
});
