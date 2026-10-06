import bcrypt from 'bcryptjs';

/** About a quarter of a second per hash on current hardware: slow for an attacker, fine for a login. */
export const DEFAULT_BCRYPT_COST = 12;

/** bcrypt reads only the first 72 bytes of its input. */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export type PasswordHasher = {
  hash: (password: string) => Promise<string>;
  verify: (password: string, hash: string) => Promise<boolean>;
};

/**
 * bcrypt through bcryptjs, a pure JavaScript implementation. It needs no native
 * build step, so the same package runs locally, in CI and in a serverless function.
 */
export function createPasswordHasher(cost: number = DEFAULT_BCRYPT_COST): PasswordHasher {
  return {
    hash: (password) => bcrypt.hash(password, cost),
    verify: (password, hash) => bcrypt.compare(password, hash),
  };
}
