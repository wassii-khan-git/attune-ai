import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env on its own. The file is absent in CI and on
// Vercel, where the same variables come from the environment instead.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Migrations run over the direct connection: they need session-level features
// that the pooled connection used by the running API does not offer.
// `prisma generate` needs no database, so the URL is optional here.
const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
