import { z } from 'zod';

import { SafeError } from '../lib/safe-error.js';

const ENCRYPTION_KEY_BYTES = 32;
const MIN_SECRET_LENGTH = 32;

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

const secret = z.string().min(MIN_SECRET_LENGTH);

/**
 * An optional model id. A blank value counts as unset, because `.env.example`
 * lists every variable and is copied as a starting point.
 */
const optionalModelId = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

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
export const envSchema = z
  .object({
    /**
     * Required, with no default. A deployment that forgot to say it is production
     * must not quietly run with development settings, such as cookies without `Secure`.
     */
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: postgresUrl,

    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
    /** The model for both tasks, unless one of the two below names its own. */
    GEMINI_MODEL: z.string().min(1),
    /**
     * Transcription and note drafting are different jobs, so each can have its
     * own model. Each can also name a fallback: a second model that takes the
     * retry when the first is overloaded or unavailable.
     */
    GEMINI_TRANSCRIBE_MODEL: optionalModelId,
    GEMINI_TRANSCRIBE_FALLBACK_MODEL: optionalModelId,
    GEMINI_NOTE_MODEL: optionalModelId,
    GEMINI_NOTE_FALLBACK_MODEL: optionalModelId,

    ENCRYPTION_KEY: z
      .base64()
      .refine((value) => Buffer.from(value, 'base64').length === ENCRYPTION_KEY_BYTES, {
        error: `Must decode to exactly ${String(ENCRYPTION_KEY_BYTES)} bytes`,
      }),

    JWT_ACCESS_SECRET: secret,

    CORS_ALLOWED_ORIGINS: corsOrigins,

    /**
     * How many reverse proxies sit in front of the API. Rate limiting keys on the
     * client address, which is only correct when this matches the deployment:
     * 0 for a direct connection, 1 behind a platform proxy such as Vercel's.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    CRON_SECRET: secret,

    /**
     * Shared with the web app, which sends it with each request it forwards.
     * When it matches, the API takes the client address from the web app's
     * header. Unset means that header is never believed.
     */
    WEB_PROXY_SECRET: secret.optional(),

    /**
     * Generations allowed per UTC day across all users. The model runs on one
     * shared free-tier key, so this is what stops a single abuser from using it up.
     */
    DAILY_GENERATION_BUDGET: z.coerce.number().int().min(1).max(100_000).default(100),
  })
  // Settings that are fine on a laptop and dangerous on the internet are refused in production.
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    env.CORS_ALLOWED_ORIGINS.forEach((origin, index) => {
      if (!origin.startsWith('https://')) {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ALLOWED_ORIGINS', index],
          message: 'Must be an https origin in production',
        });
      }
    });
    if (env.TRUST_PROXY_HOPS < 1) {
      context.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY_HOPS'],
        message: 'Must be at least 1 in production, or every client shares one rate-limit bucket',
      });
    }
  });

export type Config = Readonly<z.infer<typeof envSchema>>;

/** Which model serves each task, and which one stands in for it when it cannot. */
export function scribeModelIds(config: Config) {
  return {
    transcription: {
      modelId: config.GEMINI_TRANSCRIBE_MODEL ?? config.GEMINI_MODEL,
      fallbackModelId: config.GEMINI_TRANSCRIBE_FALLBACK_MODEL,
    },
    note: {
      modelId: config.GEMINI_NOTE_MODEL ?? config.GEMINI_MODEL,
      fallbackModelId: config.GEMINI_NOTE_FALLBACK_MODEL,
    },
  };
}

export class ConfigError extends SafeError {
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
