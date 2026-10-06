// Run by the Vercel build (see vercel.json).
//
// Migrations are applied only when building a production deployment. Preview
// builds of branches and pull requests must never change a database schema:
// they may share the production database, and a branch can contain a migration
// that has not been reviewed yet.
import { spawnSync } from 'node:child_process';

const environment = process.env.VERCEL_ENV ?? 'local';

if (environment !== 'production') {
  console.log(`Skipping database migrations: this is a "${environment}" build.`);
  process.exit(0);
}

console.log('Production build: applying database migrations.');
const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
