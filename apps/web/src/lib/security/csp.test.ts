import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy, buildSecurityHeaders } from './csp';

function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split('; ').map((directive) => {
      const [name = '', ...sources] = directive.split(' ');
      return [name, sources];
    }),
  );
}

describe('content security policy', () => {
  const production = directives(
    buildContentSecurityPolicy({ nonce: 'abc123', isDevelopment: false }),
  );

  it("runs only scripts that carry this response's nonce, or that such a script loaded", () => {
    expect(production['script-src']).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it('never allows inline or evaluated scripts in production', () => {
    expect(production['script-src']).not.toContain("'unsafe-inline'");
    expect(production['script-src']).not.toContain("'unsafe-eval'");
  });

  it('lets the page connect only to its own origin', () => {
    expect(production['connect-src']).toEqual(["'self'"]);
  });

  it('forbids framing, plugins and foreign form targets', () => {
    expect(production['frame-ancestors']).toEqual(["'none'"]);
    expect(production['object-src']).toEqual(["'none'"]);
    expect(production['form-action']).toEqual(["'self'"]);
    expect(production['base-uri']).toEqual(["'self'"]);
  });

  it('allows recordings to be played back from memory', () => {
    expect(production['media-src']).toEqual(["'self'", 'blob:']);
  });

  it('upgrades insecure requests in production only', () => {
    const development = directives(buildContentSecurityPolicy({ nonce: 'n', isDevelopment: true }));

    expect(production).toHaveProperty('upgrade-insecure-requests');
    expect(development).not.toHaveProperty('upgrade-insecure-requests');
  });

  it('relaxes only what the development tooling needs', () => {
    const development = directives(buildContentSecurityPolicy({ nonce: 'n', isDevelopment: true }));

    expect(development['script-src']).toContain("'unsafe-eval'");
    expect(development['connect-src']).toEqual(["'self'", 'ws:']);
    expect(development['script-src']).not.toContain("'unsafe-inline'");
  });

  it('uses a different policy for a different nonce', () => {
    expect(buildContentSecurityPolicy({ nonce: 'one', isDevelopment: false })).not.toBe(
      buildContentSecurityPolicy({ nonce: 'two', isDevelopment: false }),
    );
  });
});

describe('security headers', () => {
  it('limits device features to the microphone on this origin', () => {
    const headers = buildSecurityHeaders({ isDevelopment: false });

    expect(headers['Permissions-Policy']).toContain('microphone=(self)');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('sends HSTS in production only', () => {
    expect(buildSecurityHeaders({ isDevelopment: false })).toHaveProperty(
      'Strict-Transport-Security',
    );
    expect(buildSecurityHeaders({ isDevelopment: true })).not.toHaveProperty(
      'Strict-Transport-Security',
    );
  });
});
