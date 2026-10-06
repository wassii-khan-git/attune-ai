import { createHash } from 'node:crypto';

import type { RateLimitRepository } from '../repositories/rate-limit.repository.js';

export type RateLimitPolicy = {
  /** Namespaces the counters, so policies do not share a budget. */
  name: string;
  limit: number;
  windowSec: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  /** Seconds until the current window ends. */
  retryAfterSec: number;
};

export type RateLimitService = {
  /** Counts one request from this caller against the policy. */
  consume: (policy: RateLimitPolicy, caller: string) => Promise<RateLimitDecision>;
};

/**
 * Fixed-window counting: simple, and a single atomic upsert per request. A
 * caller can spend up to two windows' worth across a window boundary, which is
 * acceptable for throttling sign-in attempts.
 */
export function createRateLimitService(
  repository: RateLimitRepository,
  now: () => Date,
): RateLimitService {
  return {
    consume: async (policy, caller) => {
      const windowMs = policy.windowSec * 1000;
      const nowMs = now().getTime();
      const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;

      // Hashed so the table holds no raw addresses. This is pseudonymisation, not anonymity.
      const key = createHash('sha256').update(`${policy.name}:${caller}`).digest('hex');
      const count = await repository.increment(key, new Date(windowStartMs));

      return {
        allowed: count <= policy.limit,
        retryAfterSec: Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000)),
      };
    },
  };
}
