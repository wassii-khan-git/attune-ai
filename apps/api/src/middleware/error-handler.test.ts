import { apiErrorSchema } from '@attune/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '../lib/app-error.js';
import { parseRequest } from '../lib/validation.js';
import { captureLogs } from '../testing/log-capture.js';
import { errorHandler, notFoundHandler, toErrorResponse } from './error-handler.js';
import { requestContext } from './request-context.js';

const SECRET = 'synthetic transcript: chest pain since Tuesday';

/** A minimal app whose only route fails in the way the test asks for. */
function appThatThrows(fail: () => never) {
  const logs = captureLogs();
  const app = express();
  app.use(requestContext(logs.logger));
  app.get('/fail', () => fail());
  app.get('/fail-async', async () => {
    await Promise.resolve();
    fail();
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, logs };
}

describe('error handler', () => {
  it('sends an AppError with its own status, code and message', async () => {
    const { app, logs } = appThatThrows(() => {
      throw new AppError(404, 'NOT_FOUND', 'Visit not found.');
    });

    const response = await request(app).get('/fail');

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body)).toEqual({
      error: { code: 'NOT_FOUND', message: 'Visit not found.' },
    });
    expect(logs.raw()).not.toContain('unhandled error');
    expect(logs.raw()).not.toContain('request refused');
  });

  it('turns rejected request input into a 400 that lists fields without their values', async () => {
    const schema = z.object({ email: z.email(), password: z.string().min(10) });
    const { app } = appThatThrows(() => {
      parseRequest(schema, { email: SECRET, password: 'short' });
      throw new Error('unreachable');
    });

    const response = await request(app).get('/fail');

    expect(response.status).toBe(400);
    const { error } = apiErrorSchema.parse(response.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.map((detail) => detail.path)).toEqual(['email', 'password']);
    expect(response.text).not.toContain(SECRET);
    expect(response.text).not.toContain('short');
  });

  it("treats a schema failure on our own data as a server fault, not the client's", async () => {
    const { app, logs } = appThatThrows(() => {
      // Parsing stored data directly, as the services do, without `parseRequest`.
      z.object({ plan: z.string() }).parse({ plan: 42 });
      throw new Error('unreachable');
    });

    const response = await request(app).get('/fail');

    expect(response.status).toBe(500);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('INTERNAL_ERROR');
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ level: 'error', msg: 'unhandled error' }),
    );
  });

  it('hides an unexpected error from the client and logs it with the request id', async () => {
    const { app, logs } = appThatThrows(() => {
      throw Object.assign(new Error(`connection reset by db.internal while saving ${SECRET}`), {
        payload: SECRET,
      });
    });

    const response = await request(app).get('/fail');

    expect(response.status).toBe(500);
    expect(apiErrorSchema.parse(response.body)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    expect(response.text).not.toContain('db.internal');

    const logged = logs.entries().find((entry) => entry.msg === 'unhandled error');
    expect(logged).toMatchObject({
      level: 'error',
      requestId: response.headers['x-request-id'],
      err: { type: 'Error', message: '[withheld]' },
    });
    expect(logs.raw()).not.toContain(SECRET);
    expect(logs.raw()).not.toContain('db.internal');
  });

  it('handles a rejection from an async handler the same way', async () => {
    const { app } = appThatThrows(() => {
      throw new AppError(404, 'NOT_FOUND', 'Visit not found.');
    });

    const response = await request(app).get('/fail-async');

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('does not treat a thrown non-Error as trustworthy', async () => {
    const { app, logs } = appThatThrows(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- simulating a misbehaving library
      throw SECRET;
    });

    const response = await request(app).get('/fail');

    expect(response.status).toBe(500);
    expect(response.text).not.toContain(SECRET);
    expect(logs.raw()).not.toContain(SECRET);
  });

  it('records why a request was refused, with the account concerned and nothing else', async () => {
    const { app, logs } = appThatThrows(() => {
      throw new AppError(401, 'UNAUTHENTICATED', 'Your session has ended. Sign in again.', {
        reason: 'refresh_token_replayed',
        userId: 'user-123',
      });
    });

    const response = await request(app).get('/fail');

    expect(response.status).toBe(401);
    expect(response.text).not.toContain('refresh_token_replayed');
    expect(response.text).not.toContain('user-123');
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        msg: 'request refused',
        code: 'UNAUTHENTICATED',
        reason: 'refresh_token_replayed',
        userId: 'user-123',
      }),
    );
  });
});

describe('toErrorResponse', () => {
  it('recognises a body-parser error by its status, exposure and type together', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
      expose: true,
    });
    const malformed = Object.assign(new Error('Unexpected token'), {
      type: 'entity.parse.failed',
      status: 400,
      expose: true,
    });

    expect(toErrorResponse(tooLarge)).toMatchObject({ status: 413 });
    expect(toErrorResponse(malformed)).toMatchObject({
      status: 400,
      body: { error: { code: 'BAD_REQUEST' } },
    });
  });

  it('does not mistake an unrelated error with a "type" field for a client error', () => {
    const unrelated = Object.assign(new Error('boom'), { type: 'whatever' });
    const serverSide = Object.assign(new Error('boom'), { type: 'x', status: 502, expose: false });

    expect(toErrorResponse(unrelated).status).toBe(500);
    expect(toErrorResponse(serverSide).status).toBe(500);
  });
});
