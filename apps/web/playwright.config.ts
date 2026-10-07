import { defineConfig } from '@playwright/test';

const WEB_PORT = 3100;
const API_PORT = 4100;
const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
const API_ORIGIN = `http://localhost:${String(API_PORT)}`;
const inCi = process.env.CI !== undefined;

/**
 * The browser test drives the production build of the web app against the
 * API's in-memory test server. Nothing outside this machine is involved: no
 * database, no model key, no network.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  reporter: inCi ? 'github' : 'list',
  use: {
    baseURL: WEB_ORIGIN,
    // The installed Chrome, not the bundled Chromium: the sample recordings are AAC, which only Chrome decodes.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @attune/api e2e:server',
      url: `${API_ORIGIN}/health`,
      env: { PORT: String(API_PORT), WEB_ORIGIN },
      // Always a fresh one: its data lives in memory, and a test must not see another run's.
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${String(WEB_PORT)}`,
      url: WEB_ORIGIN,
      env: { API_URL: API_ORIGIN },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
