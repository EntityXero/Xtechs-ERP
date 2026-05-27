import { envSchema } from '@xtechs/shared';
import type { EnvConfig } from '@xtechs/shared';

/**
 * Parse and validate environment variables at startup.
 * Fails fast with clear error messages if config is invalid.
 */
export function loadEnvConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    console.error('❌ Invalid environment configuration:');
    for (const [field, messages] of Object.entries(errors)) {
      console.error(`   ${field}: ${(messages ?? []).join(', ')}`);
    }
    process.exit(1);
  }

  return result.data;
}
