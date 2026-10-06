import { describe, expect, it } from 'vitest';

import { buildApiRequestHeaders } from './api-forwarding';

const SECRET = 'test-only-web-proxy-secret-0123456789abc';

describe('headers forwarded to the API', () => {
  it("passes the browser's address and the shared secret", () => {
    const headers = buildApiRequestHeaders(new Headers({ 'x-real-ip': '203.0.113.7' }), SECRET);

    expect(headers.get('x-attune-client-ip')).toBe('203.0.113.7');
    expect(headers.get('x-attune-proxy-secret')).toBe(SECRET);
  });

  it('falls back to the first entry of x-forwarded-for', () => {
    const headers = buildApiRequestHeaders(
      new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
      SECRET,
    );

    expect(headers.get('x-attune-client-ip')).toBe('203.0.113.7');
  });

  it('discards values a visitor tried to supply for the trusted headers', () => {
    const fromBrowser = new Headers({
      'x-real-ip': '203.0.113.7',
      'x-attune-client-ip': '198.51.100.1',
      'x-attune-proxy-secret': 'a-guess',
    });

    const headers = buildApiRequestHeaders(fromBrowser, SECRET);

    expect(headers.get('x-attune-client-ip')).toBe('203.0.113.7');
    expect(headers.get('x-attune-proxy-secret')).toBe(SECRET);
  });

  it("sends neither header when no secret is configured, and still strips the visitor's", () => {
    const fromBrowser = new Headers({
      'x-real-ip': '203.0.113.7',
      'x-attune-client-ip': '198.51.100.1',
      'x-attune-proxy-secret': 'a-guess',
    });

    const headers = buildApiRequestHeaders(fromBrowser, undefined);

    expect(headers.has('x-attune-client-ip')).toBe(false);
    expect(headers.has('x-attune-proxy-secret')).toBe(false);
  });

  it('leaves the origin, cookies and content type exactly as the browser sent them', () => {
    const fromBrowser = new Headers({
      origin: 'https://app.example.com',
      cookie: 'attune_access=abc; attune_refresh=def',
      'content-type': 'application/json',
    });

    const headers = buildApiRequestHeaders(fromBrowser, SECRET);

    expect(headers.get('origin')).toBe('https://app.example.com');
    expect(headers.get('cookie')).toBe('attune_access=abc; attune_refresh=def');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('omits the address when the platform reported none', () => {
    const headers = buildApiRequestHeaders(new Headers(), SECRET);

    expect(headers.has('x-attune-client-ip')).toBe(false);
    expect(headers.get('x-attune-proxy-secret')).toBe(SECRET);
  });
});
