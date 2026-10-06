import { createGeminiScribeModel } from './ai/gemini-scribe-model.js';
import { createApp } from './create-app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { installCrashHandlers } from './lib/crash-handlers.js';
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
installCrashHandlers(logger);

const prisma = createPrismaClient(config.DATABASE_URL);
const healthRepository = createHealthRepository(prisma);

const app = createApp({
  logger,
  repositories: createRepositories(prisma),
  readinessChecks: [{ name: 'database', run: healthRepository.pingDatabase }],
  corsAllowedOrigins: config.CORS_ALLOWED_ORIGINS,
  trustProxyHops: config.TRUST_PROXY_HOPS,
  accessTokenSecret: config.JWT_ACCESS_SECRET,
  cronSecret: config.CRON_SECRET,
  ...(config.WEB_PROXY_SECRET === undefined ? {} : { webProxySecret: config.WEB_PROXY_SECRET }),
  fieldEncryptionKey: Buffer.from(config.ENCRYPTION_KEY, 'base64'),
  scribeModel: createGeminiScribeModel({
    apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
    modelId: config.GEMINI_MODEL,
  }),
  secureCookies: config.NODE_ENV !== 'development',
  dailyGenerationBudget: config.DAILY_GENERATION_BUDGET,
});

app.listen(config.PORT, (error) => {
  if (error) {
    throw error;
  }
  logger.info({ port: config.PORT }, 'API listening');
});

export default app;
