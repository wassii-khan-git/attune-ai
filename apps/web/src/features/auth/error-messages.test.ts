import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/errors';

import { describeAuthError } from './error-messages';

describe('describeAuthError', () => {
  it('reports wrong credentials on the form, not on a field, so neither field is singled out', () => {
    expect(describeAuthError(new ApiError(401, 'INVALID_CREDENTIALS', 'x'))).toEqual({
      form: 'Email or password is incorrect.',
    });
  });

  it('puts a taken email on the email field and says what to do', () => {
    expect(describeAuthError(new ApiError(409, 'EMAIL_TAKEN', 'x'))).toEqual({
      fields: { email: 'An account with this email already exists. Sign in instead.' },
    });
  });

  it('says how long to wait when throttled', () => {
    expect(describeAuthError(new ApiError(429, 'RATE_LIMITED', 'x', [], 240))).toEqual({
      form: 'Too many attempts. Try again in 4 minutes.',
    });
  });

  it('maps field problems reported by the server onto the fields', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'The request is not valid.', [
      { path: 'password', message: 'Too long: must be at most 72 bytes' },
      { path: 'unknown', message: 'ignored' },
    ]);

    expect(describeAuthError(error)).toEqual({
      fields: { password: 'Too long: must be at most 72 bytes' },
    });
  });

  it('falls back to the server message when no known field is named', () => {
    expect(
      describeAuthError(new ApiError(400, 'VALIDATION_ERROR', 'The request is not valid.')),
    ).toEqual({
      form: 'The request is not valid.',
    });
  });

  it('passes on the connection message', () => {
    expect(
      describeAuthError(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.')),
    ).toEqual({
      form: 'Could not reach the server.',
    });
  });

  it('never shows the text of an unexpected error', () => {
    expect(describeAuthError(new ApiError(500, 'INTERNAL_ERROR', 'stack trace here'))).toEqual({
      form: 'Something went wrong. Please try again.',
    });
    expect(describeAuthError(new TypeError('cannot read properties of undefined'))).toEqual({
      form: 'Something went wrong. Please try again.',
    });
  });
});
