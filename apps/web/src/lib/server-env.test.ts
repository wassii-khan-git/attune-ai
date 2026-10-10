import { describe, expect, it } from 'vitest';

import { loadServerEnv } from './server-env';

describe('web server environment', () => {
  it('accepts an API address and reduces it to its origin', () => {
    expect(loadServerEnv({ API_URL: 'http://localhost:4000/' })).toEqual({
      API_URL: 'http://localhost:4000',
      SITE_URL: 'https://attune-ai-web.vercel.app',
    });
  });

  it('takes the deployed demo as the public address of the site unless told otherwise', () => {
    expect(loadServerEnv({ API_URL: 'http://localhost:4000' }).SITE_URL).toBe(
      'https://attune-ai-web.vercel.app',
    );
  });

  it('accepts another public address and reduces it to its origin', () => {
    const env = loadServerEnv({
      API_URL: 'http://localhost:4000',
      SITE_URL: 'https://notes.example.com/welcome?from=share',
    });

    expect(env.SITE_URL).toBe('https://notes.example.com');
  });

  it('refuses a public address that is not an http or https URL', () => {
    expect(() =>
      loadServerEnv({ API_URL: 'http://localhost:4000', SITE_URL: 'notes.example.com' }),
    ).toThrow(/SITE_URL/);
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
