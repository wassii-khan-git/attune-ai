/**
 * Where the two servers of a browser test listen. Shared by the Playwright
 * configuration, which starts them, and by tests that talk to the API directly.
 */
export const WEB_PORT = 3100;
export const API_PORT = 4100;
export const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
export const API_ORIGIN = `http://localhost:${String(API_PORT)}`;
