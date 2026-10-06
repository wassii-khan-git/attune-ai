import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';
import { requireVerifiedTls } from './database-url.js';

export type { PrismaClient };

/** A dead or unreachable database should fail a request quickly, not hold the function open. */
const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * Builds the one Prisma client of the process. It talks to Postgres through
 * node-postgres, so the same code runs against Neon's pooled endpoint in
 * production and a plain Postgres container in CI.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: requireVerifiedTls(databaseUrl),
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  return new PrismaClient({ adapter });
}
