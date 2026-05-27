import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });
import { loadEnvConfig } from './config/env.js';
import { buildApp } from './app.js';

/**
 * Server entry point.
 * 1. Validates environment configuration
 * 2. Builds Fastify app with all plugins
 * 3. Starts listening on configured host:port
 */
async function main() {
  const config = loadEnvConfig();
  const app = await buildApp(config);

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST,
    });
    app.log.info(`🚀 Xtechs ERP Server running at ${address}`);
  } catch (error) {
    app.log.fatal(error, 'Failed to start server');
    process.exit(1);
  }
}

main();
