import type { FastifyInstance } from 'fastify';

/**
 * Health check route.
 * Returns server status, uptime, and database connectivity.
 */
export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (_request, _reply) => {
    const uptime = process.uptime();

    // TODO: Phase 1 — add DB connectivity check
    // try {
    //   await db.execute(sql`SELECT 1`);
    //   dbStatus = 'connected';
    // } catch { dbStatus = 'disconnected'; }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      version: '0.1.0',
      services: {
        database: 'pending', // Will be 'connected' or 'disconnected' after Phase 1
      },
    };
  });
}
