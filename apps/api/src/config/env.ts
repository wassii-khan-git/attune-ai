import { z } from 'zod';

const ENCRYPTION_KEY_BYTES = 32;
const MIN_SECRET_LENGTH = 32;

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

const secret = z.string().min(MIN_SECRET_LENGTH);

/**
 * Browsers send an origin without a path or trailing slash, so each entry is
 * normalised to that form; otherwise `https://app.example.com/` would never match.
 */
const corsOrigins = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(
    z.array(z.url({ protocol: /^https?$/ }).transform((origin) => new URL(origin).origin)).min(1),
  );

/**
 * The full environment contract of the API. `.env.example` mirrors this schema
 * and a test fails if the two drift apart.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: postgresUrl,

  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),

  ENCRYPTION_KEY: z
    .base64()
    .refine((value) => Buffer.from(value, 'base64').length === ENCRYPTION_KEY_BYTES, {
      error: `Must decode to exactly ${String(ENCRYPTION_KEY_BYTES)} bytes`,
    }),

  JWT_ACCESS_SECRET: secret,

  CORS_ALLOWED_ORIGINS: corsOrigins,

  CRON_SECRET: secret,
});

export type Config = Readonly<z.infer<typeof envSchema>>;

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      ['Invalid environment configuration:', ...problems.map((problem) => `  - ${problem}`)].join(
        '\n',
      ),
    );
    this.name = 'ConfigError';
  }
}

/**
 * Validates the environment once at startup so a misconfigured deployment fails
 * immediately instead of on the first request that needs the missing value.
 *
 * Problems name the variable and the expected shape only; received values are
 * never echoed, so a mistyped secret cannot end up in boot logs.
 */
export function loadConfig(source: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => {
        const [variable] = issue.path;
        const isMissing = typeof variable === 'string' && source[variable] === undefined;
        return `${issue.path.map(String).join('.')}: ${isMissing ? 'Required' : issue.message}`;
      }),
    );
  }
  return Object.freeze(result.data);
}
