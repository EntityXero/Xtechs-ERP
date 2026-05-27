import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Auth plugin skeleton.
 * In Phase 1, this will:
 * - Verify JWT tokens from Authorization header
 * - Decode and attach AuthContext to request
 * - Skip auth for public routes (health, login)
 *
 * Currently a no-op skeleton for scaffolding.
 */
async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('authContext', null);

  // TODO: Phase 1 — implement JWT verification
  // fastify.addHook('onRequest', async (request, reply) => {
  //   const publicRoutes = ['/health', '/api/v1/auth/login'];
  //   if (publicRoutes.includes(request.url)) return;
  //   
  //   const token = request.headers.authorization?.replace('Bearer ', '');
  //   if (!token) throw new UnauthorizedError();
  //   
  //   const payload = verifyToken(token);
  //   request.authContext = { ... };
  // });
}

export default fp(authPlugin, {
  name: 'auth',
});
