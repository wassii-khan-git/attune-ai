import { describe, expect, it } from 'vitest';

import { formatBytes, formatDateTime, formatDuration, formatWait } from './format';

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

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [42.9, '0:42'],
    [60, '1:00'],
    [300, '5:00'],
    [-3, '0:00'],
  ])('shows %s seconds as "%s"', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 bytes'],
    [1024, '1 KB'],
    [168_000, '164 KB'],
    [1_258_291, '1.2 MB'],
    [4 * 1024 * 1024, '4 MB'],
  ])('shows %s bytes as "%s"', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatDateTime', () => {
  it('shows the date and the time of day in the given locale', () => {
    const text = formatDateTime('2026-10-07T14:30:00', 'en-GB');

    expect(text).toContain('7 Oct 2026');
    expect(text).toContain('14:30');
  });
});
