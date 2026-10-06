import type { Express } from 'express';

import { createApp, type AppDependencies } from '../app.js';
import { createInMemoryRepositories, type InMemoryRepositories } from './in-memory-repositories.js';
import { captureLogs, type LogCapture } from './log-capture.js';

export const ALLOWED_ORIGIN = 'https://app.example.com';
export const TEST_ACCESS_TOKEN_SECRET = 'test-only-access-token-secret-0123456789';

export type TestClock = {
  now: () => Date;
  /** Moves the clock forward. */
  advance: (ms: number) => void;
};

export function createTestClock(start = new Date('2026-01-15T09:00:00.000Z')): TestClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms;
    },
  };
}

export type TestApp = {
  app: Express;
  logs: LogCapture;
  repositories: InMemoryRepositories;
  clock: TestClock;
};

/** The real app on in-memory storage, with harmless defaults; pass overrides for the part under test. */
export function createTestApp(overrides: Partial<AppDependencies> = {}): TestApp {
  const logs = captureLogs();
  const clock = createTestClock();
  const repositories = createInMemoryRepositories(clock.now);

  const app = createApp({
    logger: logs.logger,
    repositories,
    readinessChecks: [],
    corsAllowedOrigins: [ALLOWED_ORIGIN],
    trustProxyHops: 0,
    accessTokenSecret: TEST_ACCESS_TOKEN_SECRET,
    secureCookies: false,
    // The lowest cost bcrypt allows keeps the suite fast.
    passwordHashCost: 4,
    now: clock.now,
    ...overrides,
  });

  return { app, logs, repositories, clock };
}
