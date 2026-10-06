import express, { type Express } from 'express';

import { createHealthController } from './controllers/health.controller.js';
import type { Logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestContext } from './middleware/request-context.js';
import { corsAllowlist, securityHeaders } from './middleware/security.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createHealthService, type ReadinessCheck } from './services/health.service.js';

/** JSON bodies are small (credentials, a note edit). Audio takes a separate multipart route. */
const JSON_BODY_LIMIT = '100kb';

export type AppDependencies = {
  logger: Logger;
  corsAllowedOrigins: readonly string[];
  readinessChecks: readonly ReadinessCheck[];
};

/**
 * Composition root. Builds the Express app without binding a port, so the same
 * app runs under the local Node server, Supertest and the serverless entry point.
 */
export function createApp({
  logger,
  corsAllowedOrigins,
  readinessChecks,
}: AppDependencies): Express {
  const app = express();

  // First, so that every later middleware and every error has a request id and logger.
  app.use(requestContext(logger));
  app.use(securityHeaders());
  app.use(corsAllowlist(corsAllowedOrigins));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const healthService = createHealthService({ checks: readinessChecks });
  app.use(createHealthRouter(createHealthController(healthService)));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
