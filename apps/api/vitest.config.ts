import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'eval/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/generated/**', 'src/testing/**'],
      reporter: ['text-summary', 'lcov'],
      // The business rules live in the services, so that is where a floor is enforced.
      thresholds: {
        'src/services/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
});
