import { describe, expect, it } from 'vitest';

import { barHeight, createLevelHistory, peakLevel } from './level-meter';

describe('peakLevel', () => {
  it('is 0 for silence, which sits on the centre line', () => {
    expect(peakLevel(new Uint8Array([128, 128, 128]))).toBe(0);
  });

  it('measures the largest swing in either direction', () => {
    expect(peakLevel(new Uint8Array([128, 160, 120]))).toBe(0.25);
    expect(peakLevel(new Uint8Array([128, 64, 140]))).toBe(0.5);
  });

  it('never exceeds 1', () => {
    expect(peakLevel(new Uint8Array([0, 255]))).toBe(1);
  });

  it('is 0 for an empty block', () => {
    expect(peakLevel(new Uint8Array())).toBe(0);
  });
});

describe('barHeight', () => {
  it('lifts quiet speech and keeps the ends fixed', () => {
    expect(barHeight(0)).toBe(0);
    expect(barHeight(0.04)).toBeCloseTo(0.2);
    expect(barHeight(0.25)).toBe(0.5);
    expect(barHeight(1)).toBe(1);
  });

  it('stays inside the display for values outside the range', () => {
    expect(barHeight(-0.5)).toBe(0);
    expect(barHeight(4)).toBe(1);
  });
});

describe('level history', () => {
  it('returns the most recent levels, oldest first', () => {
    const history = createLevelHistory(10);
    [0.1, 0.2, 0.3].forEach(history.push);

    expect(history.latest(2)).toEqual([0.2, 0.3]);
    expect(history.latest(10)).toEqual([0.1, 0.2, 0.3]);
  });

  it('forgets the oldest level once it is full', () => {
    const history = createLevelHistory(2);
    [0.1, 0.2, 0.3].forEach(history.push);

    expect(history.latest(5)).toEqual([0.2, 0.3]);
  });

  it('returns nothing when no bars fit', () => {
    const history = createLevelHistory(2);
    history.push(0.5);

    expect(history.latest(0)).toEqual([]);
  });
});
