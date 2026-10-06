import { describe, expect, it } from 'vitest';

import { createHealthService, type ReadinessCheck } from './health.service.js';

const passing = (name: string): ReadinessCheck => ({ name, run: () => Promise.resolve() });

const failing = (name: string): ReadinessCheck => ({
  name,
  run: () => Promise.reject(new Error('connection refused at db.internal:5432')),
});

const hanging = (name: string): ReadinessCheck => ({
  name,
  run: () => new Promise<void>(() => undefined),
});

describe('health service', () => {
  it('reports liveness without touching any dependency', () => {
    const service = createHealthService({ checks: [failing('database')] });

    expect(service.liveness()).toEqual({ status: 'ok' });
  });

  it('is ready when there are no checks', async () => {
    const service = createHealthService({ checks: [] });

    await expect(service.readiness()).resolves.toEqual({ status: 'ready', checks: {} });
  });

  it('is ready when every check passes', async () => {
    const service = createHealthService({ checks: [passing('database'), passing('cache')] });

    await expect(service.readiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'ok', cache: 'ok' },
    });
  });

  it('is not ready when any check fails, and still reports the others', async () => {
    const service = createHealthService({ checks: [passing('cache'), failing('database')] });

    await expect(service.readiness()).resolves.toEqual({
      status: 'not_ready',
      checks: { cache: 'ok', database: 'failed' },
    });
  });

  it('fails a check that does not answer within the timeout', async () => {
    const service = createHealthService({ checks: [hanging('database')], checkTimeoutMs: 10 });

    await expect(service.readiness()).resolves.toEqual({
      status: 'not_ready',
      checks: { database: 'failed' },
    });
  });

  it('does not expose why a check failed', async () => {
    const service = createHealthService({ checks: [failing('database')] });

    const result = await service.readiness();

    expect(JSON.stringify(result)).not.toContain('db.internal');
  });
});
