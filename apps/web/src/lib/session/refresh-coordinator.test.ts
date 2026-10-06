import type { AuthResponse } from '@attune/shared';
import { describe, expect, it, vi } from 'vitest';

import { createRefreshCoordinator } from './refresh-coordinator';
import { createMemorySessionStore } from './testing';

const NOW = Date.parse('2026-01-15T09:00:00.000Z');
const MINUTE = 60_000;

function sessionExpiringAt(epochMs: number): AuthResponse {
  return {
    user: {
      id: '0199a8f2-0000-7000-8000-000000000001',
      email: 'clinician@example.com',
      role: 'USER',
      isGuest: false,
      createdAt: new Date(NOW).toISOString(),
    },
    accessTokenExpiresAt: new Date(epochMs).toISOString(),
  };
}

/** A stand-in for the Web Locks API: one holder at a time, in order. */
function fakeLocks() {
  let queue = Promise.resolve();
  return {
    request: vi.fn((_name: string, callback: () => Promise<unknown>) => {
      const result = queue.then(callback);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }) as unknown as LockManager['request'],
  };
}

describe('refresh coordinator', () => {
  it('renews the session and records the new expiry for every tab', async () => {
    const store = createMemorySessionStore();
    const refresh = vi.fn(() => Promise.resolve(sessionExpiringAt(NOW + 15 * MINUTE)));
    const coordinator = createRefreshCoordinator({ refresh, store, now: () => NOW });

    const outcome = await coordinator.run(null);

    expect(outcome.status).toBe('refreshed');
    expect(store.getAccessExpiry()).toBe(NOW + 15 * MINUTE);
  });

  it('shares one attempt between callers in the same tab', async () => {
    const store = createMemorySessionStore();
    const refresh = vi.fn(() => Promise.resolve(sessionExpiringAt(NOW + 15 * MINUTE)));
    const coordinator = createRefreshCoordinator({ refresh, store, now: () => NOW });

    await Promise.all([coordinator.run(null), coordinator.run(null), coordinator.run(null)]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when another tab has already renewed the session', async () => {
    const store = createMemorySessionStore();
    const expired = NOW - MINUTE;
    // Another tab refreshed after this tab last looked.
    store.setAccessExpiry(NOW + 14 * MINUTE);
    const refresh = vi.fn(() => Promise.resolve(sessionExpiringAt(NOW + 15 * MINUTE)));
    const coordinator = createRefreshCoordinator({ refresh, store, now: () => NOW });

    const outcome = await coordinator.run(expired);

    expect(outcome).toEqual({ status: 'already-fresh', accessExpiresAt: NOW + 14 * MINUTE });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('still renews when the stored expiry is the one this tab already knows to be stale', async () => {
    const store = createMemorySessionStore();
    store.setAccessExpiry(NOW + 10 * MINUTE);
    const refresh = vi.fn(() => Promise.resolve(sessionExpiringAt(NOW + 15 * MINUTE)));
    const coordinator = createRefreshCoordinator({ refresh, store, now: () => NOW });

    // The server said 401 although the stored expiry looked fine: trust the server.
    await coordinator.run(NOW + 10 * MINUTE);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not count a session about to expire as fresh', async () => {
    const store = createMemorySessionStore();
    store.setAccessExpiry(NOW + 10_000);
    const refresh = vi.fn(() => Promise.resolve(sessionExpiringAt(NOW + 15 * MINUTE)));
    const coordinator = createRefreshCoordinator({ refresh, store, now: () => NOW });

    await coordinator.run(null);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('makes two tabs take turns, so the second finds the work done', async () => {
    const store = createMemorySessionStore();
    const locks = fakeLocks();
    const refresh = vi.fn(() => Promise.resolve(sessionExpiringAt(NOW + 15 * MINUTE)));
    const tabA = createRefreshCoordinator({ refresh, store, now: () => NOW, locks });
    const tabB = createRefreshCoordinator({ refresh, store, now: () => NOW, locks });

    const [first, second] = await Promise.all([tabA.run(null), tabB.run(null)]);

    expect(first.status).toBe('refreshed');
    expect(second.status).toBe('already-fresh');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('passes a refused renewal on to the caller and can be used again', async () => {
    const store = createMemorySessionStore();
    const refresh = vi
      .fn<() => Promise<AuthResponse>>()
      .mockRejectedValueOnce(new Error('401'))
      .mockResolvedValueOnce(sessionExpiringAt(NOW + 15 * MINUTE));
    const coordinator = createRefreshCoordinator({ refresh, store, now: () => NOW });

    await expect(coordinator.run(null)).rejects.toThrow('401');
    await expect(coordinator.run(null)).resolves.toMatchObject({ status: 'refreshed' });
  });
});
