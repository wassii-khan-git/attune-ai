/* eslint-disable no-console -- boot output only, and it carries no request data; the redacting logger replaces it in step 1.4 */
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { createHealthRepository } from './repositories/health.repository.js';
import { createPrismaClient } from './repositories/prisma.js';

function loadConfigOrExit(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();

const healthRepository = createHealthRepository(createPrismaClient(config.DATABASE_URL));

const app = createApp({
  readinessChecks: [{ name: 'database', run: healthRepository.pingDatabase }],
});

app.listen(config.PORT, (error) => {
  if (error) {
    throw error;
  }
  console.info(`API listening on port ${String(config.PORT)}`);
});
