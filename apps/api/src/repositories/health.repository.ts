import type { PrismaClient } from './prisma.js';

export type HealthRepository = {
  /** Resolves when the database answers a trivial query; rejects otherwise. */
  pingDatabase: () => Promise<void>;
};

export function createHealthRepository(prisma: PrismaClient): HealthRepository {
  return {
    pingDatabase: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}
