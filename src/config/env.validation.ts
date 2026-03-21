import { z } from 'zod';

/**
 * Prisma PostgreSQL URLs often fail z.string().url() when userinfo contains reserved
 * characters (e.g. @, :, #) that are not percent-encoded — the WHATWG URL parser rejects
 * them even though node-postgres / Prisma accept the string.
 */
function isValidDatabaseUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^postgres(ql)?:\/\/.+/i.test(v)) {
    return true;
  }
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

export const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4001),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(isValidDatabaseUrl, { message: 'Invalid database URL' }),

  // JWT
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().min(60).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().min(3600).default(2592000),

  // Key Management
  AUTH_KEY_ENCRYPTION_SECRET: z.string().min(32),
  KEY_ROTATION_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  KEY_ROTATION_INTERVAL_HOURS: z.coerce.number().min(1).default(720),

  // Internal Service
  INTERNAL_SERVICE_TOKEN: z.string().min(32),

  // Rate Limiting
  RATE_LIMIT_AUTH_MAX: z.coerce.number().min(1).default(10),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().min(1000).default(60000),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}
