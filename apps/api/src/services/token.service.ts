import { createHash, randomBytes } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { AppError } from '../lib/app-error.js';
import type { Role } from '../repositories/user.repository.js';

const ALGORITHM = 'HS256';
const ISSUER = 'attune-api';
const AUDIENCE = 'attune-clients';
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_BYTES = 32;

export type AccessTokenClaims = {
  userId: string;
  role: Role;
  isGuest: boolean;
};

export type IssuedAccessToken = {
  token: string;
  expiresAt: Date;
};

export type IssuedRefreshToken = {
  /** Sent to the client once and never stored. */
  token: string;
  /** What the database keeps. */
  tokenHash: string;
};

export type TokenService = {
  issueAccessToken: (claims: AccessTokenClaims) => Promise<IssuedAccessToken>;
  /** Rejects with a 401 `AppError` for any token that is not valid right now. */
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims>;
  issueRefreshToken: () => IssuedRefreshToken;
  hashRefreshToken: (token: string) => string;
};

export type TokenServiceOptions = {
  accessTokenSecret: string;
  now: () => Date;
};

function isRole(value: unknown): value is Role {
  return value === 'USER' || value === 'ADMIN';
}

function unauthenticated(): AppError {
  return new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
}

/**
 * Access tokens are short-lived signed JWTs, checked without a database call.
 * Refresh tokens are random and opaque; only their SHA-256 is stored, so a
 * database leak does not yield usable sessions. A fast hash is enough because
 * the token is 256 bits of randomness, not a guessable password.
 */
export function createTokenService({ accessTokenSecret, now }: TokenServiceOptions): TokenService {
  const key = new TextEncoder().encode(accessTokenSecret);

  const hashRefreshToken = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

  return {
    issueAccessToken: async ({ userId, role, isGuest }) => {
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_MS);

      const token = await new SignJWT({ role, guest: isGuest })
        .setProtectedHeader({ alg: ALGORITHM })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(key);

      return { token, expiresAt };
    },

    verifyAccessToken: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, {
          // Pinning the algorithm rules out "alg: none" and key-confusion tokens.
          algorithms: [ALGORITHM],
          issuer: ISSUER,
          audience: AUDIENCE,
          currentDate: now(),
        });

        if (
          typeof payload.sub !== 'string' ||
          !isRole(payload.role) ||
          typeof payload.guest !== 'boolean'
        ) {
          throw unauthenticated();
        }
        return { userId: payload.sub, role: payload.role, isGuest: payload.guest };
      } catch {
        // Expired, forged and malformed tokens are indistinguishable to the caller.
        throw unauthenticated();
      }
    },

    issueRefreshToken: () => {
      const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
      return { token, tokenHash: hashRefreshToken(token) };
    },

    hashRefreshToken,
  };
}
