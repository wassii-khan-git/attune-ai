import { describe, expect, it } from 'vitest';

import { createInMemoryRateLimitRepository } from '../testing/in-memory-repositories.js';
import { createTestClock } from '../testing/test-app.js';
import { createRateLimitService } from './rate-limit.service.js';

const policy = { name: 'test', limit: 3, windowSec: 60 };

describe('rate limit service', () => {
  it('allows requests up to the limit and refuses the next one', async () => {
    const service = createRateLimitService(
      createInMemoryRateLimitRepository(),
      createTestClock().now,
    );

    const decisions = [];
    for (let i = 0; i < 4; i++) {
      decisions.push((await service.consume(policy, '203.0.113.5')).allowed);
    }

    expect(decisions).toEqual([true, true, true, false]);
  });

  it('reports the time left in the window', async () => {
    // 20 seconds into a 60 second window.
    const clock = createTestClock(new Date('2026-01-15T09:00:20.000Z'));
    const service = createRateLimitService(createInMemoryRateLimitRepository(), clock.now);

    expect((await service.consume(policy, '203.0.113.5')).retryAfterSec).toBe(40);
  });

  it('starts a fresh count in the next window', async () => {
    const clock = createTestClock();
    const service = createRateLimitService(createInMemoryRateLimitRepository(), clock.now);
    for (let i = 0; i < 4; i++) {
      await service.consume(policy, '203.0.113.5');
    }

    clock.advance(60_000);

    expect((await service.consume(policy, '203.0.113.5')).allowed).toBe(true);
  });

  it('keeps callers and policies apart', async () => {
    const service = createRateLimitService(
      createInMemoryRateLimitRepository(),
      createTestClock().now,
    );
    for (let i = 0; i < 4; i++) {
      await service.consume(policy, '203.0.113.5');
    }

    expect((await service.consume(policy, '203.0.113.6')).allowed).toBe(true);
    expect((await service.consume({ ...policy, name: 'other' }, '203.0.113.5')).allowed).toBe(true);
  });

  it('stores a hash, not the caller address', async () => {
    const keys: string[] = [];
    const service = createRateLimitService(
      {
        increment: (key) => {
          keys.push(key);
          return Promise.resolve(1);
        },
        deleteWindowsBefore: () => Promise.resolve(0),
      },
      createTestClock().now,
    );

    await service.consume(policy, '203.0.113.5');

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[0]).not.toContain('203.0.113.5');
  });
});
