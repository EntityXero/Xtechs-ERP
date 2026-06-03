import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { searchRequestSchema } from '@xtechs/shared';
import { createScopedDb } from '../lib/scoped-db.js';
import { SearchService } from '../lib/search-service.js';

export async function searchRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  // ==========================================
  // GLOBAL SEARCH
  // ==========================================
  fastify.get(
    '/api/v1/search',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Ensure user is authenticated
      if (!request.authContext) {
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const { q, type, limit, offset } = searchRequestSchema.parse(request.query);
      const scoped = createScopedDb(request.authContext);

      const results = await SearchService.globalSearch(
        db,
        q,
        scoped.auth.scope as any,
        {
          limit,
          offset,
          entityType: type,
        }
      );

      return reply.send(results);
    }
  );
}
