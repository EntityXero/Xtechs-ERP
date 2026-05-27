import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/**
 * Create a Drizzle ORM client instance.
 * Uses postgres.js driver for connection pooling.
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema });

  return { db, client };
}

export type Database = ReturnType<typeof createDb>['db'];
