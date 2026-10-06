import type { PrismaClient } from './prisma.js';

export type UsageRepository = {
  /** Adds one generation to the user's count for that UTC day and returns the new total. */
  increment: (userId: string, day: Date) => Promise<number>;
};

export function createUsageRepository(prisma: PrismaClient): UsageRepository {
  return {
    // One atomic upsert: parallel requests cannot both read "under the limit".
    increment: async (userId, day) => {
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO usage_counters (user_id, date, count)
        VALUES (${userId}::uuid, ${day.toISOString().slice(0, 10)}::date, 1)
        ON CONFLICT (user_id, date)
        DO UPDATE SET count = usage_counters.count + 1
        RETURNING count`;

      const count = rows[0]?.count;
      if (count === undefined) {
        throw new Error('Usage upsert returned no row');
      }
      return count;
    },
  };
}
