import { apiErrorSchema, livenessResponseSchema, readinessResponseSchema } from '@attune/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { ALLOWED_ORIGIN, createTestApp } from './testing/test-app.js';

const databaseDown = { name: 'database', run: () => Promise.reject(new Error('down')) };
const databaseUp = { name: 'database', run: () => Promise.resolve() };

describe('GET /health', () => {
  it('returns 200 even when a dependency is down', async () => {
    const { app } = createTestApp({ readinessChecks: [databaseDown] });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(livenessResponseSchema.parse(response.body)).toEqual({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('returns 200 when every dependency is reachable', async () => {
    const { app } = createTestApp({ readinessChecks: [databaseUp] });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(readinessResponseSchema.parse(response.body)).toEqual({
      status: 'ready',
      checks: { database: 'ok' },
    });
  });

  it('returns 503 with the failing check named when a dependency is down', async () => {
    const { app } = createTestApp({ readinessChecks: [databaseDown] });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(readinessResponseSchema.parse(response.body)).toEqual({
      status: 'not_ready',
      checks: { database: 'failed' },
    });
  });
});

describe('error envelope', () => {
  it('answers an unknown route with a JSON 404', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/v1/nothing-here');

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('answers malformed JSON with a 400 that does not echo the body', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{"note": "synthetic secret text"');

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('BAD_REQUEST');
    expect(response.text).not.toContain('synthetic secret text');
  });

  it('answers an oversized JSON body with a 413', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/v1/anything')
      .send({ padding: 'x'.repeat(150_000) });

    expect(response.status).toBe(413);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('security headers', () => {
  it('sets a deny-all content security policy and hides the framework', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health');

    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('lets an allowlisted origin read the response and send credentials', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives any other origin no CORS headers at all', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health').set('Origin', 'https://evil.example.com');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('answers a preflight from an allowlisted origin', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .options('/v1/visits')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE');
  });
});

describe('request ids and request logging', () => {
  it('generates an id, returns it, and logs the request under it', async () => {
    const { app, logs } = createTestApp();

    const response = await request(app).get('/health');

    const requestId = response.headers['x-request-id'];
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(logs.entries()).toEqual([
      expect.objectContaining({
        requestId,
        method: 'GET',
        path: '/health',
        status: 200,
        msg: 'request completed',
      }),
    ]);
  });

  it('reuses a well-formed id sent by the caller', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health').set('X-Request-Id', 'trace-abc-12345');

    expect(response.headers['x-request-id']).toBe('trace-abc-12345');
  });

  it('replaces an id that could be used to forge log lines', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health').set('X-Request-Id', 'x" , "level":"fatal');

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('never logs the query string, headers or body', async () => {
    const { app, logs } = createTestApp();

    await request(app)
      .post('/v1/anything?q=synthetic-search-term')
      .set('Authorization', 'Bearer synthetic-token-value')
      .send({ note: 'synthetic note text' });

    const output = logs.raw();
    expect(output).toContain('"path":"/v1/anything"');
    expect(output).not.toContain('synthetic-search-term');
    expect(output).not.toContain('synthetic-token-value');
    expect(output).not.toContain('synthetic note text');
  });
});
