import { createAuditRepository, type AuditRepository } from './audit.repository.js';
import type { PrismaClient } from './prisma.js';
import { createRateLimitRepository, type RateLimitRepository } from './rate-limit.repository.js';
import {
  createRefreshTokenRepository,
  type RefreshTokenRepository,
} from './refresh-token.repository.js';
import { createUserRepository, type UserRepository } from './user.repository.js';

/** Everything the app stores, as interfaces. Tests supply in-memory versions. */
export type Repositories = {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  audit: AuditRepository;
  rateLimits: RateLimitRepository;
};

/** The production set, backed by one Prisma client. */
export function createRepositories(prisma: PrismaClient): Repositories {
  return {
    users: createUserRepository(prisma),
    refreshTokens: createRefreshTokenRepository(prisma),
    audit: createAuditRepository(prisma),
    rateLimits: createRateLimitRepository(prisma),
  };
}
