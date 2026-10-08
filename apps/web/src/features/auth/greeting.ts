import type { User } from '@attune/shared';

/** For this long after an account is created, its owner is arriving, not coming back. */
const NEW_ACCOUNT_MS = 5 * 60 * 1000;

type Named = Pick<User, 'email'>;

/**
 * What to call someone. An account has no name of its own, only an email
 * address, so this is the first word of the part before the "@": enough for a
 * greeting, and never shown as if it were a fact about the person.
 */
export function displayName({ email }: Named): string {
  if (email === null) {
    return 'Guest';
  }
  const local = email.slice(0, email.indexOf('@'));
  const word = local.split(/[._+-]/).find((part) => part !== '') ?? '';
  // "sam42" reads better as "Sam"; an address that is only digits keeps them.
  const name = word.replace(/\d+$/, '') || word;
  return name === '' ? email : name.charAt(0).toUpperCase() + name.slice(1);
}

/** The heading on the signed-in home page. */
export function welcomeFor(user: Named & Pick<User, 'isGuest' | 'createdAt'>, now: number): string {
  const name = displayName(user);
  const returning = !user.isGuest && now - Date.parse(user.createdAt) > NEW_ACCOUNT_MS;
  return returning ? `Welcome back, ${name}` : `Welcome, ${name}`;
}
