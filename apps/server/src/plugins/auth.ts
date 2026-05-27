import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { AuthContext, EnvConfig } from '@xtechs/shared';
import { verifyAccessToken } from '../lib/auth.js';
import { UnauthorizedError } from '../lib/errors.js';

/** Routes that do not require authentication */
const PUBLIC_ROUTES = [
  '/health',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
];

/**
 * Check if a request URL matches a public route.
 * Strips query strings before comparison.
 */
function isPublicRoute(url: string): boolean {
  const path = url.split('?')[0]!;
  return PUBLIC_ROUTES.includes(path);
}

// ─── Fastify type augmentation ───────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext | null;
  }
}

// ─── Plugin ──────────────────────────────────────────────────

interface AuthPluginOptions {
  jwtSecret: string;
}

async function authPlugin(fastify: FastifyInstance, opts: AuthPluginOptions) {
  // Decorate all requests with authContext (starts null)
  fastify.decorateRequest('authContext', null);

  // Verify JWT on every request (except public routes)
  fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (isPublicRoute(request.url)) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7); // Strip 'Bearer '
    const payload = await verifyAccessToken(token, opts.jwtSecret);

    request.authContext = {
      userId: payload.sub,
      email: payload.email,
      scope: {
        tenantId: payload.tenantId,
        businessId: payload.businessId,
        branchId: payload.branchId,
      },
      tokenScope: payload.tokenScope,
      roles: payload.roles,
    };
  });
}

export default fp(authPlugin, {
  name: 'auth',
});
