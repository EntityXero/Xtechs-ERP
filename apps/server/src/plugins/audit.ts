import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Audit logging plugin.
 * Hooks into onResponse to log request metadata to the audit_logs table.
 *
 * The actual audit entries for data mutations will be created by service-layer
 * code (not this hook). This hook captures request-level metadata for
 * correlation via request_id.
 *
 * Currently a skeleton — depends on DB and auth being wired.
 */
async function auditPlugin(fastify: FastifyInstance) {
  // TODO: Phase 1 — implement audit logging
  // fastify.addHook('onResponse', async (request, reply) => {
  //   // Only log mutating requests
  //   if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  //   
  //   // Log to audit_logs table
  //   // await db.insert(auditLogs).values({ ... });
  // });
}

export default fp(auditPlugin, {
  name: 'audit',
  dependencies: ['auth', 'tenant-context'],
});
