import { createApp } from '../create-app.js';
import { createLogger } from '../lib/logger.js';
import { createFakeScribeModel } from './fake-scribe-model.js';
import { createInMemoryRepositories } from './in-memory-repositories.js';
import {
  TEST_ACCESS_TOKEN_SECRET,
  TEST_CRON_SECRET,
  TEST_FIELD_ENCRYPTION_KEY,
} from './test-app.js';

/**
 * The whole API with nothing behind it: storage in memory, and a scripted
 * model in place of the real one.
 *
 * The web app's browser test runs against this server. It needs no database
 * and no model key, calls no outside service, and forgets everything when it
 * stops. It is never part of a deployment: `src/testing` is left out of the build.
 */
const port = Number(process.env.PORT ?? 4100);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3100';

const logger = createLogger({ level: 'info' });
const now = (): Date => new Date();

const app = createApp({
  logger,
  repositories: createInMemoryRepositories(now),
  readinessChecks: [],
  corsAllowedOrigins: [webOrigin],
  trustProxyHops: 0,
  accessTokenSecret: TEST_ACCESS_TOKEN_SECRET,
  cronSecret: TEST_CRON_SECRET,
  fieldEncryptionKey: TEST_FIELD_ENCRYPTION_KEY,
  scribeModel: createFakeScribeModel(),
  secureCookies: false,
  dailyGenerationBudget: 1_000,
  // The lowest cost bcrypt allows: nothing here protects a real password.
  passwordHashCost: 4,
  now,
});

app.listen(port, (error) => {
  if (error) {
    throw error;
  }
  logger.info({ port, webOrigin }, 'In-memory API for browser tests listening');
});
