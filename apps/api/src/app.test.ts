import { livenessResponseSchema, readinessResponseSchema } from '@attune/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('GET /health', () => {
  it('returns 200 even when a dependency is down', async () => {
    const app = createApp({
      readinessChecks: [{ name: 'database', run: () => Promise.reject(new Error('down')) }],
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(livenessResponseSchema.parse(response.body)).toEqual({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('returns 200 when every dependency is reachable', async () => {
    const app = createApp({
      readinessChecks: [{ name: 'database', run: () => Promise.resolve() }],
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(readinessResponseSchema.parse(response.body)).toEqual({
      status: 'ready',
      checks: { database: 'ok' },
    });
  });

  it('returns 503 with the failing check named when a dependency is down', async () => {
    const app = createApp({
      readinessChecks: [{ name: 'database', run: () => Promise.reject(new Error('down')) }],
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(readinessResponseSchema.parse(response.body)).toEqual({
      status: 'not_ready',
      checks: { database: 'failed' },
    });
  });
});
