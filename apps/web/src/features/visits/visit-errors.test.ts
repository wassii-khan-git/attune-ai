import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/errors';

import {
  describeDeleteError,
  describeListError,
  describeLoadError,
  describeSaveError,
} from './visit-errors';

const failure = (code: ApiError['code'], message = 'From the API.', retryAfterSec?: number) =>
  new ApiError(400, code, message, [], retryAfterSec);

describe('describeSaveError', () => {
  it.each([
    ['NETWORK_ERROR', true],
    ['RATE_LIMITED', true],
    ['INTERNAL_ERROR', true],
    ['INVALID_RESPONSE', true],
    ['CONFLICT', false],
    ['NOT_FOUND', false],
    ['UNAUTHENTICATED', false],
    ['VALIDATION_ERROR', false],
  ] as const)('for %s, saving again on its own makes sense: %s', (code, retry) => {
    expect(describeSaveError(failure(code)).retry).toBe(retry);
  });

  it('always says the text was not saved, and never shows the raw error', () => {
    const errors = [failure('CONFLICT'), failure('NETWORK_ERROR'), new TypeError('secret detail')];

    for (const error of errors) {
      const { message } = describeSaveError(error);
      expect(message).toMatch(/^Not saved/);
      expect(message).not.toContain('secret');
      expect(message).not.toContain('From the API');
    }
  });

  it('explains that a visit being processed cannot be edited yet', () => {
    expect(describeSaveError(failure('CONFLICT')).message).toMatch(/being processed/);
  });
});

describe('describeLoadError and describeDeleteError', () => {
  it('pass on the connection message', () => {
    const offline = failure('NETWORK_ERROR', 'Could not reach the server.');

    expect(describeLoadError(offline)).toBe('Could not reach the server.');
    expect(describeDeleteError(offline)).toBe('Could not reach the server.');
  });

  it('say how long to wait when throttled', () => {
    const throttled = failure('RATE_LIMITED', 'Too many requests.', 180);

    expect(describeLoadError(throttled)).toBe('Too many requests. Try again in 3 minutes.');
    expect(describeDeleteError(throttled)).toBe('Too many requests. Try again in 3 minutes.');
  });

  it('fall back to a general sentence', () => {
    expect(describeLoadError(new Error('boom'))).toBe(
      'This visit could not be loaded. Please try again.',
    );
    expect(describeDeleteError(failure('INTERNAL_ERROR'))).toBe(
      'This visit could not be deleted. Please try again.',
    );
    expect(describeListError(failure('INTERNAL_ERROR'))).toBe(
      'Your visits could not be loaded. Please try again.',
    );
  });
});
