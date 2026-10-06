import { pino, type DestinationStream, type LevelWithSilent, type Logger } from 'pino';

export type { Logger };

const CENSOR = '[REDACTED]';

/**
 * Keys that may hold credentials or PHI. The rule is still "never hand these to
 * the logger"; redaction is the safety net for the day someone does.
 */
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'tokenHash',
  'authorization',
  'cookie',
  'set-cookie',
  'email',
  'title',
  'transcript',
  'transcriptEnc',
  'note',
  'noteEnc',
  'audio',
  'body',
  'prompt',
] as const;

/** pino has no "any depth" wildcard, so each key is listed for the top three levels. */
const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => {
  const property = `["${key}"]`;
  return [property, `*${property}`, `*.*${property}`];
});

type SerializedError = {
  type: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: SerializedError;
};

/**
 * Logs what is needed to find a bug and nothing else. Library errors often
 * carry the request that failed as extra properties (an AI SDK error holds the
 * whole prompt), so only a fixed set of fields is copied.
 */
export function serializeError(error: unknown, depth = 0): SerializedError {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: 'A non-Error value was thrown' };
  }

  const code = (error as { code?: unknown }).code;
  return {
    type: error.name,
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(typeof code === 'string' ? { code } : {}),
    ...(error.cause === undefined || depth >= 3
      ? {}
      : { cause: serializeError(error.cause, depth + 1) }),
  };
}

export type LoggerOptions = {
  level: LevelWithSilent;
  /** Where to write. Defaults to stdout; tests pass an in-memory stream. */
  destination?: DestinationStream;
};

export function createLogger({ level, destination }: LoggerOptions): Logger {
  return pino(
    {
      level,
      base: { service: 'attune-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: REDACT_PATHS, censor: CENSOR },
      serializers: { err: (error: unknown) => serializeError(error) },
    },
    destination,
  );
}
