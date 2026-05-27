import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { randomUUID } from 'node:crypto';
import type { EnvConfig } from '@xtechs/shared';
import { AppError, ValidationError } from './lib/errors.js';
import authPlugin from './plugins/auth.js';
import tenantContextPlugin from './plugins/tenant-context.js';
import auditPlugin from './plugins/audit.js';
import { healthRoutes } from './routes/health.js';

/**
 * Fastify app factory.
 * Creates and configures the application with all plugins and routes.
 */
export async function buildApp(config: EnvConfig) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    genReqId: () => randomUUID(),
    requestTimeout: 30_000,
  });

  // --- Core plugins ---
  await app.register(cors, {
    origin: config.NODE_ENV === 'development' ? true : false,
    credentials: true,
  });

  await app.register(sensible);

  // --- ERP plugins (registration order matters) ---
  await app.register(authPlugin);
  await app.register(tenantContextPlugin);
  await app.register(auditPlugin);

  // --- Routes ---
  await app.register(healthRoutes);

  // --- Global error handler ---
  app.setErrorHandler((error: Error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        ...('details' in error ? { details: (error as { details: unknown }).details } : {}),
      });
    }

    // Fastify validation errors
    if ('validation' in error) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: (error as Record<string, unknown>)['validation'],
      });
    }

    // Unexpected errors
    app.log.error(error);
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: config.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  });

  // --- Graceful shutdown ---
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }

  return app;
}
