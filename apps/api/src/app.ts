import express, { type Express } from 'express';

import { createHealthController } from './controllers/health.controller.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createHealthService, type ReadinessCheck } from './services/health.service.js';

export type AppDependencies = {
  readinessChecks: readonly ReadinessCheck[];
};

/**
 * Composition root. Builds the Express app without binding a port, so the same
 * app runs under the local Node server, Supertest and the serverless entry point.
 */
export function createApp({ readinessChecks }: AppDependencies): Express {
  const app = express();

  const healthService = createHealthService({ checks: readinessChecks });
  app.use(createHealthRouter(createHealthController(healthService)));

  return app;
}
