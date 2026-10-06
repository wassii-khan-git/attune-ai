/* eslint-disable no-console -- boot output only, and it carries no request data; the redacting logger replaces it in step 1.4 */
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';

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

// The database readiness check is registered when Prisma arrives in step 1.2.
const app = createApp({ readinessChecks: [] });

app.listen(config.PORT, (error) => {
  if (error) {
    throw error;
  }
  console.info(`API listening on port ${String(config.PORT)}`);
});
