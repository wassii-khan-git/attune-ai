import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createHealthRepository } from './repositories/health.repository.js';
import { createRepositories } from './repositories/index.js';
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

const prisma = createPrismaClient(config.DATABASE_URL);
const healthRepository = createHealthRepository(prisma);

const app = createApp({
  logger,
  repositories: createRepositories(prisma),
  readinessChecks: [{ name: 'database', run: healthRepository.pingDatabase }],
  corsAllowedOrigins: config.CORS_ALLOWED_ORIGINS,
  trustProxyHops: config.TRUST_PROXY_HOPS,
  accessTokenSecret: config.JWT_ACCESS_SECRET,
  fieldEncryptionKey: Buffer.from(config.ENCRYPTION_KEY, 'base64'),
  secureCookies: config.NODE_ENV !== 'development',
});

app.listen(config.PORT, (error) => {
  if (error) {
    throw error;
  }
  logger.info({ port: config.PORT }, 'API listening');
});
