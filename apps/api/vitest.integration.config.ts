import { defineConfig } from 'vitest/config';

/**
 * Tests that need a real PostgreSQL. They run in CI against a service
 * container, and locally only when TEST_DATABASE_URL is set on purpose.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    // One database is shared by every file.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
