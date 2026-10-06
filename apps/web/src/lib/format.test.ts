import { describe, expect, it } from 'vitest';

import { formatWait } from './format';

describe('formatWait', () => {
  it.each([
    [undefined, 'a minute'],
    [5, 'a minute'],
    [60, 'a minute'],
    [61, '2 minutes'],
    [300, '5 minutes'],
    [3540, '59 minutes'],
    [3600, 'an hour'],
    [3601, '2 hours'],
  ])('describes %s seconds as "%s"', (seconds, expected) => {
    expect(formatWait(seconds)).toBe(expected);
  });
});
