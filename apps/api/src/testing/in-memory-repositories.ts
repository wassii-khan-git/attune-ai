import { randomUUID } from 'node:crypto';

import type { AuditRepository, NewAuditEvent } from '../repositories/audit.repository.js';
import type { Repositories } from '../repositories/index.js';
import type { RateLimitRepository } from '../repositories/rate-limit.repository.js';
import type {
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../repositories/refresh-token.repository.js';
import type { UsageRepository } from '../repositories/usage.repository.js';
import {
  EmailTakenError,
  type UserRecord,
  type UserRepository,
} from '../repositories/user.repository.js';
import type {
  VisitRecord,
  VisitRepository,
  VisitSummaryRecord,
} from '../repositories/visit.repository.js';

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

/** `onDelete` stands in for the database's ON DELETE CASCADE. */
export function createInMemoryUserRepository(
  now: () => Date,
  onDelete: (userId: string) => void = () => undefined,
): InMemoryUserRepository {
  const records: UserRecord[] = [];

  const remove = (id: string): boolean => {
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) {
      return false;
    }
    records.splice(index, 1);
    onDelete(id);
    return true;
  };

  const add = (fields: Pick<UserRecord, 'email' | 'passwordHash' | 'isGuest'>): UserRecord => {
    const record: UserRecord = { id: randomUUID(), role: 'USER', createdAt: now(), ...fields };
    records.push(record);
    return record;
  };

  return {
    records,
    remove: (id) => {
      remove(id);
    },
    delete: (id) => Promise.resolve(remove(id)),
    deleteGuestsCreatedBefore: (cutoff) => {
      const expired = records
        .filter((record) => record.isGuest && record.createdAt.getTime() < cutoff.getTime())
        .map((record) => record.id);
      expired.forEach(remove);
      return Promise.resolve(expired);
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
  removeForUser: (userId: string) => void;
};

export function createInMemoryRefreshTokenRepository(): InMemoryRefreshTokenRepository {
  const records: StoredRefreshToken[] = [];
  return {
    records,
    removeForUser: (userId) => {
      removeWhere(records, (record) => record.userId === userId);
    },
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
    deleteExpiredBefore: (cutoff) =>
      Promise.resolve(
        removeWhere(records, (record) => record.expiresAt.getTime() < cutoff.getTime()),
      ),
  };
}

export type InMemoryRateLimitRepository = RateLimitRepository & {
  /** How many counters are currently stored. */
  size: () => number;
};

export function createInMemoryRateLimitRepository(): InMemoryRateLimitRepository {
  const buckets: { key: string; windowStart: number; count: number }[] = [];
  return {
    size: () => buckets.length,
    increment: (key, windowStart) => {
      const startMs = windowStart.getTime();
      let bucket = buckets.find((item) => item.key === key && item.windowStart === startMs);
      if (bucket === undefined) {
        bucket = { key, windowStart: startMs, count: 0 };
        buckets.push(bucket);
      }
      bucket.count++;
      return Promise.resolve(bucket.count);
    },
    deleteWindowsBefore: (cutoff) =>
      Promise.resolve(removeWhere(buckets, (bucket) => bucket.windowStart < cutoff.getTime())),
  };
}

export type InMemoryVisitRepository = VisitRepository & {
  readonly records: readonly VisitRecord[];
  /** Test hook: changes a stored visit directly, as the generation pipeline will. */
  patch: (id: string, changes: Partial<VisitRecord>) => void;
  removeForUser: (userId: string) => void;
};

function toSummaryRecord(record: VisitRecord): VisitSummaryRecord {
  const { id, userId, title, status, consentAt, durationSec, createdAt, updatedAt } = record;
  return { id, userId, title, status, consentAt, durationSec, createdAt, updatedAt };
}

export function createInMemoryVisitRepository(now: () => Date): InMemoryVisitRepository {
  const records: VisitRecord[] = [];
  const owned = (id: string, userId: string): VisitRecord | undefined =>
    records.find((record) => record.id === id && record.userId === userId);

  return {
    records,
    patch: (id, changes) => {
      const record = records.find((candidate) => candidate.id === id);
      if (record !== undefined) {
        Object.assign(record, changes);
      }
    },
    removeForUser: (userId) => {
      removeWhere(records, (record) => record.userId === userId);
    },
    create: (input) => {
      const record: VisitRecord = {
        id: randomUUID(),
        status: 'DRAFT',
        durationSec: null,
        transcriptEnc: null,
        noteEnc: null,
        createdAt: now(),
        updatedAt: now(),
        ...input,
      };
      records.push(record);
      return Promise.resolve(toSummaryRecord(record));
    },
    list: ({ userId, titleContains, after, take }) => {
      const needle = titleContains?.toLowerCase();
      const page = records
        .filter((record) => record.userId === userId)
        .filter((record) => needle === undefined || record.title.toLowerCase().includes(needle))
        .filter(
          (record) =>
            after === undefined ||
            record.createdAt.getTime() < after.createdAt.getTime() ||
            (record.createdAt.getTime() === after.createdAt.getTime() && record.id < after.id),
        )
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )
        .slice(0, take);
      return Promise.resolve(page.map(toSummaryRecord));
    },
    findOwned: (id, userId) => {
      const record = owned(id, userId);
      return Promise.resolve(record === undefined ? null : { ...record });
    },
    updateNoteUnlessProcessing: (id, userId, noteEnc, staleBefore) => {
      const record = owned(id, userId);
      if (record === undefined || isBeingProcessed(record, staleBefore)) {
        return Promise.resolve(null);
      }
      record.noteEnc = noteEnc;
      record.updatedAt = now();
      return Promise.resolve(toSummaryRecord(record));
    },
    claimForProcessing: (id, userId, staleBefore) => {
      const record = owned(id, userId);
      if (record === undefined || isBeingProcessed(record, staleBefore)) {
        return Promise.resolve(false);
      }
      record.status = 'PROCESSING';
      record.updatedAt = now();
      return Promise.resolve(true);
    },
    completeProcessing: (id, userId, result) => {
      const record = owned(id, userId);
      if (record === undefined) {
        return Promise.resolve(null);
      }
      Object.assign(record, result, { status: 'READY', updatedAt: now() });
      return Promise.resolve(toSummaryRecord(record));
    },
    setStatus: (id, userId, status) => {
      const record = owned(id, userId);
      if (record !== undefined) {
        record.status = status;
        record.updatedAt = now();
      }
      return Promise.resolve();
    },
    deleteOwned: (id, userId) =>
      Promise.resolve(
        removeWhere(records, (record) => record.id === id && record.userId === userId) > 0,
      ),
  };
}

function isBeingProcessed(record: VisitRecord, staleBefore: Date): boolean {
  return record.status === 'PROCESSING' && record.updatedAt.getTime() >= staleBefore.getTime();
}

export type InMemoryUsageRepository = UsageRepository & {
  /** Total generations counted for a user across all days. */
  totalFor: (userId: string) => number;
};

export function createInMemoryUsageRepository(): InMemoryUsageRepository {
  const counts = new Map<string, number>();
  return {
    totalFor: (userId) =>
      [...counts.entries()]
        .filter(([key]) => key.startsWith(`${userId}@`))
        .reduce((total, [, count]) => total + count, 0),
    increment: (userId, day) => {
      const key = `${userId}@${day.toISOString().slice(0, 10)}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Promise.resolve(count);
    },
  };
}

/** Removes matching items in place and returns how many were removed. */
function removeWhere<T>(items: T[], matches: (item: T) => boolean): number {
  let removed = 0;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item !== undefined && matches(item)) {
      items.splice(index, 1);
      removed++;
    }
  }
  return removed;
}

export type InMemoryRepositories = Repositories & {
  users: InMemoryUserRepository;
  refreshTokens: InMemoryRefreshTokenRepository;
  audit: InMemoryAuditRepository;
  visits: InMemoryVisitRepository;
  usage: InMemoryUsageRepository;
  rateLimits: InMemoryRateLimitRepository;
};

export function createInMemoryRepositories(now: () => Date): InMemoryRepositories {
  const refreshTokens = createInMemoryRefreshTokenRepository();
  const visits = createInMemoryVisitRepository(now);

  return {
    users: createInMemoryUserRepository(now, (userId) => {
      refreshTokens.removeForUser(userId);
      visits.removeForUser(userId);
    }),
    refreshTokens,
    audit: createInMemoryAuditRepository(),
    rateLimits: createInMemoryRateLimitRepository(),
    visits,
    usage: createInMemoryUsageRepository(),
  };
}
