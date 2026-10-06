import { describe, expect, it } from 'vitest';

import { loadServerEnv } from './server-env';

describe('web server environment', () => {
  it('accepts an API address and reduces it to its origin', () => {
    expect(loadServerEnv({ API_URL: 'http://localhost:4000/' })).toEqual({
      API_URL: 'http://localhost:4000',
    });
  });

  it('refuses to start without an API address', () => {
    expect(() => loadServerEnv({})).toThrow(/API_URL/);
  });

  it('refuses an address that is not http or https', () => {
    expect(() => loadServerEnv({ API_URL: 'ftp://example.com' })).toThrow(/API_URL/);
  });

  it('refuses a proxy secret that is too short, without repeating it', () => {
    const attempt = () =>
      loadServerEnv({ API_URL: 'http://localhost:4000', WEB_PROXY_SECRET: 'short-secret' });

    expect(attempt).toThrow(/WEB_PROXY_SECRET/);
    expect(attempt).not.toThrow(/short-secret/);
  });
});
