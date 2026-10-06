import { describe, expect, it } from 'vitest';

import { captureLogs as capture } from '../testing/log-capture.js';

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

  it('drops extra properties that libraries attach to errors', () => {
    const { logger, raw, entries } = capture();
    const error = Object.assign(new Error('Upstream request failed'), {
      code: 'UPSTREAM_ERROR',
      requestBodyValues: { contents: secrets.transcript },
      responseBody: secrets.note,
    });

    logger.error({ err: error }, 'unhandled error');

    expectNoSecrets(raw());
    expect(entries()[0]?.err).toEqual({
      type: 'Error',
      message: 'Upstream request failed',
      code: 'UPSTREAM_ERROR',
      stack: expect.stringContaining('Upstream request failed') as unknown,
    });
  });

  it('keeps the chain of causes, with the same fields only', () => {
    const { logger, raw, entries } = capture();
    const cause = Object.assign(new Error('socket closed'), { payload: secrets.transcript });

    logger.error({ err: new Error('Generation failed', { cause }) }, 'unhandled error');

    expectNoSecrets(raw());
    expect(entries()[0]?.err).toMatchObject({
      message: 'Generation failed',
      cause: { type: 'Error', message: 'socket closed' },
    });
  });

  it('copes with a thrown value that is not an Error', () => {
    const { logger, raw, entries } = capture();

    logger.error({ err: secrets.transcript }, 'unhandled error');

    expectNoSecrets(raw());
    expect(entries()[0]?.err).toEqual({ type: 'string', message: 'A non-Error value was thrown' });
  });
});
