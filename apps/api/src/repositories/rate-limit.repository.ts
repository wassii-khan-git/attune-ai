import type { PrismaClient } from './prisma.js';

export type RateLimitRepository = {
  /** Adds one to the counter for this key and window, and returns the new total. */
  increment: (key: string, windowStart: Date) => Promise<number>;
};

export function createRateLimitRepository(prisma: PrismaClient): RateLimitRepository {
  return {
    // A single upsert, so concurrent requests from many instances cannot lose an increment.
    increment: async (key, windowStart) => {
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO rate_limit_buckets (key, window_start, count)
        VALUES (${key}, ${windowStart}, 1)
        ON CONFLICT (key, window_start)
        DO UPDATE SET count = rate_limit_buckets.count + 1
        RETURNING count`;

      const count = rows[0]?.count;
      if (count === undefined) {
        throw new Error('Rate limit upsert returned no row');
      }
      return count;
    },
  };
}
