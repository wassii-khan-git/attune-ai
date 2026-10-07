import { describe, expect, it } from 'vitest';

import { recorderProblem } from './recorder-session';

describe('recorderProblem', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-microphone'],
    ['OverconstrainedError', 'no-microphone'],
    ['NotReadableError', 'failed'],
  ])('sorts %s as %s', (name, expected) => {
    expect(recorderProblem(new DOMException('refused', name))).toBe(expected);
  });

  it('treats anything else as a general failure', () => {
    expect(recorderProblem(new Error('boom'))).toBe('failed');
    expect(recorderProblem(undefined)).toBe('failed');
  });
});
