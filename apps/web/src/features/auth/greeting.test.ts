import { describe, expect, it } from 'vitest';

import { displayName, welcomeFor } from './greeting';

describe('displayName', () => {
  it('calls a guest "Guest"', () => {
    expect(displayName({ email: null })).toBe('Guest');
  });

  it.each([
    ['sam@example.com', 'Sam'],
    ['sam.taylor@example.com', 'Sam'],
    ['sam_taylor@example.com', 'Sam'],
    ['sam-taylor+notes@example.com', 'Sam'],
    ['sam42@example.com', 'Sam'],
    ['.sam@example.com', 'Sam'],
    ['2024@example.com', '2024'],
  ])('takes the first word of %s', (email, name) => {
    expect(displayName({ email })).toBe(name);
  });
});

describe('welcomeFor', () => {
  const createdAt = '2026-10-08T09:00:00.000Z';
  const created = Date.parse(createdAt);
  const account = { email: 'sam.taylor@example.com', isGuest: false, createdAt };

  it('welcomes someone who has just created their account', () => {
    expect(welcomeFor(account, created + 30_000)).toBe('Welcome, Sam');
  });

  it('welcomes them back after that', () => {
    expect(welcomeFor(account, created + 60 * 60 * 1000)).toBe('Welcome back, Sam');
  });

  it('never tells a guest they are back: a guest session is used once', () => {
    const guest = { email: null, isGuest: true, createdAt };

    expect(welcomeFor(guest, created + 60 * 60 * 1000)).toBe('Welcome, Guest');
  });
});
