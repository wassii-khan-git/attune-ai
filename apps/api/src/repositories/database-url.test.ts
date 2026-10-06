import { describe, expect, it } from 'vitest';

import { requireVerifiedTls } from './database-url.js';

describe('requireVerifiedTls', () => {
  it('upgrades sslmode=require to verify-full and keeps everything else', () => {
    const result = new URL(
      requireVerifiedTls(
        'postgresql://demo:secret@db.example.com:5432/attune?sslmode=require&connect_timeout=5',
      ),
    );

    expect(result.searchParams.get('sslmode')).toBe('verify-full');
    expect(result.searchParams.get('connect_timeout')).toBe('5');
    expect(result.username).toBe('demo');
    expect(result.password).toBe('secret');
    expect(result.host).toBe('db.example.com:5432');
    expect(result.pathname).toBe('/attune');
  });

  it('leaves a URL without sslmode alone, as used by local and CI databases', () => {
    const url = 'postgresql://demo:secret@localhost:5432/attune';

    expect(requireVerifiedTls(url)).toBe(url);
  });

  it('does not weaken or change any other explicit mode', () => {
    const url = 'postgresql://demo:secret@db.example.com/attune?sslmode=verify-full';

    expect(requireVerifiedTls(url)).toBe(url);
    expect(requireVerifiedTls(url.replace('verify-full', 'disable'))).toContain('sslmode=disable');
  });
});
