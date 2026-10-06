import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createHealthRepository } from './repositories/health.repository.js';
import { createPrismaClient } from './repositories/prisma.js';

function loadConfigOrExit(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // The problems name variables and rules, never values.
      createLogger({ level: 'fatal' }).fatal(
        { problems: error.problems },
        'Invalid environment configuration; refusing to start',
      );
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();
const logger = createLogger({ level: config.LOG_LEVEL });

const healthRepository = createHealthRepository(createPrismaClient(config.DATABASE_URL));

const app = createApp({
  logger,
  corsAllowedOrigins: config.CORS_ALLOWED_ORIGINS,
  readinessChecks: [{ name: 'database', run: healthRepository.pingDatabase }],
});

app.listen(config.PORT, (error) => {
  if (error) {
    throw error;
  }
  logger.info({ port: config.PORT }, 'API listening');
});
