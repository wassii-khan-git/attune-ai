import { describe, expect, it } from 'vitest';

import { captureLogs as capture } from '../testing/log-capture.js';
import { SafeError } from './safe-error.js';

// Synthetic values that must never appear in log output.
const secrets = {
  password: 'correct-horse-battery',
  refreshToken: 'rt_3f9c1d7a',
  authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
  cookie: 'attune_refresh=rt_3f9c1d7a',
  email: 'synthetic.patient@example.com',
  transcript: 'Doctor: what brings you in? Patient: chest pain since Tuesday.',
  note: 'Assessment: suspected angina.',
  title: 'Follow-up for chest pain',
};

function expectNoSecrets(output: string): void {
  for (const value of Object.values(secrets)) {
    expect(output).not.toContain(value);
  }
}

/** A library error whose message quotes the data it was handling, as several real ones do. */
function libraryError(name: string, quoted: string, extra: object = {}): Error {
  const error = Object.assign(new Error(`Type validation failed: Value: ${quoted}`), extra);
  error.name = name;
  return error;
}

describe('logger', () => {
  it('writes structured lines with a readable level and timestamp', () => {
    const { logger, entries } = capture();

    logger.info({ requestId: 'req-1' }, 'request completed');

    expect(entries()).toEqual([
      expect.objectContaining({
        level: 'info',
        service: 'attune-api',
        requestId: 'req-1',
        msg: 'request completed',
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
      }),
    ]);
  });

  it('redacts sensitive keys at the top level', () => {
    const { logger, raw, entries } = capture();

    logger.info({ ...secrets, visitId: 'v-1' }, 'top level');

    expectNoSecrets(raw());
    expect(entries()[0]).toMatchObject({ visitId: 'v-1', password: '[REDACTED]' });
  });

  it('redacts sensitive keys nested inside other objects', () => {
    const { logger, raw } = capture();

    logger.info({ user: secrets, req: { headers: secrets } }, 'nested');

    expectNoSecrets(raw());
  });

  it('redacts a whole request body rather than trusting its contents', () => {
    const { logger, raw } = capture();

    logger.info({ body: { anything: secrets.transcript } }, 'body');
    logger.info({ req: { body: { anything: secrets.note } } }, 'nested body');

    expectNoSecrets(raw());
  });
});

describe('logging errors', () => {
  it('keeps the message of an error this codebase wrote', () => {
    const { logger, entries } = capture();

    logger.error({ err: new SafeError('The model request failed (HTTP 503)') }, 'failed');

    expect(entries()[0]?.err).toMatchObject({
      type: 'SafeError',
      message: 'The model request failed (HTTP 503)',
    });
  });

  it('withholds the message of a library error, which may quote the data it was handling', () => {
    const { logger, raw, entries } = capture();

    logger.error({ err: libraryError('AI_TypeValidationError', secrets.transcript) }, 'failed');

    expectNoSecrets(raw());
    expect(entries()[0]?.err).toMatchObject({
      type: 'AI_TypeValidationError',
      message: '[withheld]',
    });
  });

  it('logs stack frames without the first line, which repeats the message', () => {
    const { logger, raw, entries } = capture();

    logger.error({ err: libraryError('SyntaxError', secrets.note) }, 'failed');

    const { stack } = entries()[0]?.err as { stack: string };
    expectNoSecrets(raw());
    expect(stack).toMatch(/^\s+at /);
    expect(stack).toContain('logger.test');
  });

  it('withholds a multi-line message in full', () => {
    const { logger, raw } = capture();

    logger.error(
      { err: new Error(`Invalid invocation:\n\n{\n  title: "${secrets.title}"\n}`) },
      'failed',
    );

    expectNoSecrets(raw());
  });

  it('drops extra properties that libraries attach to errors', () => {
    const { logger, raw, entries } = capture();
    const error = libraryError('AI_APICallError', 'n/a', {
      requestBodyValues: { contents: secrets.transcript },
      responseBody: secrets.note,
    });

    logger.error({ err: error }, 'failed');

    expectNoSecrets(raw());
    expect(Object.keys(entries()[0]?.err as object).sort()).toEqual(['message', 'stack', 'type']);
  });

  it('keeps what identifies a failure: a machine code and an HTTP status', () => {
    const { logger, entries } = capture();

    logger.error(
      { err: libraryError('PrismaClientKnownRequestError', 'x', { code: 'P2003' }) },
      'a',
    );
    logger.error({ err: libraryError('AI_APICallError', 'x', { statusCode: 503 }) }, 'b');

    expect(entries()[0]?.err).toMatchObject({ code: 'P2003' });
    expect(entries()[1]?.err).toMatchObject({ status: 503 });
  });

  it('ignores a code that is free text rather than a machine code', () => {
    const { logger, raw } = capture();

    logger.error({ err: libraryError('Error', 'x', { code: secrets.transcript }) }, 'failed');

    expectNoSecrets(raw());
  });

  it('applies the same rules down the chain of causes', () => {
    const { logger, raw, entries } = capture();
    const cause = libraryError('AI_JSONParseError', secrets.transcript, { text: secrets.note });

    logger.error({ err: new SafeError('The model returned an unusable response', { cause }) }, 'x');

    expectNoSecrets(raw());
    expect(entries()[0]?.err).toMatchObject({
      message: 'The model returned an unusable response',
      cause: { type: 'AI_JSONParseError', message: '[withheld]' },
    });
  });

  it('copes with a thrown value that is not an Error', () => {
    const { logger, raw, entries } = capture();

    logger.error({ err: secrets.transcript }, 'failed');

    expectNoSecrets(raw());
    expect(entries()[0]?.err).toEqual({ type: 'string', message: 'A non-Error value was thrown' });
  });
});
