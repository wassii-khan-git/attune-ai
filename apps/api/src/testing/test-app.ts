import type { Express } from 'express';

import { createApp, type AppDependencies } from '../app.js';
import { captureLogs, type LogCapture } from './log-capture.js';

export const ALLOWED_ORIGIN = 'https://app.example.com';

export type TestApp = {
  app: Express;
  logs: LogCapture;
};

/** The real app with harmless defaults; pass overrides for the part under test. */
export function createTestApp(overrides: Partial<AppDependencies> = {}): TestApp {
  const logs = captureLogs();
  const app = createApp({
    logger: logs.logger,
    corsAllowedOrigins: [ALLOWED_ORIGIN],
    readinessChecks: [],
    ...overrides,
  });
  return { app, logs };
}
