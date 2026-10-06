import { describe, expect, it } from 'vitest';

import { escapeLikePattern } from './like-pattern.js';

describe('escapeLikePattern', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeLikePattern('Knee pain follow-up')).toBe('Knee pain follow-up');
  });

  it('escapes the LIKE wildcards and the escape character itself', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('C:\\notes')).toBe('C:\\\\notes');
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
  });
});
