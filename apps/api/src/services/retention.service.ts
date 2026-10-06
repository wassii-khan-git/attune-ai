import type { RetentionReport } from '@attune/shared';

import type { RateLimitRepository } from '../repositories/rate-limit.repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import type { RetentionRepository } from '../repositories/retention.repository.js';
import { GUEST_LIFETIME_MS } from './auth.service.js';

/** Counters for windows this old can no longer affect any limit. */
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type RetentionService = {
  /**
   * Deletes everything that has outlived its purpose: guest accounts past
   * their lifetime (with their visits and sessions, through the database
   * cascade), expired refresh tokens and old rate-limit counters. Each deleted
   * account gets an audit row in the same statement that removes it.
   *
   * Safe to run at any time and any number of times. The scheduler may skip a
   * run or fire one twice; each run simply removes whatever is expired by then.
   */
  purgeExpired: () => Promise<RetentionReport>;
};

export type RetentionServiceDependencies = {
  retention: RetentionRepository;
  refreshTokens: RefreshTokenRepository;
  rateLimits: RateLimitRepository;
  now: () => Date;
};

export function createRetentionService({
  retention,
  refreshTokens,
  rateLimits,
  now,
}: RetentionServiceDependencies): RetentionService {
  return {
    purgeExpired: async () => {
      const current = now().getTime();

      return {
        guestAccounts: await retention.purgeGuestsCreatedBefore(
          new Date(current - GUEST_LIFETIME_MS),
        ),
        refreshTokens: await refreshTokens.deleteExpiredBefore(new Date(current)),
        rateLimitBuckets: await rateLimits.deleteWindowsBefore(
          new Date(current - RATE_LIMIT_RETENTION_MS),
        ),
      };
    },
  };
}
