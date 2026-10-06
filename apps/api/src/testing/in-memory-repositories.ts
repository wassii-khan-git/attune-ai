import { randomUUID } from 'node:crypto';

import type { AuditRepository, NewAuditEvent } from '../repositories/audit.repository.js';
import type { Repositories } from '../repositories/index.js';
import type { RateLimitRepository } from '../repositories/rate-limit.repository.js';
import type {
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../repositories/refresh-token.repository.js';
import {
  EmailTakenError,
  type UserRecord,
  type UserRepository,
} from '../repositories/user.repository.js';

/**
 * In-memory stand-ins that keep the same contracts as the Prisma repositories,
 * so the whole API can be exercised without a database. The Prisma versions
 * are covered by the integration tests that run against Postgres.
 */

export type InMemoryAuditRepository = AuditRepository & {
  readonly events: readonly NewAuditEvent[];
};

export function createInMemoryAuditRepository(): InMemoryAuditRepository {
  const events: NewAuditEvent[] = [];
  return {
    events,
    insert: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  };
}

export type InMemoryUserRepository = UserRepository & {
  readonly records: readonly UserRecord[];
  remove: (id: string) => void;
};

export function createInMemoryUserRepository(now: () => Date): InMemoryUserRepository {
  const records: UserRecord[] = [];

  const add = (fields: Pick<UserRecord, 'email' | 'passwordHash' | 'isGuest'>): UserRecord => {
    const record: UserRecord = { id: randomUUID(), role: 'USER', createdAt: now(), ...fields };
    records.push(record);
    return record;
  };

  return {
    records,
    remove: (id) => {
      const index = records.findIndex((record) => record.id === id);
      if (index !== -1) {
        records.splice(index, 1);
      }
    },
    createRegistered: ({ email, passwordHash }) => {
      if (records.some((record) => record.email === email)) {
        return Promise.reject(new EmailTakenError());
      }
      return Promise.resolve(add({ email, passwordHash, isGuest: false }));
    },
    createGuest: () => Promise.resolve(add({ email: null, passwordHash: null, isGuest: true })),
    findByEmail: (email) =>
      Promise.resolve(records.find((record) => record.email === email) ?? null),
    findById: (id) => Promise.resolve(records.find((record) => record.id === id) ?? null),
  };
}

type StoredRefreshToken = RefreshTokenRecord & { tokenHash: string };

export type InMemoryRefreshTokenRepository = RefreshTokenRepository & {
  readonly records: readonly StoredRefreshToken[];
};

export function createInMemoryRefreshTokenRepository(): InMemoryRefreshTokenRepository {
  const records: StoredRefreshToken[] = [];
  return {
    records,
    create: (input) => {
      records.push({ id: randomUUID(), revokedAt: null, ...input });
      return Promise.resolve();
    },
    findByHash: (tokenHash) =>
      Promise.resolve(records.find((record) => record.tokenHash === tokenHash) ?? null),
    revokeIfActive: (id, now) => {
      const record = records.find(
        (candidate) => candidate.id === id && candidate.revokedAt === null,
      );
      if (record === undefined) {
        return Promise.resolve(false);
      }
      record.revokedAt = now;
      return Promise.resolve(true);
    },
    revokeAllForUser: (userId, now) => {
      for (const record of records) {
        if (record.userId === userId) {
          record.revokedAt ??= now;
        }
      }
      return Promise.resolve();
    },
  };
}

export function createInMemoryRateLimitRepository(): RateLimitRepository {
  const counts = new Map<string, number>();
  return {
    increment: (key, windowStart) => {
      const bucket = `${key}@${String(windowStart.getTime())}`;
      const count = (counts.get(bucket) ?? 0) + 1;
      counts.set(bucket, count);
      return Promise.resolve(count);
    },
  };
}

export type InMemoryRepositories = Repositories & {
  users: InMemoryUserRepository;
  refreshTokens: InMemoryRefreshTokenRepository;
  audit: InMemoryAuditRepository;
};

export function createInMemoryRepositories(now: () => Date): InMemoryRepositories {
  return {
    users: createInMemoryUserRepository(now),
    refreshTokens: createInMemoryRefreshTokenRepository(),
    audit: createInMemoryAuditRepository(),
    rateLimits: createInMemoryRateLimitRepository(),
  };
}
