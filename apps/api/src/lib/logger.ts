import { pino, type DestinationStream, type LevelWithSilent, type Logger } from 'pino';

import { SafeError } from './safe-error.js';

export type { Logger };

const CENSOR = '[REDACTED]';
const MESSAGE_WITHHELD = '[withheld]';

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

/** Machine codes such as `P2003` or `ECONNRESET`. Anything looser could be free text. */
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;
const STACK_FRAME = /^\s+at /;
const MAX_CAUSE_DEPTH = 3;

type SerializedError = {
  type: string;
  message: string;
  stack?: string;
  code?: string;
  status?: number;
  cause?: SerializedError;
};

/** The call sites of a stack trace, without its first lines, which repeat the error's message. */
function stackFrames(stack: string | undefined): string | undefined {
  const frames = stack?.split('\n').filter((line) => STACK_FRAME.test(line));
  return frames === undefined || frames.length === 0 ? undefined : frames.join('\n');
}

function httpStatus(error: Error): number | undefined {
  const { statusCode, status } = error as { statusCode?: unknown; status?: unknown };
  const value = typeof statusCode === 'number' ? statusCode : status;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/**
 * Logs what is needed to find a bug and nothing that could be someone's data.
 *
 * - Extra properties are dropped: library errors often carry the request that
 *   failed (an AI SDK error holds the whole prompt).
 * - The message is kept only for a `SafeError`. Library messages can quote the
 *   data being processed, so for those the type, code, status and stack frames
 *   have to be enough.
 */
export function serializeError(error: unknown, depth = 0): SerializedError {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: 'A non-Error value was thrown' };
  }

  const code = (error as { code?: unknown }).code;
  const status = httpStatus(error);
  const stack = stackFrames(error.stack);

  return {
    type: error.name,
    message: error instanceof SafeError ? error.message : MESSAGE_WITHHELD,
    ...(stack === undefined ? {} : { stack }),
    ...(typeof code === 'string' && ERROR_CODE.test(code) ? { code } : {}),
    ...(status === undefined ? {} : { status }),
    ...(error.cause === undefined || depth >= MAX_CAUSE_DEPTH
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
