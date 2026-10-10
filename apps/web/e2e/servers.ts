/**
 * Where the two servers of a browser test listen. Shared by the Playwright
 * configuration, which starts them, and by tests that talk to the API directly.
 */
export const WEB_PORT = 3100;
export const API_PORT = 4100;
export const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
export const API_ORIGIN = `http://localhost:${String(API_PORT)}`;

/**
 * The public address the web app is told it has. A link preview must point
 * there, and not at the address the test happens to reach the app on.
 */
export const SITE_ORIGIN = 'https://attune.example';
