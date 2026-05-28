import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

// ─── Fastify type augmentation ───────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    /** Client IP address extracted for audit logging */
    clientIp: string;
  }
}

// ─── Plugin ──────────────────────────────────────────────────

/**
 * Audit plugin.
 * Decorates each request with the client IP address for audit correlation.
 *
 * The actual audit entries are created by the AuditService (src/lib/audit-service.ts)
 * which route handlers call explicitly per mutation. This plugin only provides
 * request-level metadata (IP, requestId is already set by Fastify's genReqId).
 *
 * Fastify's `request.id` (UUID) is used as the requestId for audit correlation.
 */
async function auditPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('clientIp', '');

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Extract client IP — handle proxied requests (X-Forwarded-For)
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      request.clientIp = forwarded.split(',')[0]!.trim();
    } else {
      request.clientIp = request.ip;
    }
  });
}

export default fp(auditPlugin, {
  name: 'audit',
  dependencies: ['auth', 'tenant-context'],
});
