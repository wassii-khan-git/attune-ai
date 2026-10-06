import { apiErrorSchema } from '@attune/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '../lib/app-error.js';
import { captureLogs } from '../testing/log-capture.js';
import { errorHandler, notFoundHandler } from './error-handler.js';
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
  });

  it('turns a Zod failure into a 400 that lists fields without their values', async () => {
    const schema = z.object({ email: z.email(), password: z.string().min(10) });
    const { app } = appThatThrows(() => {
      schema.parse({ email: SECRET, password: 'short' });
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

  it('hides an unexpected error from the client and logs it with the request id', async () => {
    const { app, logs } = appThatThrows(() => {
      throw Object.assign(new Error('connection reset by db.internal'), { payload: SECRET });
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
      err: { type: 'Error', message: 'connection reset by db.internal' },
    });
    expect(logs.raw()).not.toContain(SECRET);
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
});
