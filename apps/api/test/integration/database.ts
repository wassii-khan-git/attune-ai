import { createRepositories, type Repositories } from '../../src/repositories/index.js';
import { createPrismaClient, type PrismaClient } from '../../src/repositories/prisma.js';

export type TestDatabase = {
  prisma: PrismaClient;
  repositories: Repositories;
  /** Remembers a user so `cleanUp` removes it and everything that hangs off it. */
  track: (userId: string) => string;
  cleanUp: () => Promise<void>;
};

/**
 * Connects to the database named by TEST_DATABASE_URL, and only that one. The
 * variable is separate from DATABASE_URL so these tests can never run against
 * a real database by accident.
 *
 * The tests do not truncate tables. Each one creates its own rows and
 * `cleanUp` deletes exactly those, so the suite is safe on a shared database.
 * The one thing left behind is a rate-limit counter or two from requests made
 * through the API, which the retention job removes like any other.
 */
export function connectTestDatabase(): TestDatabase {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'Set TEST_DATABASE_URL to a disposable PostgreSQL database to run these tests.',
    );
  }

  const prisma = createPrismaClient(url);
  const userIds: string[] = [];

  return {
    prisma,
    repositories: createRepositories(prisma),
    track: (userId) => {
      userIds.push(userId);
      return userId;
    },
    cleanUp: async () => {
      // Visits, refresh tokens and usage counters go with their user. Audit rows do not.
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.auditEvent.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { resourceId: { in: userIds } }] },
      });
      await prisma.$disconnect();
    },
  };
}

let counter = 0;

/** A unique synthetic address for each call. */
export function uniqueEmail(): string {
  counter++;
  return `it-${String(Date.now())}-${String(counter)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
