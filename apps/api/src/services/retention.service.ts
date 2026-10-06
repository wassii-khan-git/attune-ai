import type { RetentionReport } from '@attune/shared';

import type { RateLimitRepository } from '../repositories/rate-limit.repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { AuditService } from './audit.service.js';
import { GUEST_LIFETIME_MS } from './auth.service.js';

/** Counters for windows this old can no longer affect any limit. */
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type RetentionService = {
  /**
   * Deletes everything that has outlived its purpose: guest accounts past
   * their lifetime (with their visits and sessions, through the database
   * cascade), expired refresh tokens and old rate-limit counters.
   *
   * Safe to run at any time and any number of times. The scheduler may skip a
   * run or fire one twice; each run simply removes whatever is expired by then.
   */
  purgeExpired: () => Promise<RetentionReport>;
};

export type RetentionServiceDependencies = {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  rateLimits: RateLimitRepository;
  audit: AuditService;
  now: () => Date;
};

export function createRetentionService({
  users,
  refreshTokens,
  rateLimits,
  audit,
  now,
}: RetentionServiceDependencies): RetentionService {
  return {
    purgeExpired: async () => {
      const current = now().getTime();

      const guestIds = await users.deleteGuestsCreatedBefore(new Date(current - GUEST_LIFETIME_MS));
      for (const guestId of guestIds) {
        // No acting user: the system removed the account.
        await audit.record({
          actorId: null,
          action: 'ACCOUNT_DELETED',
          resourceType: 'USER',
          resourceId: guestId,
        });
      }

      return {
        guestAccounts: guestIds.length,
        refreshTokens: await refreshTokens.deleteExpiredBefore(new Date(current)),
        rateLimitBuckets: await rateLimits.deleteWindowsBefore(
          new Date(current - RATE_LIMIT_RETENTION_MS),
        ),
      };
    },
  };
}
