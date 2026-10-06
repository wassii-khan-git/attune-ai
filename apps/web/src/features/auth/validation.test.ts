import { describe, expect, it } from 'vitest';

import { validateLogin, validateRegistration } from './validation';

const valid = { email: 'clinician@example.com', password: 'synthetic-passphrase-1' };

describe('validateRegistration', () => {
  it('accepts valid input and normalises the email', () => {
    expect(validateRegistration({ ...valid, email: '  Clinician@Example.COM ' })).toEqual({
      ok: true,
      data: valid,
    });
  });

  it.each([
    ['an empty email', { ...valid, email: '   ' }, { email: 'Enter your email address.' }],
    [
      'a malformed email',
      { ...valid, email: 'not-an-email' },
      { email: 'Enter a valid email address.' },
    ],
    ['an empty password', { ...valid, password: '' }, { password: 'Enter your password.' }],
    [
      'a short password',
      { ...valid, password: 'too-short' },
      { password: 'Use at least 10 characters.' },
    ],
    [
      'a very long password',
      { ...valid, password: 'x'.repeat(73) },
      { password: 'Use at most 72 characters.' },
    ],
  ])('explains %s', (_label, values, errors) => {
    expect(validateRegistration(values)).toEqual({ ok: false, errors });
  });

  it('reports both fields at once, one message each', () => {
    expect(validateRegistration({ email: '', password: '' })).toEqual({
      ok: false,
      errors: { email: 'Enter your email address.', password: 'Enter your password.' },
    });
  });
});

describe('validateLogin', () => {
  it('does not apply the password rules, so an older, shorter password can still sign in', () => {
    expect(validateLogin({ ...valid, password: 'short' })).toEqual({
      ok: true,
      data: { ...valid, password: 'short' },
    });
  });

  it('still requires both fields', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      ok: false,
      errors: { email: 'Enter your email address.', password: 'Enter your password.' },
    });
  });
});
