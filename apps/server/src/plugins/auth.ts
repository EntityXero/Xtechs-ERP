import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { AuthContext, EnvConfig } from '@xtechs/shared';
import { verifyAccessToken } from '../lib/auth.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

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

  // Verify JWT on every request (except public routes).
  // Reads token from:
  //   1. HttpOnly cookie: `access_token` (preferred, set by login)
  //   2. Authorization: Bearer <token> header (fallback for API clients / SSR)
  fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (isPublicRoute(request.url)) {
      return;
    }

    let token: string | undefined;

    // 1. Try HttpOnly cookie first
    const cookieToken = (request.cookies as Record<string, string | undefined>)?.['access_token'];
    if (cookieToken) {
      token = cookieToken;
    }

    // 2. Fallback to Bearer header (for API clients / SSR cookie forwarding)
    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required. Missing token.');
    }

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
      forcePasswordChange: payload.forcePasswordChange,
    };

    // Block non-authorized routes if forcePasswordChange is true
    if (payload.forcePasswordChange) {
      const allowedPaths = [
        '/api/v1/auth/change-password',
        '/api/v1/auth/logout',
        '/api/v1/auth/me',
      ];
      const currentPath = request.url.split('?')[0]!;
      if (!allowedPaths.includes(currentPath)) {
        throw new ForbiddenError('Password change required before accessing other resources');
      }
    }
  });
}

export default fp(authPlugin, {
  name: 'auth',
  // @fastify/cookie must be registered before this plugin
  dependencies: ['@fastify/cookie'],
});
