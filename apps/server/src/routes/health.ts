import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createDb } from '@xtechs/db';
import type { EnvConfig } from '@xtechs/shared';

interface HealthRouteOptions {
  config: EnvConfig;
}

/**
 * Health check route.
 * Returns server status, uptime, and database connectivity.
 */
export async function healthRoutes(fastify: FastifyInstance, opts: HealthRouteOptions) {
  const { config } = opts;
  const { db } = createDb(config.DATABASE_URL);

  fastify.get('/health', async (_request, _reply) => {
    const uptime = process.uptime();

    let dbStatus = 'disconnected';
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      version: '0.1.0',
      services: {
        database: dbStatus,
      },
    };
  });
}
