import { describe, expect, it } from 'vitest';

import { APP_HOME, safeNextPath } from './navigation';

describe('safeNextPath', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeNextPath('/visits/123?tab=note')).toBe('/visits/123?tab=note');
  });

  it.each([
    ['an absolute URL', 'https://evil.example/login'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash variant', '/\\evil.example'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a relative path', 'visits'],
    ['a control character', '/visits\n//evil.example'],
    ['an empty string', ''],
    ['a repeated parameter', ['/a', '/b']],
    ['nothing', undefined],
  ])('falls back to the app home for %s', (_label, value) => {
    expect(safeNextPath(value)).toBe(APP_HOME);
  });

  it('uses the given fallback', () => {
    expect(safeNextPath('https://evil.example', '/')).toBe('/');
  });
});
