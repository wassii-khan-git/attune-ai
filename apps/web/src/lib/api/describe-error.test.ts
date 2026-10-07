import { describe, expect, it } from 'vitest';

import { describeRequestError } from './describe-error';
import { ApiError } from './errors';

const FALLBACK = 'Your visits could not be loaded. Please try again.';

describe('describeRequestError', () => {
  it('passes on the message about an unreachable server', () => {
    const offline = new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.');

    expect(describeRequestError(offline, FALLBACK)).toBe('Could not reach the server.');
  });

  it('says how long to wait when throttled', () => {
    const throttled = new ApiError(429, 'RATE_LIMITED', 'Too many requests.', [], 180);

    expect(describeRequestError(throttled, FALLBACK)).toBe(
      'Too many requests. Try again in 3 minutes.',
    );
  });

  it('uses the fallback for anything else, and never the raw error', () => {
    const unexpected = new ApiError(500, 'INTERNAL_ERROR', 'stack trace detail');

    expect(describeRequestError(unexpected, FALLBACK)).toBe(FALLBACK);
    expect(describeRequestError(new TypeError('secret detail'), FALLBACK)).toBe(FALLBACK);
  });
});
